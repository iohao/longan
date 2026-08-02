use std::collections::BTreeSet;

use rusqlite::{params, Connection, OptionalExtension, Row};

use crate::error::{AppError, AppResult};
use crate::models::{
    Agent, ListedSkill, MoveDirection, Preset, PresetProjectReference, PresetReuseMode,
    PresetReuseResult, Project, ProjectGroup, Skill,
};

fn skill_from_row(row: &Row) -> rusqlite::Result<Skill> {
    Ok(Skill {
        id: row.get("id")?,
        name: row.get("name")?,
        source_type: row.get("source_type")?,
        owner: row.get("owner")?,
        repo: row.get("repo")?,
        dir_path: row.get("dir_path")?,
        description: row.get("description")?,
        latest_sha: row.get("latest_sha")?,
        source_path: row.get("source_path")?,
        tree_sha: row.get("tree_sha")?,
        status: row.get("status")?,
        updated_at: row.get("updated_at")?,
        source_url: row.get("source_url").unwrap_or_default(),
        github_source: row.get("github_source").unwrap_or_default(),
        install_source: row.get("install_source").ok(),
    })
}

// ---------- skills ----------

pub fn list_skills(conn: &Connection) -> AppResult<Vec<Skill>> {
    let mut stmt = conn.prepare("SELECT * FROM skills ORDER BY name, dir_path")?;
    let rows = stmt.query_map([], skill_from_row)?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

pub fn list_skills_with_reference_counts(conn: &Connection) -> AppResult<Vec<ListedSkill>> {
    let mut stmt = conn.prepare(
        r#"
        WITH RECURSIVE skill_presets(skill_id, preset_id) AS (
            SELECT skill_id, preset_id FROM preset_skills
            UNION
            SELECT sp.skill_id, pi.preset_id
            FROM skill_presets sp
            JOIN preset_includes pi ON pi.included_preset_id = sp.preset_id
        ),
        preset_counts AS (
            SELECT skill_id, COUNT(*) AS reference_count
            FROM skill_presets
            GROUP BY skill_id
        ),
        project_skill_refs(skill_id, project_id) AS (
            SELECT skill_id, project_id FROM project_skills
            UNION
            SELECT sp.skill_id, pp.project_id
            FROM skill_presets sp
            JOIN project_presets pp ON pp.preset_id = sp.preset_id
        ),
        project_counts AS (
            SELECT skill_id, COUNT(*) AS reference_count
            FROM project_skill_refs
            GROUP BY skill_id
        )
        SELECT
            skills.*,
            COALESCE(preset_counts.reference_count, 0)
              + COALESCE(project_counts.reference_count, 0) AS reference_count
        FROM skills
        LEFT JOIN preset_counts ON preset_counts.skill_id = skills.id
        LEFT JOIN project_counts ON project_counts.skill_id = skills.id
        ORDER BY skills.name, skills.dir_path
        "#,
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(ListedSkill {
            skill: skill_from_row(row)?,
            reference_count: row.get("reference_count")?,
        })
    })?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

pub fn get_skill(conn: &Connection, id: i64) -> AppResult<Skill> {
    conn.query_row("SELECT * FROM skills WHERE id = ?1", params![id], skill_from_row)
        .optional()?
        .ok_or_else(|| AppError::NotFound(format!("skill #{id}")))
}

pub fn find_skill_by_dir_path(conn: &Connection, dir_path: &str) -> AppResult<Option<Skill>> {
    Ok(conn
        .query_row(
            "SELECT * FROM skills WHERE dir_path = ?1",
            params![dir_path],
            skill_from_row,
        )
        .optional()?)
}

/// Insert or refresh a skill row identified by its unique dir_path.
#[allow(clippy::too_many_arguments)]
pub fn upsert_skill(
    conn: &Connection,
    name: &str,
    source_type: &str,
    owner: Option<&str>,
    repo: Option<&str>,
    dir_path: &str,
    description: Option<&str>,
    latest_sha: Option<&str>,
    source_url: Option<&str>,
    github_source: Option<&str>,
    install_source: Option<&str>,
    source_path: Option<&str>,
    tree_sha: Option<&str>,
) -> AppResult<i64> {
    conn.execute(
        r#"
        INSERT INTO skills (name, source_type, owner, repo, dir_path, description, latest_sha, status, source_url, github_source, install_source, source_path, tree_sha)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'ok', ?8, ?9, ?10, ?11, ?12)
        ON CONFLICT(dir_path) DO UPDATE SET
            name = excluded.name,
            description = excluded.description,
            latest_sha = COALESCE(excluded.latest_sha, skills.latest_sha),
            source_url = COALESCE(excluded.source_url, skills.source_url),
            github_source = COALESCE(excluded.github_source, skills.github_source),
            install_source = COALESCE(excluded.install_source, skills.install_source),
            source_path = COALESCE(excluded.source_path, skills.source_path),
            tree_sha = COALESCE(excluded.tree_sha, skills.tree_sha),
            status = 'ok',
            updated_at = datetime('now')
        "#,
        params![name, source_type, owner, repo, dir_path, description, latest_sha, source_url, github_source, install_source, source_path, tree_sha],
    )?;
    let id: i64 = conn.query_row(
        "SELECT id FROM skills WHERE dir_path = ?1",
        params![dir_path],
        |r| r.get(0),
    )?;
    Ok(id)
}

pub fn set_skill_status(conn: &Connection, id: i64, status: &str) -> AppResult<()> {
    conn.execute(
        "UPDATE skills SET status = ?2, updated_at = datetime('now') WHERE id = ?1",
        params![id, status],
    )?;
    Ok(())
}

/// Mark a skill based on the latest repository commit and its skill-directory tree.
/// The installed SHAs remain unchanged until a successful install/update.
pub fn set_skill_update_status(
    conn: &Connection,
    id: i64,
    latest_sha: &str,
    latest_tree_sha: Option<&str>,
) -> AppResult<()> {
    conn.execute(
        r#"UPDATE skills SET
           status = CASE
             WHEN skills.tree_sha IS NOT NULL
               AND (skills.tree_sha != ?3 OR ?3 IS NULL) THEN 'update_available'
             WHEN skills.tree_sha IS NOT NULL AND skills.tree_sha = ?3 THEN 'ok'
             WHEN skills.latest_sha IS NOT NULL AND skills.latest_sha = ?2 THEN 'ok'
             ELSE 'update_available'
           END,
           updated_at = datetime('now')
           WHERE id = ?1"#,
        params![id, latest_sha, latest_tree_sha],
    )?;
    Ok(())
}

pub fn delete_skill(conn: &Connection, id: i64) -> AppResult<()> {
    conn.execute("DELETE FROM skills WHERE id = ?1", params![id])?;
    Ok(())
}

/// Names of presets and projects that reference a skill (for delete confirmation).
pub fn skill_references(conn: &Connection, id: i64) -> AppResult<(Vec<String>, Vec<String>)> {
    let mut stmt = conn.prepare(
        r#"
        WITH RECURSIVE skill_presets(id) AS (
            SELECT preset_id FROM preset_skills WHERE skill_id = ?1
            UNION
            SELECT pi.preset_id FROM preset_includes pi
            JOIN skill_presets sp ON sp.id = pi.included_preset_id
        )
        SELECT p.name FROM presets p
        JOIN skill_presets sp ON sp.id = p.id
        ORDER BY p.name
        "#,
    )?;
    let presets = stmt
        .query_map(params![id], |r| r.get::<_, String>(0))?
        .collect::<Result<Vec<_>, _>>()?;

    // Projects referencing directly or via a preset.
    let mut stmt = conn.prepare(
        r#"
        WITH RECURSIVE skill_presets(id) AS (
            SELECT preset_id FROM preset_skills WHERE skill_id = ?1
            UNION
            SELECT pi.preset_id FROM preset_includes pi
            JOIN skill_presets sp ON sp.id = pi.included_preset_id
        )
        SELECT DISTINCT pr.name FROM projects pr
        LEFT JOIN project_skills psk ON psk.project_id = pr.id
        LEFT JOIN project_presets pp ON pp.project_id = pr.id
        LEFT JOIN skill_presets sp ON sp.id = pp.preset_id
        WHERE psk.skill_id = ?1 OR sp.id IS NOT NULL
        ORDER BY pr.name
        "#,
    )?;
    let projects = stmt
        .query_map(params![id], |r| r.get::<_, String>(0))?
        .collect::<Result<Vec<_>, _>>()?;
    Ok((presets, projects))
}

/// Detailed references for a skill (for the reference detail view).
pub fn skill_reference_details(conn: &Connection, id: i64) -> AppResult<Vec<crate::models::ReferenceDetail>> {
    use crate::models::ReferenceDetail;

    // Get preset references
    let mut stmt = conn.prepare(
        r#"
        WITH RECURSIVE skill_presets(id) AS (
            SELECT preset_id FROM preset_skills WHERE skill_id = ?1
            UNION
            SELECT pi.preset_id FROM preset_includes pi
            JOIN skill_presets sp ON sp.id = pi.included_preset_id
        )
        SELECT p.name FROM presets p
        JOIN skill_presets sp ON sp.id = p.id
        ORDER BY p.name
        "#,
    )?;
    let preset_refs: Vec<ReferenceDetail> = stmt
        .query_map(params![id], |r| {
            Ok(ReferenceDetail {
                name: r.get(0)?,
                type_: "preset".to_string(),
                path: String::new(),  // Presets don't have paths
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    // Get project references (direct or via preset)
    let mut stmt = conn.prepare(
        r#"
        WITH RECURSIVE skill_presets(id) AS (
            SELECT preset_id FROM preset_skills WHERE skill_id = ?1
            UNION
            SELECT pi.preset_id FROM preset_includes pi
            JOIN skill_presets sp ON sp.id = pi.included_preset_id
        )
        SELECT DISTINCT pr.name, pr.path FROM projects pr
        LEFT JOIN project_skills psk ON psk.project_id = pr.id
        LEFT JOIN project_presets pp ON pp.project_id = pr.id
        LEFT JOIN skill_presets sp ON sp.id = pp.preset_id
        WHERE psk.skill_id = ?1 OR sp.id IS NOT NULL
        ORDER BY pr.name
        "#,
    )?;
    let project_refs: Vec<ReferenceDetail> = stmt
        .query_map(params![id], |r| {
            Ok(ReferenceDetail {
                name: r.get(0)?,
                type_: "project".to_string(),
                path: r.get::<_, Option<String>>(1)?.unwrap_or_default(),
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    Ok([preset_refs, project_refs].concat())
}

// ---------- presets ----------

pub fn list_presets(conn: &Connection) -> AppResult<Vec<Preset>> {
    let mut stmt = conn.prepare("SELECT id, name, description, created_at FROM presets ORDER BY name")?;
    let mut presets = stmt
        .query_map([], |r| {
            Ok(Preset {
                id: r.get(0)?,
                name: r.get(1)?,
                description: r.get(2)?,
                created_at: r.get(3)?,
                skill_ids: vec![],
                direct_skill_ids: vec![],
                included_preset_ids: vec![],
                reference_count: 0,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    let mut direct_stmt =
        conn.prepare("SELECT skill_id FROM preset_skills WHERE preset_id = ?1 ORDER BY skill_id")?;
    let mut include_stmt = conn.prepare(
        "SELECT included_preset_id FROM preset_includes WHERE preset_id = ?1 ORDER BY included_preset_id",
    )?;
    for p in &mut presets {
        p.direct_skill_ids = direct_stmt
            .query_map(params![p.id], |r| r.get::<_, i64>(0))?
            .collect::<Result<Vec<_>, _>>()?;
        p.included_preset_ids = include_stmt
            .query_map(params![p.id], |r| r.get::<_, i64>(0))?
            .collect::<Result<Vec<_>, _>>()?;
        p.skill_ids = effective_preset_skill_ids(conn, p.id)?;
        p.reference_count = preset_project_references(conn, p.id)?.len() as u32;
    }
    Ok(presets)
}

pub fn effective_preset_skill_ids(conn: &Connection, preset_id: i64) -> AppResult<Vec<i64>> {
    let mut stmt = conn.prepare(
        r#"
        WITH RECURSIVE descendants(id) AS (
            SELECT ?1
            UNION
            SELECT pi.included_preset_id FROM preset_includes pi
            JOIN descendants d ON d.id = pi.preset_id
        )
        SELECT DISTINCT ps.skill_id FROM preset_skills ps
        JOIN descendants d ON d.id = ps.preset_id
        ORDER BY ps.skill_id
        "#,
    )?;
    let ids = stmt
        .query_map(params![preset_id], |row| row.get::<_, i64>(0))?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(ids)
}

pub fn create_preset(conn: &Connection, name: &str, description: Option<&str>) -> AppResult<i64> {
    conn.execute(
        "INSERT INTO presets (name, description) VALUES (?1, ?2)",
        params![name, description],
    )?;
    Ok(conn.last_insert_rowid())
}

pub fn create_preset_with_sources(
    conn: &Connection,
    name: &str,
    description: Option<&str>,
    source_preset_ids: &[i64],
    mode: Option<PresetReuseMode>,
) -> AppResult<i64> {
    if !source_preset_ids.is_empty() && mode.is_none() {
        return Err(AppError::InvalidInput(
            "preset reuse mode is required when sources are selected".into(),
        ));
    }
    super::with_tx(conn, |conn| {
        let preset_id = create_preset(conn, name, description)?;
        if let Some(mode) = mode {
            apply_preset_reuse(conn, preset_id, source_preset_ids, mode)?;
        }
        Ok(preset_id)
    })
}

pub fn update_preset(conn: &Connection, id: i64, name: &str, description: Option<&str>) -> AppResult<()> {
    conn.execute(
        "UPDATE presets SET name = ?2, description = ?3 WHERE id = ?1",
        params![id, name, description],
    )?;
    Ok(())
}

pub fn delete_preset(conn: &Connection, id: i64) -> AppResult<()> {
    conn.execute("DELETE FROM presets WHERE id = ?1", params![id])?;
    Ok(())
}

/// Replace the full skill set of a preset.
pub fn set_preset_skills(conn: &Connection, preset_id: i64, skill_ids: &[i64]) -> AppResult<()> {
    // DELETE + INSERT loop must be atomic or a mid-loop failure half-empties the preset.
    super::with_tx(conn, |conn| {
        conn.execute("DELETE FROM preset_skills WHERE preset_id = ?1", params![preset_id])?;
        let mut stmt = conn
            .prepare("INSERT OR IGNORE INTO preset_skills (preset_id, skill_id) VALUES (?1, ?2)")?;
        for sid in skill_ids {
            stmt.execute(params![preset_id, sid])?;
        }
        Ok(())
    })
}

fn preset_exists(conn: &Connection, preset_id: i64) -> AppResult<bool> {
    Ok(conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM presets WHERE id = ?1)",
        params![preset_id],
        |row| row.get(0),
    )?)
}

pub fn would_create_preset_cycle(
    conn: &Connection,
    preset_id: i64,
    included_preset_id: i64,
) -> AppResult<bool> {
    if preset_id == included_preset_id {
        return Ok(true);
    }
    Ok(conn.query_row(
        r#"
        WITH RECURSIVE descendants(id) AS (
            SELECT ?1
            UNION
            SELECT pi.included_preset_id FROM preset_includes pi
            JOIN descendants d ON d.id = pi.preset_id
        )
        SELECT EXISTS(SELECT 1 FROM descendants WHERE id = ?2)
        "#,
        params![included_preset_id, preset_id],
        |row| row.get(0),
    )?)
}

fn insert_preset_includes(
    conn: &Connection,
    preset_id: i64,
    included_preset_ids: &[i64],
) -> AppResult<usize> {
    let mut added = 0;
    for included_id in included_preset_ids {
        if !preset_exists(conn, *included_id)? {
            return Err(AppError::InvalidInput(format!(
                "source preset #{included_id} does not exist"
            )));
        }
        if would_create_preset_cycle(conn, preset_id, *included_id)? {
            return Err(AppError::InvalidInput(
                "preset composition would create a cycle".into(),
            ));
        }
        added += conn.execute(
            "INSERT OR IGNORE INTO preset_includes (preset_id, included_preset_id) VALUES (?1, ?2)",
            params![preset_id, included_id],
        )?;
    }
    Ok(added)
}

fn apply_preset_reuse(
    conn: &Connection,
    preset_id: i64,
    source_preset_ids: &[i64],
    mode: PresetReuseMode,
) -> AppResult<PresetReuseResult> {
    if !preset_exists(conn, preset_id)? {
        return Err(AppError::InvalidInput(format!(
            "target preset #{preset_id} does not exist"
        )));
    }
    match mode {
        PresetReuseMode::Copy => {
            let mut source_skill_ids = BTreeSet::new();
            for source_id in source_preset_ids {
                if !preset_exists(conn, *source_id)? || *source_id == preset_id {
                    return Err(AppError::InvalidInput(format!(
                        "invalid source preset #{source_id}"
                    )));
                }
                source_skill_ids.extend(effective_preset_skill_ids(conn, *source_id)?);
            }
            let mut added = 0;
            for skill_id in source_skill_ids {
                added += conn.execute(
                    "INSERT OR IGNORE INTO preset_skills (preset_id, skill_id) VALUES (?1, ?2)",
                    params![preset_id, skill_id],
                )?;
            }
            Ok(PresetReuseResult {
                added_direct_skill_count: added,
                added_include_count: 0,
            })
        }
        PresetReuseMode::Link => Ok(PresetReuseResult {
            added_direct_skill_count: 0,
            added_include_count: insert_preset_includes(conn, preset_id, source_preset_ids)?,
        }),
    }
}

pub fn reuse_preset(
    conn: &Connection,
    preset_id: i64,
    source_preset_ids: &[i64],
    mode: PresetReuseMode,
) -> AppResult<PresetReuseResult> {
    super::with_tx(conn, |conn| {
        apply_preset_reuse(conn, preset_id, source_preset_ids, mode)
    })
}

pub fn set_preset_includes(
    conn: &Connection,
    preset_id: i64,
    included_preset_ids: &[i64],
) -> AppResult<()> {
    super::with_tx(conn, |conn| {
        conn.execute(
            "DELETE FROM preset_includes WHERE preset_id = ?1",
            params![preset_id],
        )?;
        insert_preset_includes(conn, preset_id, included_preset_ids)?;
        Ok(())
    })
}

/// Projects that use a preset directly or through linked preset composition.
pub fn preset_project_references(
    conn: &Connection,
    preset_id: i64,
) -> AppResult<Vec<PresetProjectReference>> {
    let mut stmt = conn.prepare(
        r#"
        WITH RECURSIVE affected_presets(id) AS (
            SELECT ?1
            UNION
            SELECT pi.preset_id FROM preset_includes pi
            JOIN affected_presets ap ON ap.id = pi.included_preset_id
        )
        SELECT DISTINCT pr.id, pr.name, pr.path FROM project_presets pp
        JOIN affected_presets ap ON ap.id = pp.preset_id
        JOIN projects pr ON pr.id = pp.project_id
        ORDER BY pr.name COLLATE NOCASE, pr.id
        "#,
    )?;
    let references = stmt
        .query_map(params![preset_id], |r| {
            Ok(PresetProjectReference {
                id: r.get(0)?,
                name: r.get(1)?,
                path: r.get(2)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(references)
}

/// Project ids affected by a preset (used to resync after preset changes).
pub fn projects_using_preset(conn: &Connection, preset_id: i64) -> AppResult<Vec<i64>> {
    let mut ids = preset_project_references(conn, preset_id)?
        .into_iter()
        .map(|project| project.id)
        .collect::<Vec<_>>();
    ids.sort_unstable();
    Ok(ids)
}

/// Project ids affected by a skill (directly or via presets).
pub fn projects_using_skill(conn: &Connection, skill_id: i64) -> AppResult<Vec<i64>> {
    let mut stmt = conn.prepare(
        r#"
        WITH RECURSIVE skill_presets(id) AS (
            SELECT preset_id FROM preset_skills WHERE skill_id = ?1
            UNION
            SELECT pi.preset_id FROM preset_includes pi
            JOIN skill_presets sp ON sp.id = pi.included_preset_id
        )
        SELECT DISTINCT pr.id FROM projects pr
        LEFT JOIN project_skills psk ON psk.project_id = pr.id
        LEFT JOIN project_presets pp ON pp.project_id = pr.id
        LEFT JOIN skill_presets sp ON sp.id = pp.preset_id
        WHERE psk.skill_id = ?1 OR sp.id IS NOT NULL
        ORDER BY pr.id
        "#,
    )?;
    let ids = stmt
        .query_map(params![skill_id], |r| r.get::<_, i64>(0))?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(ids)
}

// ---------- agents ----------

fn agent_from_row(row: &Row) -> rusqlite::Result<Agent> {
    Ok(Agent {
        id: row.get(0)?,
        name: row.get(1)?,
        target_dir: row.get(2)?,
        global_enabled: row.get(3)?,
        created_at: row.get(4)?,
    })
}

pub fn list_agents(conn: &Connection) -> AppResult<Vec<Agent>> {
    let mut stmt = conn.prepare(
        "SELECT id, name, target_dir, global_enabled, created_at FROM agents ORDER BY name",
    )?;
    let agents = stmt
        .query_map([], agent_from_row)?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(agents)
}

pub fn get_agent(conn: &Connection, id: i64) -> AppResult<Agent> {
    conn.query_row(
        "SELECT id, name, target_dir, global_enabled, created_at FROM agents WHERE id = ?1",
        params![id],
        agent_from_row,
    )
    .optional()?
    .ok_or_else(|| AppError::NotFound(format!("agent #{id}")))
}

pub fn create_agent(
    conn: &Connection,
    name: &str,
    target_dir: &str,
    global_enabled: bool,
) -> AppResult<i64> {
    conn.execute(
        "INSERT INTO agents (name, target_dir, global_enabled) VALUES (?1, ?2, ?3)",
        params![name, target_dir, global_enabled],
    )?;
    Ok(conn.last_insert_rowid())
}

pub fn update_agent(
    conn: &Connection,
    id: i64,
    name: &str,
    target_dir: &str,
    global_enabled: bool,
) -> AppResult<()> {
    conn.execute(
        "UPDATE agents SET name = ?2, target_dir = ?3, global_enabled = ?4 WHERE id = ?1",
        params![id, name, target_dir, global_enabled],
    )?;
    Ok(())
}

pub fn delete_agent(conn: &Connection, id: i64) -> AppResult<()> {
    conn.execute("DELETE FROM agents WHERE id = ?1", params![id])?;
    Ok(())
}

pub fn set_project_agent(conn: &Connection, project_id: i64, agent_id: i64, linked: bool) -> AppResult<()> {
    if linked {
        conn.execute(
            "INSERT OR IGNORE INTO project_agents (project_id, agent_id) VALUES (?1, ?2)",
            params![project_id, agent_id],
        )?;
    } else {
        conn.execute(
            "DELETE FROM project_agents WHERE project_id = ?1 AND agent_id = ?2",
            params![project_id, agent_id],
        )?;
    }
    Ok(())
}

/// Link-dir plan for one project: target_dir -> whether links should exist
/// there (agent globally enabled or linked to this project). Does not include
/// the default `.agents/skills` dir. Same-dir rows are OR-merged so an
/// effective agent always wins (target_dir is UNIQUE; this is defense in
/// depth against a tampered DB).
pub fn agent_dir_plan(
    conn: &Connection,
    project_id: i64,
) -> AppResult<std::collections::BTreeMap<String, bool>> {
    let mut stmt = conn.prepare(
        r#"
        SELECT a.target_dir,
               (a.global_enabled OR EXISTS (
                   SELECT 1 FROM project_agents pa
                   WHERE pa.agent_id = a.id AND pa.project_id = ?1)) AS effective
        FROM agents a
        "#,
    )?;
    let mut plan = std::collections::BTreeMap::new();
    for row in stmt.query_map(params![project_id], |r| {
        Ok((r.get::<_, String>(0)?, r.get::<_, bool>(1)?))
    })? {
        let (dir, effective) = row?;
        let entry = plan.entry(dir).or_insert(false);
        *entry = *entry || effective;
    }
    Ok(plan)
}

// ---------- projects ----------

fn project_from_row(row: &Row) -> rusqlite::Result<Project> {
    Ok(Project {
        id: row.get("id")?,
        name: row.get("name")?,
        path: row.get("path")?,
        group_id: row.get("group_id")?,
        hidden: row.get("hidden")?,
        created_at: row.get("created_at")?,
        path_exists: false,
        preset_ids: vec![],
        skill_ids: vec![],
        agent_ids: vec![],
    })
}

fn hydrate_project_relations(conn: &Connection, projects: &mut [Project]) -> AppResult<()> {
    let mut ps = conn.prepare("SELECT preset_id FROM project_presets WHERE project_id = ?1")?;
    let mut sk = conn.prepare("SELECT skill_id FROM project_skills WHERE project_id = ?1")?;
    let mut ag = conn.prepare("SELECT agent_id FROM project_agents WHERE project_id = ?1")?;
    for project in projects {
        project.path_exists = std::path::Path::new(&project.path).is_dir();
        project.preset_ids = ps
            .query_map(params![project.id], |row| row.get::<_, i64>(0))?
            .collect::<Result<Vec<_>, _>>()?;
        project.skill_ids = sk
            .query_map(params![project.id], |row| row.get::<_, i64>(0))?
            .collect::<Result<Vec<_>, _>>()?;
        project.agent_ids = ag
            .query_map(params![project.id], |row| row.get::<_, i64>(0))?
            .collect::<Result<Vec<_>, _>>()?;
    }
    Ok(())
}

pub fn list_project_groups(conn: &Connection) -> AppResult<Vec<ProjectGroup>> {
    let mut stmt = conn.prepare(
        r#"
        SELECT id, name, is_system, hidden, sort_order
        FROM project_groups
        ORDER BY hidden,
                 CASE WHEN hidden = 1 AND is_system = 1 THEN 0 ELSE 1 END,
                 sort_order,
                 id
        "#,
    )?;
    let groups = stmt
        .query_map([], |row| {
            Ok(ProjectGroup {
                id: row.get(0)?,
                name: row.get(1)?,
                is_system: row.get(2)?,
                hidden: row.get(3)?,
                sort_order: row.get(4)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(groups)
}

pub fn project_group_name_exists(
    conn: &Connection,
    name: &str,
    excluding_id: Option<i64>,
) -> AppResult<bool> {
    Ok(conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM project_groups WHERE name = ?1 COLLATE NOCASE AND id != COALESCE(?2, -1))",
        params![name, excluding_id],
        |row| row.get(0),
    )?)
}

pub fn create_project_group(conn: &Connection, name: &str) -> AppResult<i64> {
    let sort_order = conn.query_row(
        "SELECT COALESCE(MAX(sort_order), 0) + 1 FROM project_groups",
        [],
        |row| row.get::<_, i64>(0),
    )?;
    conn.execute(
        "INSERT INTO project_groups (name, sort_order) VALUES (?1, ?2)",
        params![name, sort_order],
    )?;
    Ok(conn.last_insert_rowid())
}

pub fn update_project_group(conn: &Connection, group_id: i64, name: &str) -> AppResult<()> {
    let changed = conn.execute(
        "UPDATE project_groups SET name = ?1 WHERE id = ?2 AND is_system = 0",
        params![name, group_id],
    )?;
    if changed == 0 {
        return Err(AppError::NotFound(format!("project group #{group_id}")));
    }
    Ok(())
}

pub fn set_project_group_hidden(
    conn: &Connection,
    group_id: i64,
    hidden: bool,
) -> AppResult<()> {
    if group_id == 0 {
        return Err(AppError::InvalidInput(
            "the ungrouped system group visibility cannot be changed".into(),
        ));
    }
    let changed = conn.execute(
        "UPDATE project_groups SET hidden = ?1 WHERE id = ?2 AND is_system = 0",
        params![hidden, group_id],
    )?;
    if changed == 0 {
        return Err(AppError::NotFound(format!("project group #{group_id}")));
    }
    Ok(())
}

pub fn move_project_group(
    conn: &Connection,
    group_id: i64,
    direction: MoveDirection,
) -> AppResult<()> {
    super::with_tx(conn, |conn| {
        let (hidden, sort_order) = conn
            .query_row(
                "SELECT hidden, sort_order FROM project_groups WHERE id = ?1 AND is_system = 0",
                params![group_id],
                |row| Ok((row.get::<_, bool>(0)?, row.get::<_, i64>(1)?)),
            )
            .optional()?
            .ok_or_else(|| AppError::NotFound(format!("project group #{group_id}")))?;
        let neighbor = match direction {
            MoveDirection::Up => conn
                .query_row(
                    "SELECT id, sort_order FROM project_groups WHERE is_system = 0 AND hidden = ?1 AND sort_order < ?2 ORDER BY sort_order DESC, id DESC LIMIT 1",
                    params![hidden, sort_order],
                    |row| Ok((row.get::<_, i64>(0)?, row.get::<_, i64>(1)?)),
                )
                .optional()?,
            MoveDirection::Down => conn
                .query_row(
                    "SELECT id, sort_order FROM project_groups WHERE is_system = 0 AND hidden = ?1 AND sort_order > ?2 ORDER BY sort_order, id LIMIT 1",
                    params![hidden, sort_order],
                    |row| Ok((row.get::<_, i64>(0)?, row.get::<_, i64>(1)?)),
                )
                .optional()?,
        };
        let Some((neighbor_id, neighbor_order)) = neighbor else {
            return Ok(());
        };
        conn.execute(
            "UPDATE project_groups SET sort_order = ?1 WHERE id = ?2",
            params![neighbor_order, group_id],
        )?;
        conn.execute(
            "UPDATE project_groups SET sort_order = ?1 WHERE id = ?2",
            params![sort_order, neighbor_id],
        )?;
        Ok(())
    })
}

pub fn delete_project_group(conn: &Connection, group_id: i64) -> AppResult<usize> {
    if group_id == 0 {
        return Err(AppError::InvalidInput("the ungrouped system group cannot be deleted".into()));
    }
    super::with_tx(conn, |conn| {
        let exists = conn.query_row(
            "SELECT EXISTS(SELECT 1 FROM project_groups WHERE id = ?1 AND is_system = 0)",
            params![group_id],
            |row| row.get::<_, bool>(0),
        )?;
        if !exists {
            return Err(AppError::NotFound(format!("project group #{group_id}")));
        }
        let mut stmt = conn.prepare(
            "SELECT id FROM projects WHERE group_id = ?1 ORDER BY sort_order, id",
        )?;
        let project_ids = stmt
            .query_map(params![group_id], |row| row.get::<_, i64>(0))?
            .collect::<Result<Vec<_>, _>>()?;
        drop(stmt);
        let mut next_order = conn.query_row(
            "SELECT COALESCE(MAX(sort_order), -1) + 1 FROM projects WHERE group_id = 0",
            [],
            |row| row.get::<_, i64>(0),
        )?;
        for project_id in &project_ids {
            conn.execute(
                "UPDATE projects SET group_id = 0, sort_order = ?1 WHERE id = ?2",
                params![next_order, project_id],
            )?;
            next_order += 1;
        }
        conn.execute("DELETE FROM project_groups WHERE id = ?1", params![group_id])?;
        Ok(project_ids.len())
    })
}

pub fn list_projects(conn: &Connection) -> AppResult<Vec<Project>> {
    let mut stmt = conn.prepare(
        "SELECT id, name, path, group_id, hidden, created_at FROM projects ORDER BY group_id, sort_order, id",
    )?;
    let mut projects = stmt
        .query_map([], project_from_row)?
        .collect::<Result<Vec<_>, _>>()?;
    hydrate_project_relations(conn, &mut projects)?;
    Ok(projects)
}

pub fn get_project(conn: &Connection, id: i64) -> AppResult<Project> {
    let mut project = conn
        .query_row(
            "SELECT id, name, path, group_id, hidden, created_at FROM projects WHERE id = ?1",
            params![id],
            project_from_row,
        )
        .optional()?
        .ok_or_else(|| AppError::NotFound(format!("project #{id}")))?;
    hydrate_project_relations(conn, std::slice::from_mut(&mut project))?;
    Ok(project)
}

pub fn create_project(conn: &Connection, name: &str, path: &str) -> AppResult<i64> {
    let sort_order = conn.query_row(
        "SELECT COALESCE(MAX(sort_order), -1) + 1 FROM projects WHERE group_id = 0",
        [],
        |row| row.get::<_, i64>(0),
    )?;
    conn.execute(
        "INSERT INTO projects (name, path, sort_order) VALUES (?1, ?2, ?3)",
        params![name, path, sort_order],
    )?;
    Ok(conn.last_insert_rowid())
}

pub fn delete_project(conn: &Connection, id: i64) -> AppResult<()> {
    conn.execute("DELETE FROM projects WHERE id = ?1", params![id])?;
    Ok(())
}

pub fn set_project_group(conn: &Connection, project_id: i64, group_id: i64) -> AppResult<()> {
    set_projects_group(conn, &[project_id], group_id).map(|_| ())
}

pub fn set_projects_group(
    conn: &Connection,
    project_ids: &[i64],
    group_id: i64,
) -> AppResult<usize> {
    if project_ids.is_empty() {
        return Ok(0);
    }

    super::with_tx(conn, |conn| {
        let group_exists = conn.query_row(
            "SELECT EXISTS(SELECT 1 FROM project_groups WHERE id = ?1)",
            params![group_id],
            |row| row.get::<_, bool>(0),
        )?;
        if !group_exists {
            return Err(AppError::NotFound(format!("project group #{group_id}")));
        }

        let mut seen = BTreeSet::new();
        let mut movable_project_ids = Vec::new();
        for &project_id in project_ids {
            if !seen.insert(project_id) {
                continue;
            }
            let current_group = conn
                .query_row(
                    "SELECT group_id FROM projects WHERE id = ?1",
                    params![project_id],
                    |row| row.get::<_, i64>(0),
                )
                .optional()?
                .ok_or_else(|| AppError::NotFound(format!("project #{project_id}")))?;
            if current_group != group_id {
                movable_project_ids.push(project_id);
            }
        }

        if movable_project_ids.is_empty() {
            return Ok(0);
        }

        let mut sort_order = conn.query_row(
            "SELECT COALESCE(MAX(sort_order), -1) + 1 FROM projects WHERE group_id = ?1",
            params![group_id],
            |row| row.get::<_, i64>(0),
        )?;
        for &project_id in &movable_project_ids {
            conn.execute(
                "UPDATE projects SET group_id = ?1, sort_order = ?2 WHERE id = ?3",
                params![group_id, sort_order, project_id],
            )?;
            sort_order += 1;
        }

        Ok(movable_project_ids.len())
    })
}

pub fn set_project_hidden(conn: &Connection, project_id: i64, hidden: bool) -> AppResult<()> {
    let changed = conn.execute(
        "UPDATE projects SET hidden = ?1 WHERE id = ?2",
        params![hidden, project_id],
    )?;
    if changed == 0 {
        return Err(AppError::NotFound(format!("project #{project_id}")));
    }
    Ok(())
}

pub fn move_project(
    conn: &Connection,
    project_id: i64,
    direction: MoveDirection,
) -> AppResult<()> {
    super::with_tx(conn, |conn| {
        let (group_id, hidden, sort_order) = conn
            .query_row(
                "SELECT group_id, hidden, sort_order FROM projects WHERE id = ?1",
                params![project_id],
                |row| {
                    Ok((
                        row.get::<_, i64>(0)?,
                        row.get::<_, bool>(1)?,
                        row.get::<_, i64>(2)?,
                    ))
                },
            )
            .optional()?
            .ok_or_else(|| AppError::NotFound(format!("project #{project_id}")))?;
        let neighbor = match direction {
            MoveDirection::Up => conn
                .query_row(
                    "SELECT id, sort_order FROM projects WHERE group_id = ?1 AND hidden = ?2 AND sort_order < ?3 ORDER BY sort_order DESC, id DESC LIMIT 1",
                    params![group_id, hidden, sort_order],
                    |row| Ok((row.get::<_, i64>(0)?, row.get::<_, i64>(1)?)),
                )
                .optional()?,
            MoveDirection::Down => conn
                .query_row(
                    "SELECT id, sort_order FROM projects WHERE group_id = ?1 AND hidden = ?2 AND sort_order > ?3 ORDER BY sort_order, id LIMIT 1",
                    params![group_id, hidden, sort_order],
                    |row| Ok((row.get::<_, i64>(0)?, row.get::<_, i64>(1)?)),
                )
                .optional()?,
        };
        let Some((neighbor_id, neighbor_order)) = neighbor else {
            return Ok(());
        };
        conn.execute(
            "UPDATE projects SET sort_order = ?1 WHERE id = ?2",
            params![neighbor_order, project_id],
        )?;
        conn.execute(
            "UPDATE projects SET sort_order = ?1 WHERE id = ?2",
            params![sort_order, neighbor_id],
        )?;
        Ok(())
    })
}

pub fn set_project_preset(conn: &Connection, project_id: i64, preset_id: i64, linked: bool) -> AppResult<()> {
    if linked {
        conn.execute(
            "INSERT OR IGNORE INTO project_presets (project_id, preset_id) VALUES (?1, ?2)",
            params![project_id, preset_id],
        )?;
    } else {
        conn.execute(
            "DELETE FROM project_presets WHERE project_id = ?1 AND preset_id = ?2",
            params![project_id, preset_id],
        )?;
    }
    Ok(())
}

pub fn set_project_skill(conn: &Connection, project_id: i64, skill_id: i64, linked: bool) -> AppResult<()> {
    if linked {
        conn.execute(
            "INSERT OR IGNORE INTO project_skills (project_id, skill_id) VALUES (?1, ?2)",
            params![project_id, skill_id],
        )?;
    } else {
        conn.execute(
            "DELETE FROM project_skills WHERE project_id = ?1 AND skill_id = ?2",
            params![project_id, skill_id],
        )?;
    }
    Ok(())
}

/// Desired skill set for a project: direct associations plus preset members.
/// Returns (skill, via) where via = "direct" or the preset name.
/// Direct rows come first, then preset rows ordered by preset name.
pub fn desired_skills(conn: &Connection, project_id: i64) -> AppResult<Vec<(Skill, String)>> {
    let mut out: Vec<(Skill, String)> = vec![];
    let mut stmt = conn.prepare(
        "SELECT s.* FROM skills s JOIN project_skills ps ON ps.skill_id = s.id
         WHERE ps.project_id = ?1 ORDER BY s.name",
    )?;
    for row in stmt.query_map(params![project_id], skill_from_row)? {
        out.push((row?, "direct".to_string()));
    }
    let mut stmt = conn.prepare(
        r#"
        WITH RECURSIVE selected_presets(root_id, preset_id, root_name) AS (
            SELECT p.id, p.id, p.name FROM presets p
            JOIN project_presets pp ON pp.preset_id = p.id
            WHERE pp.project_id = ?1
            UNION
            SELECT sp.root_id, pi.included_preset_id, sp.root_name
            FROM selected_presets sp
            JOIN preset_includes pi ON pi.preset_id = sp.preset_id
        )
        SELECT DISTINCT s.*, sp.root_name AS preset_name FROM skills s
        JOIN preset_skills ps ON ps.skill_id = s.id
        JOIN selected_presets sp ON sp.preset_id = ps.preset_id
        ORDER BY sp.root_name, s.name
        "#,
    )?;
    for row in stmt.query_map(params![project_id], |r| {
        Ok((skill_from_row(r)?, r.get::<_, String>("preset_name")?))
    })? {
        let (skill, preset_name) = row?;
        out.push((skill, preset_name));
    }
    Ok(out)
}

// ---------- settings & logs ----------

pub fn get_setting(conn: &Connection, key: &str) -> AppResult<Option<String>> {
    Ok(conn
        .query_row("SELECT value FROM settings WHERE key = ?1", params![key], |r| {
            r.get::<_, String>(0)
        })
        .optional()?)
}

pub fn set_setting(conn: &Connection, key: &str, value: &str) -> AppResult<()> {
    conn.execute(
        "INSERT INTO settings (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![key, value],
    )?;
    Ok(())
}

/// Best-effort operation log: a logging failure must never fail (or roll back)
/// the operation it describes.
pub fn log_op(conn: &Connection, action: &str, detail: &str) {
    if let Err(e) = log_op_strict(conn, action, detail) {
        tracing::warn!(%action, error = %e, "operation audit log write failed");
    }
}

/// Strict variant for callers that want the error (tests, transactions).
pub fn log_op_strict(conn: &Connection, action: &str, detail: &str) -> AppResult<()> {
    conn.execute(
        "INSERT INTO op_logs (action, detail) VALUES (?1, ?2)",
        params![action, detail],
    )?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::Db;

    fn create_test_skill(conn: &Connection, name: &str) -> i64 {
        upsert_skill(
            conn,
            name,
            "local",
            None,
            None,
            &format!("local/{name}"),
            None,
            None,
            None,
            None,
            None,
            None,
            None,
        )
        .unwrap()
    }

    #[test]
    fn list_skills_with_reference_counts_preserves_sorting_and_zero_counts() {
        let db = Db::open_in_memory().unwrap();
        let conn = db.conn.lock().unwrap();
        create_test_skill(&conn, "zeta");
        create_test_skill(&conn, "alpha");

        let skills = list_skills_with_reference_counts(&conn).unwrap();

        assert_eq!(
            skills
                .iter()
                .map(|listed| (listed.skill.name.as_str(), listed.reference_count))
                .collect::<Vec<_>>(),
            vec![("alpha", 0), ("zeta", 0)]
        );
    }

    #[test]
    fn list_skills_with_reference_counts_deduplicates_composed_project_paths() {
        let db = Db::open_in_memory().unwrap();
        let conn = db.conn.lock().unwrap();
        let skill_id = create_test_skill(&conn, "design");
        let base_id = create_preset(&conn, "base", None).unwrap();
        set_preset_skills(&conn, base_id, &[skill_id]).unwrap();
        let linked_id = create_preset(&conn, "linked", None).unwrap();
        reuse_preset(&conn, linked_id, &[base_id], PresetReuseMode::Link).unwrap();

        let duplicate_project = create_project(&conn, "duplicate", "/projects/duplicate").unwrap();
        set_project_skill(&conn, duplicate_project, skill_id, true).unwrap();
        set_project_preset(&conn, duplicate_project, linked_id, true).unwrap();
        let indirect_project = create_project(&conn, "indirect", "/projects/indirect").unwrap();
        set_project_preset(&conn, indirect_project, linked_id, true).unwrap();

        let skills = list_skills_with_reference_counts(&conn).unwrap();

        assert_eq!(skills[0].reference_count, 4);
    }

    #[test]
    fn set_preset_skills_is_atomic_on_fk_violation() {
        let db = Db::open_in_memory().unwrap();
        let conn = db.conn.lock().unwrap();
        let skill_id = upsert_skill(
            &conn, "s", "local", None, None, "local/s", None, None, None, None, None, None, None,
        )
        .unwrap();
        let preset_id = create_preset(&conn, "p", None).unwrap();
        set_preset_skills(&conn, preset_id, &[skill_id]).unwrap();

        // A nonexistent skill id violates the FK mid-loop; the original
        // membership must survive the rollback.
        let err = set_preset_skills(&conn, preset_id, &[skill_id, 99999]);
        assert!(err.is_err());
        let presets = list_presets(&conn).unwrap();
        assert_eq!(presets[0].skill_ids, vec![skill_id]);
    }

    #[test]
    fn nested_composition_resolves_skills_and_affected_projects() {
        let db = Db::open_in_memory().unwrap();
        let conn = db.conn.lock().unwrap();
        let skill_id = create_test_skill(&conn, "design");
        let base_id = create_preset(&conn, "base", None).unwrap();
        set_preset_skills(&conn, base_id, &[skill_id]).unwrap();
        let frontend_id = create_preset(&conn, "frontend", None).unwrap();
        reuse_preset(&conn, frontend_id, &[base_id], PresetReuseMode::Link).unwrap();
        let app_id = create_preset(&conn, "app", None).unwrap();
        reuse_preset(&conn, app_id, &[frontend_id], PresetReuseMode::Link).unwrap();
        let project_id = create_project(&conn, "project", "/tmp/project").unwrap();
        set_project_preset(&conn, project_id, app_id, true).unwrap();
        let desired = desired_skills(&conn, project_id).unwrap();

        assert_eq!(
            (
                effective_preset_skill_ids(&conn, app_id).unwrap(),
                projects_using_preset(&conn, base_id).unwrap(),
                desired[0].1.as_str(),
            ),
            (vec![skill_id], vec![project_id], "app")
        );
    }

    #[test]
    fn preset_project_references_cover_direct_and_composed_usage() {
        let db = Db::open_in_memory().unwrap();
        let conn = db.conn.lock().unwrap();
        let source_id = create_preset(&conn, "source", None).unwrap();
        let linked_id = create_preset(&conn, "linked", None).unwrap();
        reuse_preset(&conn, linked_id, &[source_id], PresetReuseMode::Link).unwrap();
        let copied_id = create_preset(&conn, "copied", None).unwrap();
        reuse_preset(&conn, copied_id, &[source_id], PresetReuseMode::Copy).unwrap();

        let direct_id = create_project(&conn, "Zulu", "/projects/zulu").unwrap();
        set_project_preset(&conn, direct_id, source_id, true).unwrap();
        let indirect_id = create_project(&conn, "alpha", "/projects/alpha").unwrap();
        set_project_preset(&conn, indirect_id, linked_id, true).unwrap();
        let duplicate_id = create_project(&conn, "Beta", "/projects/beta").unwrap();
        set_project_preset(&conn, duplicate_id, source_id, true).unwrap();
        set_project_preset(&conn, duplicate_id, linked_id, true).unwrap();
        let copied_project_id = create_project(&conn, "Copy", "/projects/copy").unwrap();
        set_project_preset(&conn, copied_project_id, copied_id, true).unwrap();

        let references = preset_project_references(&conn, source_id).unwrap();
        assert_eq!(
            references
                .iter()
                .map(|project| (project.name.as_str(), project.path.as_str()))
                .collect::<Vec<_>>(),
            vec![
                ("alpha", "/projects/alpha"),
                ("Beta", "/projects/beta"),
                ("Zulu", "/projects/zulu"),
            ]
        );
        assert_eq!(
            projects_using_preset(&conn, source_id).unwrap(),
            vec![direct_id, indirect_id, duplicate_id]
        );
        assert_eq!(
            list_presets(&conn)
                .unwrap()
                .into_iter()
                .find(|preset| preset.id == source_id)
                .unwrap()
                .reference_count,
            3
        );
    }

    #[test]
    fn preset_composition_rejects_indirect_cycles() {
        let db = Db::open_in_memory().unwrap();
        let conn = db.conn.lock().unwrap();
        let first_id = create_preset(&conn, "first", None).unwrap();
        let second_id = create_preset(&conn, "second", None).unwrap();
        reuse_preset(&conn, first_id, &[second_id], PresetReuseMode::Link).unwrap();

        let error = reuse_preset(&conn, second_id, &[first_id], PresetReuseMode::Link).unwrap_err();
        assert!(matches!(error, AppError::InvalidInput(_)));
    }

    #[test]
    fn copied_preset_skills_do_not_follow_later_source_changes() {
        let db = Db::open_in_memory().unwrap();
        let conn = db.conn.lock().unwrap();
        let first_skill = create_test_skill(&conn, "first");
        let second_skill = create_test_skill(&conn, "second");
        let source_id = create_preset(&conn, "source", None).unwrap();
        set_preset_skills(&conn, source_id, &[first_skill]).unwrap();
        let target_id = create_preset(&conn, "target", None).unwrap();
        reuse_preset(&conn, target_id, &[source_id], PresetReuseMode::Copy).unwrap();
        set_preset_skills(&conn, source_id, &[first_skill, second_skill]).unwrap();

        assert_eq!(
            effective_preset_skill_ids(&conn, target_id).unwrap(),
            vec![first_skill]
        );
    }

    #[test]
    fn deleting_source_preset_detaches_composition() {
        let db = Db::open_in_memory().unwrap();
        let conn = db.conn.lock().unwrap();
        let source_id = create_preset(&conn, "source", None).unwrap();
        let target_id = create_preset(&conn, "target", None).unwrap();
        reuse_preset(&conn, target_id, &[source_id], PresetReuseMode::Link).unwrap();
        delete_preset(&conn, source_id).unwrap();

        let target = list_presets(&conn)
            .unwrap()
            .into_iter()
            .find(|preset| preset.id == target_id)
            .unwrap();
        assert!(target.included_preset_ids.is_empty());
    }

    #[test]
    fn project_groups_order_system_and_visible_before_hidden() {
        let db = Db::open_in_memory().unwrap();
        let conn = db.conn.lock().unwrap();
        let frontend_id = create_project_group(&conn, "Frontend").unwrap();
        let servers_id = create_project_group(&conn, "Servers").unwrap();
        set_project_group_hidden(&conn, frontend_id, true).unwrap();

        assert_eq!(
            list_project_groups(&conn)
                .unwrap()
                .into_iter()
                .map(|group| group.id)
                .collect::<Vec<_>>(),
            vec![0, servers_id, frontend_id]
        );
    }

    #[test]
    fn set_project_group_hidden_rejects_system_group_without_changing_it() {
        let db = Db::open_in_memory().unwrap();
        let conn = db.conn.lock().unwrap();

        let error = set_project_group_hidden(&conn, 0, true).unwrap_err();
        let system_group = list_project_groups(&conn)
            .unwrap()
            .into_iter()
            .find(|group| group.id == 0)
            .unwrap();

        assert_eq!(
            (error.to_string(), system_group.hidden),
            (
                "invalid input: the ungrouped system group visibility cannot be changed".into(),
                false,
            )
        );
    }

    #[test]
    fn move_project_group_skips_groups_in_other_visibility_partition() {
        let db = Db::open_in_memory().unwrap();
        let conn = db.conn.lock().unwrap();
        let first_id = create_project_group(&conn, "First").unwrap();
        let hidden_id = create_project_group(&conn, "Hidden").unwrap();
        let last_id = create_project_group(&conn, "Last").unwrap();
        set_project_group_hidden(&conn, hidden_id, true).unwrap();

        move_project_group(&conn, last_id, MoveDirection::Up).unwrap();

        assert_eq!(
            list_project_groups(&conn)
                .unwrap()
                .into_iter()
                .map(|group| group.id)
                .collect::<Vec<_>>(),
            vec![0, last_id, first_id, hidden_id]
        );
    }

    #[test]
    fn project_group_assignment_and_moves_preserve_independent_hidden_state() {
        let db = Db::open_in_memory().unwrap();
        let conn = db.conn.lock().unwrap();
        let group_id = create_project_group(&conn, "Frontend").unwrap();
        let first_id = create_project(&conn, "first", "/projects/first").unwrap();
        let hidden_id = create_project(&conn, "hidden", "/projects/hidden").unwrap();
        let last_id = create_project(&conn, "last", "/projects/last").unwrap();
        set_project_group(&conn, first_id, group_id).unwrap();
        set_project_group(&conn, hidden_id, group_id).unwrap();
        set_project_group(&conn, last_id, group_id).unwrap();
        set_project_hidden(&conn, hidden_id, true).unwrap();

        move_project(&conn, last_id, MoveDirection::Up).unwrap();

        assert_eq!(
            list_projects(&conn)
                .unwrap()
                .into_iter()
                .map(|project| (project.id, project.hidden))
                .collect::<Vec<_>>(),
            vec![(last_id, false), (hidden_id, true), (first_id, false)]
        );
    }

    #[test]
    fn set_projects_group_moves_unique_projects_in_input_order() {
        let db = Db::open_in_memory().unwrap();
        let conn = db.conn.lock().unwrap();
        let group_id = create_project_group(&conn, "Frontend").unwrap();
        let existing_id = create_project(&conn, "existing", "/projects/existing").unwrap();
        let first_id = create_project(&conn, "first", "/projects/first").unwrap();
        let second_id = create_project(&conn, "second", "/projects/second").unwrap();
        set_project_group(&conn, existing_id, group_id).unwrap();

        let moved = set_projects_group(
            &conn,
            &[second_id, existing_id, second_id, first_id],
            group_id,
        )
        .unwrap();
        let grouped_ids = list_projects(&conn)
            .unwrap()
            .into_iter()
            .filter(|project| project.group_id == group_id)
            .map(|project| project.id)
            .collect::<Vec<_>>();

        assert_eq!(
            (moved, grouped_ids),
            (2, vec![existing_id, second_id, first_id])
        );
    }

    #[test]
    fn set_project_group_replaces_the_previous_group() {
        let db = Db::open_in_memory().unwrap();
        let conn = db.conn.lock().unwrap();
        let source_group_id = create_project_group(&conn, "Source").unwrap();
        let target_group_id = create_project_group(&conn, "Target").unwrap();
        let project_id = create_project(&conn, "project", "/projects/project").unwrap();
        set_project_group(&conn, project_id, source_group_id).unwrap();

        set_project_group(&conn, project_id, target_group_id).unwrap();

        assert_eq!(get_project(&conn, project_id).unwrap().group_id, target_group_id);
    }

    #[test]
    fn set_projects_group_rolls_back_when_any_project_is_missing() {
        let db = Db::open_in_memory().unwrap();
        let conn = db.conn.lock().unwrap();
        let group_id = create_project_group(&conn, "Frontend").unwrap();
        let project_id = create_project(&conn, "first", "/projects/first").unwrap();

        set_projects_group(&conn, &[project_id, i64::MAX], group_id).unwrap_err();

        assert_eq!(get_project(&conn, project_id).unwrap().group_id, 0);
    }

    #[test]
    fn set_projects_group_leaves_projects_unchanged_when_group_is_missing() {
        let db = Db::open_in_memory().unwrap();
        let conn = db.conn.lock().unwrap();
        let project_id = create_project(&conn, "first", "/projects/first").unwrap();

        set_projects_group(&conn, &[project_id], i64::MAX).unwrap_err();

        assert_eq!(get_project(&conn, project_id).unwrap().group_id, 0);
    }

    #[test]
    fn set_projects_group_accepts_an_empty_project_list() {
        let db = Db::open_in_memory().unwrap();
        let conn = db.conn.lock().unwrap();

        assert_eq!(set_projects_group(&conn, &[], i64::MAX).unwrap(), 0);
    }

    #[test]
    fn delete_project_group_moves_projects_to_system_group_without_deleting_them() {
        let db = Db::open_in_memory().unwrap();
        let conn = db.conn.lock().unwrap();
        let existing_id = create_project(&conn, "existing", "/projects/existing").unwrap();
        let group_id = create_project_group(&conn, "Frontend").unwrap();
        let first_id = create_project(&conn, "first", "/projects/first").unwrap();
        let second_id = create_project(&conn, "second", "/projects/second").unwrap();
        set_project_group(&conn, first_id, group_id).unwrap();
        set_project_group(&conn, second_id, group_id).unwrap();

        let moved = delete_project_group(&conn, group_id).unwrap();

        assert_eq!(moved, 2);
        assert_eq!(
            list_projects(&conn)
                .unwrap()
                .into_iter()
                .map(|project| (project.id, project.group_id))
                .collect::<Vec<_>>(),
            vec![(existing_id, 0), (first_id, 0), (second_id, 0)]
        );
    }

    #[test]
    fn project_group_names_are_case_insensitively_detected() {
        let db = Db::open_in_memory().unwrap();
        let conn = db.conn.lock().unwrap();
        create_project_group(&conn, "Frontend").unwrap();

        assert!(project_group_name_exists(&conn, "frontend", None).unwrap());
    }

    #[test]
    fn update_status_stays_ok_when_only_other_repository_paths_change() {
        let db = Db::open_in_memory().unwrap();
        let conn = db.conn.lock().unwrap();
        let skill_id = upsert_skill(
            &conn,
            "skill",
            "net",
            Some("owner"),
            Some("repo"),
            "net/owner/repo/skill",
            None,
            Some("installed-commit"),
            None,
            None,
            Some("github"),
            Some("skills/skill"),
            Some("installed-tree"),
        )
        .unwrap();

        set_skill_update_status(&conn, skill_id, "new-commit", Some("installed-tree")).unwrap();

        assert_eq!(get_skill(&conn, skill_id).unwrap().status, "ok");
    }

    #[test]
    fn update_status_marks_skill_when_its_directory_tree_changes() {
        let db = Db::open_in_memory().unwrap();
        let conn = db.conn.lock().unwrap();
        let skill_id = upsert_skill(
            &conn,
            "skill",
            "net",
            Some("owner"),
            Some("repo"),
            "net/owner/repo/skill",
            None,
            Some("installed-commit"),
            None,
            None,
            Some("github"),
            Some("skills/skill"),
            Some("installed-tree"),
        )
        .unwrap();

        set_skill_update_status(&conn, skill_id, "new-commit", Some("changed-tree")).unwrap();

        assert_eq!(
            get_skill(&conn, skill_id).unwrap().status,
            "update_available"
        );
    }

    #[test]
    fn agent_crud_roundtrip() {
        let db = Db::open_in_memory().unwrap();
        let conn = db.conn.lock().unwrap();
        let id = create_agent(&conn, "claude", ".claude/skills", false).unwrap();
        let agent = get_agent(&conn, id).unwrap();
        assert_eq!(agent.name, "claude");
        assert_eq!(agent.target_dir, ".claude/skills");
        assert!(!agent.global_enabled);

        update_agent(&conn, id, "claude", ".claude/skills", true).unwrap();
        assert!(get_agent(&conn, id).unwrap().global_enabled);

        assert_eq!(list_agents(&conn).unwrap().len(), 1);
        delete_agent(&conn, id).unwrap();
        assert!(get_agent(&conn, id).is_err());
    }

    #[test]
    fn agent_unique_name_and_dir() {
        let db = Db::open_in_memory().unwrap();
        let conn = db.conn.lock().unwrap();
        create_agent(&conn, "claude", ".claude/skills", false).unwrap();
        assert!(create_agent(&conn, "claude", ".other/skills", false).is_err());
        assert!(create_agent(&conn, "other", ".claude/skills", false).is_err());
    }

    #[test]
    fn agent_dir_plan_or_semantics() {
        let db = Db::open_in_memory().unwrap();
        let conn = db.conn.lock().unwrap();
        let project_id = create_project(&conn, "p", "/tmp/p").unwrap();
        let other_id = create_project(&conn, "q", "/tmp/q").unwrap();
        let global = create_agent(&conn, "global", ".g/skills", true).unwrap();
        let linked = create_agent(&conn, "linked", ".l/skills", false).unwrap();
        let _idle = create_agent(&conn, "idle", ".i/skills", false).unwrap();
        set_project_agent(&conn, project_id, linked, true).unwrap();

        let plan = agent_dir_plan(&conn, project_id).unwrap();
        assert_eq!(plan.get(".g/skills"), Some(&true)); // global wins everywhere
        assert_eq!(plan.get(".l/skills"), Some(&true)); // project-linked
        assert_eq!(plan.get(".i/skills"), Some(&false)); // known but inactive

        let plan = agent_dir_plan(&conn, other_id).unwrap();
        assert_eq!(plan.get(".l/skills"), Some(&false)); // link is per-project

        // Unlink and cascade checks.
        set_project_agent(&conn, project_id, linked, false).unwrap();
        assert_eq!(
            agent_dir_plan(&conn, project_id).unwrap().get(".l/skills"),
            Some(&false)
        );
        set_project_agent(&conn, project_id, global, true).unwrap();
        delete_agent(&conn, global).unwrap();
        assert!(get_project(&conn, project_id).unwrap().agent_ids.is_empty());
    }
}
