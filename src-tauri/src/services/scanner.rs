use std::collections::HashSet;
use std::path::Path;

use rusqlite::Connection;

use crate::db::repo;
use crate::error::{AppError, AppResult};
use crate::models::{LocalSkillPreview, Skill};
use crate::paths::Paths;
use crate::services::linker;
use crate::services::platform_link;
use crate::validate;

/// Minimal SKILL.md YAML frontmatter parse: extract `name` and `description`.
/// Supports single-line values and multiline YAML block scalars (>- / |).
pub fn parse_skill_md(skill_dir: &Path) -> (Option<String>, Option<String>) {
    let content = match std::fs::read_to_string(skill_dir.join("SKILL.md")) {
        Ok(c) => c,
        Err(_) => return (None, None),
    };
    parse_skill_md_content(&content)
}

pub fn parse_skill_md_content(content: &str) -> (Option<String>, Option<String>) {
    let mut lines = content.lines();
    if lines.next().map(str::trim) != Some("---") {
        return (None, None);
    }
    let mut name = None;
    let mut description = None;
    let mut multiline_key: Option<String> = None;
    let mut multiline_val = String::new();

    for line in lines {
        let trimmed = line.trim();
        if trimmed == "---" {
            break;
        }

        if let Some(ref key) = multiline_key {
            if line.starts_with("  ") || line.starts_with('\t') {
                if !multiline_val.is_empty() {
                    multiline_val.push(' ');
                }
                multiline_val.push_str(trimmed);
                continue;
            } else {
                if key == "description" && description.is_none() && !multiline_val.is_empty() {
                    description = Some(multiline_val.clone());
                }
                multiline_key = None;
                multiline_val.clear();
            }
        }

        if let Some(v) = trimmed.strip_prefix("name:") {
            let val = strip_quotes(v);
            if !val.is_empty() {
                name = Some(val);
            }
        } else if let Some(v) = trimmed.strip_prefix("description:") {
            let val = strip_quotes(v);
            if val == ">-" || val == ">" || val == "|" || val == "|-" || val.is_empty() {
                multiline_key = Some("description".to_string());
                multiline_val.clear();
            } else {
                description = Some(val);
            }
        }
    }

    if let Some(ref key) = multiline_key {
        if key == "description" && description.is_none() && !multiline_val.is_empty() {
            description = Some(multiline_val);
        }
    }

    (name.filter(|s| !s.is_empty()), description.filter(|s| !s.is_empty()))
}

fn strip_quotes(v: &str) -> String {
    let v = v.trim();
    v.trim_matches(|c| c == '"' || c == '\'').trim().to_string()
}

fn find_sub_skills(dir: &Path) -> Vec<String> {
    let mut sub_skills = vec![];
    let Ok(entries) = std::fs::read_dir(dir) else {
        return sub_skills;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        if !name.starts_with('.') && path.is_dir() && path.join("SKILL.md").is_file() {
            sub_skills.push(name);
        }
    }
    sub_skills.sort();
    sub_skills
}

fn parse_readme_desc(dir: &Path) -> Option<String> {
    let content = std::fs::read_to_string(dir.join("README.md")).ok()?;
    for line in content.lines() {
        let trimmed = line.trim();
        if !trimmed.is_empty() && !trimmed.starts_with('#') {
            return Some(trimmed.to_string());
        }
    }
    None
}

/// Inspect a user-picked folder and describe what a local import would do.
/// Rejects folders that are neither a skill (SKILL.md) nor a collection.
pub fn preview_local_import(paths: &Paths, src: &Path) -> AppResult<LocalSkillPreview> {
    if !src.is_dir() {
        return Err(AppError::InvalidInput(format!("not a directory: {}", src.display())));
    }
    let dir_name = src
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .ok_or_else(|| AppError::InvalidInput("cannot resolve folder name".into()))?;
    if dir_name.starts_with('.') {
        return Err(AppError::InvalidInput(format!("hidden folder not allowed: {dir_name}")));
    }
    // Importing from inside the managed skills tree would copy onto itself.
    // Compare canonicalized paths so a symlinked source can't sidestep the check.
    let canonical_src = platform_link::normalize(src.canonicalize()?);
    let skills_dir = platform_link::normalize(
        paths
            .skills_dir()
            .canonicalize()
            .unwrap_or_else(|_| paths.skills_dir()),
    );
    if canonical_src.starts_with(&skills_dir) {
        return Err(AppError::InvalidInput(
            "folder is already inside ~/.longan/skills".into(),
        ));
    }

    let conflict = paths.local_dir().join(&dir_name).exists();

    if src.join("SKILL.md").is_file() {
        let (fm_name, fm_desc) = parse_skill_md(src);
        return Ok(LocalSkillPreview {
            name: fm_name
                .and_then(|n| validate::sanitize_link_name(&n))
                .unwrap_or_else(|| dir_name.clone()),
            dir_name,
            kind: "skill".into(),
            description: fm_desc,
            sub_skills: vec![],
            conflict,
        });
    }

    let sub_skills = find_sub_skills(src);
    if !sub_skills.is_empty() {
        return Ok(LocalSkillPreview {
            name: dir_name.clone(),
            dir_name,
            kind: "collection".into(),
            description: parse_readme_desc(src),
            sub_skills,
            conflict,
        });
    }

    Err(AppError::NotFound(format!(
        "no SKILL.md found in '{}' or its direct subfolders",
        src.display()
    )))
}

/// Copy a validated folder into `local/` and register it via rescan.
pub fn import_local(conn: &Connection, paths: &Paths, src: &Path) -> AppResult<Skill> {
    let preview = preview_local_import(paths, src)?;
    if preview.conflict {
        return Err(AppError::InvalidInput(format!(
            "a local skill folder named '{}' already exists",
            preview.dir_name
        )));
    }
    paths.ensure_layout()?;

    // Stage on the target filesystem, then rename so a half-copied dir never registers.
    let target = paths.local_dir().join(&preview.dir_name);
    let staging = paths.local_dir().join(format!(".staging-{}", preview.dir_name));
    if staging.exists() {
        std::fs::remove_dir_all(&staging)?;
    }
    validate::copy_dir_safe(src, &staging, &[".git"], 0)?;
    std::fs::rename(&staging, &target)?;

    rescan(conn, paths)?;
    repo::log_op(conn, "import_local", &format!("local/{}", preview.dir_name));
    let dir_path = format!("local/{}", preview.dir_name);
    repo::list_skills(conn)?
        .into_iter()
        .find(|s| s.dir_path == dir_path)
        .ok_or_else(|| AppError::Other(format!("imported skill not found: {dir_path}")))
}

/// Scan `local/` for skill dirs or collection dirs and upsert them.
/// Also verify every known skill dir still exists; mark vanished ones `missing`.
pub fn rescan(conn: &Connection, paths: &Paths) -> AppResult<()> {
    paths.ensure_layout()?;

    let local_dir = paths.local_dir();
    let mut scanned_dir_paths = HashSet::new();

    if let Ok(entries) = std::fs::read_dir(&local_dir) {
        for entry in entries.flatten() {
            let dir = entry.path();
            let dir_name = entry.file_name().to_string_lossy().to_string();

            if dir_name.starts_with('.') || !dir.is_dir() {
                continue;
            }

            let dir_path = format!("local/{dir_name}");

            if dir.join("SKILL.md").is_file() {
                // Case 1: Standard single skill folder
                let (fm_name, fm_desc) = parse_skill_md(&dir);
                // The name later becomes a link name inside projects, so a
                // hostile frontmatter value must never survive to the DB.
                let name = fm_name
                    .and_then(|n| validate::sanitize_link_name(&n))
                    .unwrap_or_else(|| dir_name.clone());
                repo::upsert_skill(
                    conn,
                    &name,
                    "local",
                    None,
                    None,
                    &dir_path,
                    fm_desc.as_deref(),
                    None, // sha
                    None, // source_url - local skills don't have this
                    None, // github_source - local skills don't have this
                    None, // install_source - defaults in DB
                    None,
                    None,
                )?;
                scanned_dir_paths.insert(dir_path);
            } else {
                // Case 2: Skill collection folder containing sub-skills
                let sub_skills = find_sub_skills(&dir);
                if !sub_skills.is_empty() {
                    let desc = parse_readme_desc(&dir).unwrap_or_else(|| {
                        let sample = if sub_skills.len() <= 3 {
                            sub_skills.join(", ")
                        } else {
                            format!("{}, {}, ...", sub_skills[0], sub_skills[1])
                        };
                        format!("Skill Collection ({} skills: {})", sub_skills.len(), sample)
                    });
                    repo::upsert_skill(
                        conn,
                        &dir_name,
                        "local",
                        None,
                        None,
                        &dir_path,
                        Some(&desc),
                        None, // sha
                        None, // source_url - local skills don't have this
                        None, // github_source - local skills don't have this
                        None, // install_source - defaults in DB
                        None,
                        None,
                    )?;
                    scanned_dir_paths.insert(dir_path);
                }
            }
        }
    }

    // Status & cleanup pass over everything already in the DB. All row changes
    // commit atomically; link syncs run after commit so a sync failure can't
    // leave the DB half-updated.
    let mut affected_projects: Vec<i64> = vec![];
    crate::db::with_tx(conn, |conn| {
        for skill in repo::list_skills(conn)? {
            if skill.source_type == "local" {
                let exists = scanned_dir_paths.contains(&skill.dir_path);
                if !exists {
                    affected_projects.extend(repo::projects_using_skill(conn, skill.id)?);
                    repo::delete_skill(conn, skill.id)?;
                } else if skill.status == "missing" {
                    repo::set_skill_status(conn, skill.id, "ok")?;
                }
            } else {
                let exists = paths.skill_source_dir(&skill.dir_path).join("SKILL.md").is_file();
                if !exists && skill.status != "missing" {
                    repo::set_skill_status(conn, skill.id, "missing")?;
                } else if exists && skill.status == "missing" {
                    repo::set_skill_status(conn, skill.id, "ok")?;
                }
            }
        }
        Ok(())
    })?;
    if !affected_projects.is_empty() {
        affected_projects.sort_unstable();
        affected_projects.dedup();
        let _ = linker::sync_projects(conn, paths, &affected_projects);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::Db;

    fn write_skill(dir: &Path, name: &str, desc: &str) {
        std::fs::create_dir_all(dir).unwrap();
        std::fs::write(
            dir.join("SKILL.md"),
            format!("---\nname: {name}\ndescription: \"{desc}\"\n---\n\n# Body\n"),
        )
        .unwrap();
    }

    #[test]
    fn parses_frontmatter() {
        let tmp = tempfile::tempdir().unwrap();
        write_skill(tmp.path(), "my-skill", "Does things.");
        let (name, desc) = parse_skill_md(tmp.path());
        assert_eq!(name.as_deref(), Some("my-skill"));
        assert_eq!(desc.as_deref(), Some("Does things."));
    }

    #[test]
    fn parses_multiline_frontmatter_description() {
        let tmp = tempfile::tempdir().unwrap();
        std::fs::write(
            tmp.path().join("SKILL.md"),
            "---\nname: multiline-skill\ndescription: >-\n  Line 1\n  Line 2\n---\n",
        )
        .unwrap();
        let (name, desc) = parse_skill_md(tmp.path());
        assert_eq!(name.as_deref(), Some("multiline-skill"));
        assert_eq!(desc.as_deref(), Some("Line 1 Line 2"));
    }

    #[test]
    fn frontmatter_missing_returns_none() {
        let tmp = tempfile::tempdir().unwrap();
        std::fs::write(tmp.path().join("SKILL.md"), "# no frontmatter\n").unwrap();
        let (name, desc) = parse_skill_md(tmp.path());
        assert!(name.is_none());
        assert!(desc.is_none());
    }

    #[test]
    fn rescan_upserts_local_and_removes_stale() {
        let tmp = tempfile::tempdir().unwrap();
        let paths = Paths::with_root(tmp.path().to_path_buf());
        paths.ensure_layout().unwrap();
        write_skill(&paths.local_dir().join("alpha"), "alpha", "a");

        let db = Db::open_in_memory().unwrap();
        let conn = db.conn.lock().unwrap();
        rescan(&conn, &paths).unwrap();
        let skills = repo::list_skills(&conn).unwrap();
        assert_eq!(skills.len(), 1);
        assert_eq!(skills[0].dir_path, "local/alpha");
        assert_eq!(skills[0].status, "ok");

        // Remove the dir -> next rescan removes stale local skill entry.
        std::fs::remove_dir_all(paths.local_dir().join("alpha")).unwrap();
        rescan(&conn, &paths).unwrap();
        let skills = repo::list_skills(&conn).unwrap();
        assert_eq!(skills.len(), 0);
    }

    #[test]
    fn rescan_discovers_skill_collection_as_single_unit() {
        let tmp = tempfile::tempdir().unwrap();
        let paths = Paths::with_root(tmp.path().to_path_buf());
        paths.ensure_layout().unwrap();
        let dc_skill_dir = paths.local_dir().join("dc-skill");
        write_skill(&dc_skill_dir.join("dc-class"), "dc-class", "Class sync");
        write_skill(
            &dc_skill_dir.join("dc-module-design"),
            "dc-module-design",
            "Module design",
        );

        let db = Db::open_in_memory().unwrap();
        let conn = db.conn.lock().unwrap();
        rescan(&conn, &paths).unwrap();
        let skills = repo::list_skills(&conn).unwrap();
        assert_eq!(skills.len(), 1);
        assert_eq!(skills[0].name, "dc-skill");
        assert_eq!(skills[0].dir_path, "local/dc-skill");
        assert!(skills[0]
            .description
            .as_deref()
            .unwrap_or("")
            .contains("Skill Collection"));
    }

    #[test]
    fn rescan_sanitizes_hostile_frontmatter_name() {
        let tmp = tempfile::tempdir().unwrap();
        let paths = Paths::with_root(tmp.path().to_path_buf());
        paths.ensure_layout().unwrap();
        write_skill(&paths.local_dir().join("evil"), "../../.ssh/authorized_keys", "e");

        let db = Db::open_in_memory().unwrap();
        let conn = db.conn.lock().unwrap();
        rescan(&conn, &paths).unwrap();
        let skills = repo::list_skills(&conn).unwrap();
        assert_eq!(skills.len(), 1);
        assert!(!skills[0].name.contains('/'));
        assert!(!skills[0].name.contains(".."));
    }

    #[test]
    fn rescan_skips_hidden_directories() {
        let tmp = tempfile::tempdir().unwrap();
        let paths = Paths::with_root(tmp.path().to_path_buf());
        paths.ensure_layout().unwrap();
        let hidden_dir = paths.local_dir().join(".hidden");
        write_skill(&hidden_dir.join("secret-skill"), "secret", "Secret");

        let db = Db::open_in_memory().unwrap();
        let conn = db.conn.lock().unwrap();
        rescan(&conn, &paths).unwrap();
        let skills = repo::list_skills(&conn).unwrap();
        assert_eq!(skills.len(), 0);
    }

    #[test]
    fn preview_detects_skill_collection_and_conflict() {
        let tmp = tempfile::tempdir().unwrap();
        let paths = Paths::with_root(tmp.path().join("console"));
        paths.ensure_layout().unwrap();

        let skill_src = tmp.path().join("my-skill");
        write_skill(&skill_src, "my-skill", "single");
        let p = preview_local_import(&paths, &skill_src).unwrap();
        assert_eq!(p.kind, "skill");
        assert_eq!(p.name, "my-skill");
        assert!(!p.conflict);

        let coll_src = tmp.path().join("my-collection");
        write_skill(&coll_src.join("sub-a"), "sub-a", "a");
        write_skill(&coll_src.join("sub-b"), "sub-b", "b");
        let p = preview_local_import(&paths, &coll_src).unwrap();
        assert_eq!(p.kind, "collection");
        assert_eq!(p.sub_skills, vec!["sub-a", "sub-b"]);

        // Existing dir with the same name flags a conflict.
        std::fs::create_dir_all(paths.local_dir().join("my-skill")).unwrap();
        let p = preview_local_import(&paths, &skill_src).unwrap();
        assert!(p.conflict);

        // Plain folder without any SKILL.md is rejected.
        let empty = tmp.path().join("empty");
        std::fs::create_dir_all(&empty).unwrap();
        assert!(preview_local_import(&paths, &empty).is_err());
    }

    #[test]
    fn import_local_copies_and_registers() {
        let tmp = tempfile::tempdir().unwrap();
        let paths = Paths::with_root(tmp.path().join("console"));
        paths.ensure_layout().unwrap();

        let src = tmp.path().join("imported-skill");
        write_skill(&src, "imported-skill", "desc");
        std::fs::create_dir_all(src.join(".git")).unwrap();
        std::fs::write(src.join(".git/HEAD"), "ref").unwrap();

        let db = Db::open_in_memory().unwrap();
        let conn = db.conn.lock().unwrap();
        let skill = import_local(&conn, &paths, &src).unwrap();
        assert_eq!(skill.name, "imported-skill");
        assert_eq!(skill.dir_path, "local/imported-skill");
        assert_eq!(skill.source_type, "local");

        let target = paths.local_dir().join("imported-skill");
        assert!(target.join("SKILL.md").is_file());
        assert!(!target.join(".git").exists());

        // Second import of the same folder name is rejected.
        assert!(import_local(&conn, &paths, &src).is_err());
    }
}
