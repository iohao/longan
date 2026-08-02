use rusqlite::Connection;
use std::path::Path;
use std::sync::Mutex;

use crate::error::AppResult;

pub mod repo;

/// App-wide DB handle. rusqlite connections are not Sync, so guard with a Mutex.
pub struct Db {
    pub conn: Mutex<Connection>,
}

impl Db {
    pub fn open(db_file: &Path) -> AppResult<Self> {
        if let Some(parent) = db_file.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let conn = Connection::open(db_file)?;
        conn.pragma_update(None, "journal_mode", "WAL")?;
        conn.pragma_update(None, "foreign_keys", "ON")?;
        init_db(&conn)?;
        Ok(Self {
            conn: Mutex::new(conn),
        })
    }

    #[allow(dead_code)]
    pub fn open_in_memory() -> AppResult<Self> {
        let conn = Connection::open_in_memory()?;
        conn.pragma_update(None, "foreign_keys", "ON")?;
        init_db(&conn)?;
        Ok(Self {
            conn: Mutex::new(conn),
        })
    }
}

/// Run `f` inside a SQLite transaction: commits on Ok, rolls back on Err.
/// Uses `unchecked_transaction` because callers only hold `&Connection` behind
/// the Db mutex; that mutex provides the single-writer guarantee rusqlite
/// would otherwise enforce via `&mut`. Do not nest calls (no nested BEGIN).
pub fn with_tx<T>(
    conn: &Connection,
    f: impl FnOnce(&Connection) -> AppResult<T>,
) -> AppResult<T> {
    let tx = conn.unchecked_transaction()?;
    let out = f(&tx)?; // Transaction derefs to Connection; drop on Err = rollback
    tx.commit()?;
    Ok(out)
}

/// Initialize database with final schema (no migrations for dev-only project).
pub fn init_db(conn: &Connection) -> AppResult<()> {
    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS skills
        (
            id             INTEGER primary key autoincrement,
            name           TEXT not null,
            source_type    TEXT not null,
            install_source TEXT          default 'local_import',
            github_source  TEXT, -- GitHub source (e.g., "obra/superpowers")
            source_url     TEXT, -- skills.sh registry ID (e.g., "obra/superpowers/brainstorming")
            owner          TEXT,
            repo           TEXT,
            dir_path       TEXT not null unique,
            description    TEXT,
            latest_sha     TEXT,
            source_path    TEXT,
            tree_sha       TEXT,
            status         TEXT NOT NULL DEFAULT 'ok',
            updated_at     TEXT          default (datetime('now')) not null,
            check (source_type IN ('net', 'local')),
            check (install_source IN ('skills_sh', 'github', 'local_import')),
            check (status IN ('ok', 'update_available', 'missing'))
        );

        CREATE TABLE IF NOT EXISTS presets (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            name        TEXT NOT NULL UNIQUE,
            description TEXT,
            created_at  TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS preset_skills (
            preset_id INTEGER NOT NULL REFERENCES presets(id) ON DELETE CASCADE,
            skill_id  INTEGER NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
            UNIQUE (preset_id, skill_id)
        );

        CREATE TABLE IF NOT EXISTS preset_includes (
            preset_id          INTEGER NOT NULL REFERENCES presets(id) ON DELETE CASCADE,
            included_preset_id INTEGER NOT NULL REFERENCES presets(id) ON DELETE CASCADE,
            CHECK (preset_id != included_preset_id),
            UNIQUE (preset_id, included_preset_id)
        );

        CREATE INDEX IF NOT EXISTS idx_preset_includes_source
            ON preset_includes(included_preset_id);

        CREATE TABLE IF NOT EXISTS project_groups (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            name       TEXT COLLATE NOCASE UNIQUE,
            is_system  INTEGER NOT NULL DEFAULT 0 CHECK (is_system IN (0, 1)),
            hidden     INTEGER NOT NULL DEFAULT 0 CHECK (hidden IN (0, 1)),
            sort_order INTEGER NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            CHECK (
                (id = 0 AND is_system = 1 AND name IS NULL)
                OR (id > 0 AND is_system = 0 AND name IS NOT NULL)
            )
        );

        INSERT OR IGNORE INTO project_groups (id, name, is_system, hidden, sort_order)
        VALUES (0, NULL, 1, 0, 0);

        CREATE TABLE IF NOT EXISTS projects (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            name       TEXT NOT NULL,
            path       TEXT NOT NULL UNIQUE,
            group_id   INTEGER NOT NULL DEFAULT 0
                       REFERENCES project_groups(id) ON DELETE SET DEFAULT,
            sort_order INTEGER NOT NULL,
            hidden     INTEGER NOT NULL DEFAULT 0 CHECK (hidden IN (0, 1)),
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE INDEX IF NOT EXISTS idx_projects_group_order
            ON projects(group_id, hidden, sort_order);

        CREATE TABLE IF NOT EXISTS project_presets (
            project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            preset_id  INTEGER NOT NULL REFERENCES presets(id) ON DELETE CASCADE,
            UNIQUE (project_id, preset_id)
        );

        CREATE TABLE IF NOT EXISTS project_skills (
            project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            skill_id   INTEGER NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
            UNIQUE (project_id, skill_id)
        );

        CREATE TABLE IF NOT EXISTS agents (
            id             INTEGER PRIMARY KEY AUTOINCREMENT,
            name           TEXT NOT NULL UNIQUE,
            target_dir     TEXT NOT NULL UNIQUE,
            global_enabled INTEGER NOT NULL DEFAULT 0,
            created_at     TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS project_agents (
            project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            agent_id   INTEGER NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
            UNIQUE (project_id, agent_id)
        );

        CREATE TABLE IF NOT EXISTS settings (
            key   TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS op_logs (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            action     TEXT NOT NULL,
            detail     TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        "#,
    )?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::error::AppError;

    #[test]
    fn with_tx_commits_on_ok_and_rolls_back_on_err() {
        let db = Db::open_in_memory().unwrap();
        let conn = db.conn.lock().unwrap();

        with_tx(&conn, |c| {
            repo::log_op_strict(c, "committed", "yes")?;
            Ok(())
        })
        .unwrap();

        let err = with_tx(&conn, |c| {
            repo::log_op_strict(c, "rolled-back", "no")?;
            Err::<(), _>(AppError::Other("boom".into()))
        });
        assert!(err.is_err());

        let count = |action: &str| -> i64 {
            conn.query_row(
                "SELECT COUNT(*) FROM op_logs WHERE action = ?1",
                [action],
                |r| r.get(0),
            )
            .unwrap()
        };
        assert_eq!(count("committed"), 1);
        assert_eq!(count("rolled-back"), 0);
    }
}
