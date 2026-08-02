use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use rusqlite::Connection;

use crate::db::repo;
use crate::error::AppResult;
use crate::models::{BrokenLink, EffectiveSkill, Skill, SyncReport};
use crate::paths::Paths;
use crate::services::platform_link;
use crate::validate;

/// The always-on links dir (Agent Skills open standard). User-defined agents
/// mirror the same links into their own dirs; this one is not a DB row.
pub const DEFAULT_LINKS_DIR: &str = ".agents/skills";

/// Resolve the desired (skill, via) rows into a link plan keyed by short name.
/// Direct associations win over preset ones; ties between presets are decided
/// by the incoming order (already sorted by preset name). Entries pointing to
/// the same dir_path are duplicates, not conflicts.
pub fn resolve_effective(rows: &[(Skill, String)]) -> Vec<EffectiveSkill> {
    let mut winners: BTreeMap<String, &Skill> = BTreeMap::new();
    let mut out: Vec<EffectiveSkill> = vec![];
    for (skill, via) in rows {
        match winners.get(&skill.name) {
            None => {
                winners.insert(skill.name.clone(), skill);
                out.push(EffectiveSkill {
                    skill_id: skill.id,
                    name: skill.name.clone(),
                    dir_path: skill.dir_path.clone(),
                    via: via.clone(),
                    conflicted: false,
                });
            }
            Some(winner) => {
                if winner.dir_path != skill.dir_path {
                    // Same short name, different source: this entry loses.
                    out.push(EffectiveSkill {
                        skill_id: skill.id,
                        name: skill.name.clone(),
                        dir_path: skill.dir_path.clone(),
                        via: via.clone(),
                        conflicted: true,
                    });
                }
                // Same dir_path via another preset: skip silently.
            }
        }
    }
    out
}

/// Sync `<project>/.agents/skills/` to match the desired link set.
/// `desired` maps link name -> absolute target dir. Only symlinks pointing
/// under `skills_root` are managed; anything else is left untouched.
pub fn sync_project_links(
    project_path: &Path,
    desired: &BTreeMap<String, PathBuf>,
    skills_root: &Path,
) -> AppResult<SyncReport> {
    if !project_path.is_dir() {
        let mut report = SyncReport::default();
        report.project_path_missing = true;
        return Ok(report);
    }
    sync_links_dir(
        &project_path.join(DEFAULT_LINKS_DIR),
        desired,
        skills_root,
        true,
    )
}

/// Sync one links dir to match the desired link set. Only symlinks pointing
/// under `skills_root` are managed; anything else is left untouched.
/// `ensure_dir = false` is sweep mode: a missing dir returns an empty report
/// without creating anything, and after removals the now-empty dir itself is
/// removed (non-recursive, best-effort) so disabled agent dirs don't linger.
pub fn sync_links_dir(
    links_dir: &Path,
    desired: &BTreeMap<String, PathBuf>,
    skills_root: &Path,
    ensure_dir: bool,
) -> AppResult<SyncReport> {
    let mut report = SyncReport::default();
    if ensure_dir {
        std::fs::create_dir_all(links_dir)?;
    } else if !links_dir.is_dir() {
        return Ok(report);
    }
    let skills_root = platform_link::normalize(skills_root);

    // Pass 1: remove managed links that are no longer desired or point elsewhere.
    for entry in std::fs::read_dir(links_dir)? {
        let entry = entry?;
        let path = entry.path();
        if !platform_link::is_dir_link(&path) {
            continue; // regular file/dir placed by the user: never touch
        }
        let Some(target) = platform_link::read_link_target(&path) else {
            continue;
        };
        if !target.starts_with(&skills_root) {
            continue; // link owned by someone else
        }
        let name = entry.file_name().to_string_lossy().to_string();
        let keep = desired.get(&name).is_some_and(|want| *want == target);
        if !keep {
            platform_link::remove_link(&path)?;
            report.removed.push(name);
        }
    }

    // Pass 2: create missing links. Skip skills whose source dir vanished.
    for (name, target) in desired {
        let link = links_dir.join(name);
        if std::fs::symlink_metadata(&link).is_ok() {
            continue; // already correct (kept above) or user-owned; don't clobber
        }
        if !target.is_dir() {
            report.conflicts.push(format!("{name}: source missing"));
            continue;
        }
        platform_link::create_dir_link(target, &link)?;
        report.created.push(name.clone());
    }

    if !ensure_dir {
        // Sweep mode: collect the dir if nothing (user-owned or otherwise) is
        // left in it. Non-recursive on purpose; parents like `.claude/` stay.
        let _ = std::fs::remove_dir(links_dir);
    }
    Ok(report)
}

/// Full project sync: effective set from the DB -> symlink diff on disk,
/// across the default links dir and every agent dir known to the DB.
pub fn sync_project(conn: &Connection, paths: &Paths, project_id: i64) -> AppResult<SyncReport> {
    sync_project_with_sweeps(conn, paths, project_id, &[])
}

/// Like `sync_project`, but also sweeps `extra_sweep_dirs` (e.g. an agent's
/// old target_dir after a rename/delete) as inactive so their managed links
/// are removed.
pub fn sync_project_with_sweeps(
    conn: &Connection,
    paths: &Paths,
    project_id: i64,
    extra_sweep_dirs: &[String],
) -> AppResult<SyncReport> {
    let project = repo::get_project(conn, project_id)?;
    let rows = repo::desired_skills(conn, project_id)?;
    let effective = resolve_effective(&rows);

    let mut desired: BTreeMap<String, PathBuf> = BTreeMap::new();
    let mut invalid: Vec<String> = vec![];
    for e in effective.iter().filter(|e| !e.conflicted) {
        // Defense in depth: names and dir_paths are sanitized when stored, but
        // a tampered DB row must still never produce an escaping link.
        let name_ok = validate::sanitize_link_name(&e.name).as_deref() == Some(e.name.as_str());
        match (name_ok, paths.checked_skill_source_dir(&e.dir_path)) {
            (true, Ok(target)) => {
                desired.insert(e.name.clone(), target);
            }
            _ => invalid.push(format!("{}: invalid name or path", e.name)),
        }
    }

    // Dir plan: the default dir is always active; agent dirs follow their
    // enabled/linked state; extra sweep dirs default to inactive.
    let mut dirs = repo::agent_dir_plan(conn, project_id)?;
    dirs.insert(DEFAULT_LINKS_DIR.to_string(), true);
    for dir in extra_sweep_dirs {
        dirs.entry(dir.clone()).or_insert(false);
    }

    let project_path = Path::new(&project.path);
    let mut report = SyncReport::default();
    if !project_path.is_dir() {
        report.project_path_missing = true;
        return Ok(report);
    }
    let empty: BTreeMap<String, PathBuf> = BTreeMap::new();
    let skills_root = paths.skills_dir();
    for (dir, active) in &dirs {
        // Same defense in depth as above: an agent dir straight from the DB
        // must still be a safe relative path before it is joined.
        if dir != DEFAULT_LINKS_DIR
            && validate::normalize_agent_dir(dir).ok().as_deref() != Some(dir.as_str())
        {
            report.conflicts.push(format!("{dir}: invalid agent dir"));
            continue;
        }
        let part = sync_links_dir(
            &project_path.join(dir),
            if *active { &desired } else { &empty },
            &skills_root,
            *active,
        )?;
        // Keep bare names for the default dir; prefix agent-dir entries so the
        // report stays readable when several dirs change at once.
        let prefix = |name: String| {
            if dir == DEFAULT_LINKS_DIR {
                name
            } else {
                format!("{dir}/{name}")
            }
        };
        report.created.extend(part.created.into_iter().map(prefix));
        report.removed.extend(part.removed.into_iter().map(prefix));
        report.conflicts.extend(part.conflicts.into_iter().map(prefix));
    }
    report.conflicts.extend(invalid);
    report
        .conflicts
        .extend(effective.iter().filter(|e| e.conflicted).map(|e| {
            format!("{} (via {})", e.name, e.via)
        }));
    repo::log_op(
        conn,
        "sync_project",
        &format!(
            "project #{project_id}: +{} -{} !{}",
            report.created.len(),
            report.removed.len(),
            report.conflicts.len()
        ),
    );
    Ok(report)
}

/// Sync several projects. One bad path doesn't block the rest; per-project
/// failures are collected and returned so callers can log or surface them.
pub fn sync_projects(conn: &Connection, paths: &Paths, project_ids: &[i64]) -> AppResult<Vec<String>> {
    sync_projects_with_sweeps(conn, paths, project_ids, &[])
}

/// Batch variant of `sync_project_with_sweeps` with the same error collection
/// behavior as `sync_projects`.
pub fn sync_projects_with_sweeps(
    conn: &Connection,
    paths: &Paths,
    project_ids: &[i64],
    extra_sweep_dirs: &[String],
) -> AppResult<Vec<String>> {
    let mut errors = vec![];
    for id in project_ids {
        if let Err(e) = sync_project_with_sweeps(conn, paths, *id, extra_sweep_dirs) {
            errors.push(format!("project #{id}: {e}"));
        }
    }
    if !errors.is_empty() {
        tracing::warn!(errors = %errors.join("; "), "project synchronization errors");
        repo::log_op(conn, "sync_errors", &errors.join("; "));
    }
    Ok(errors)
}

/// Effective skill list for the project detail view.
pub fn effective_skills(conn: &Connection, project_id: i64) -> AppResult<Vec<EffectiveSkill>> {
    let rows = repo::desired_skills(conn, project_id)?;
    Ok(resolve_effective(&rows))
}

/// Doctor: find managed links whose target no longer exists, across all
/// projects and all link dirs (default + every agent dir, active or not —
/// stale leftovers should be found too).
pub fn doctor_scan(conn: &Connection, paths: &Paths) -> AppResult<Vec<BrokenLink>> {
    let mut broken = vec![];
    let skills_root = platform_link::normalize(paths.skills_dir());
    let mut link_dirs = std::collections::BTreeSet::from([DEFAULT_LINKS_DIR.to_string()]);
    link_dirs.extend(repo::list_agents(conn)?.into_iter().map(|a| a.target_dir));
    for project in repo::list_projects(conn)? {
        for dir in &link_dirs {
            if dir != DEFAULT_LINKS_DIR
                && validate::normalize_agent_dir(dir).ok().as_deref() != Some(dir.as_str())
            {
                continue; // tampered DB row: never join it onto a project path
            }
            let links_dir = Path::new(&project.path).join(dir);
            scan_links_dir(&links_dir, &skills_root, &project, &mut broken);
        }
    }
    Ok(broken)
}

/// Collect managed links under one dir whose target dir vanished.
fn scan_links_dir(
    links_dir: &Path,
    skills_root: &Path,
    project: &crate::models::Project,
    broken: &mut Vec<BrokenLink>,
) {
    let entries = match std::fs::read_dir(links_dir) {
        Ok(e) => e,
        Err(_) => return,
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if !platform_link::is_dir_link(&path) {
            continue;
        }
        let Some(target) = platform_link::read_link_target(&path) else {
            continue;
        };
        if target.starts_with(skills_root) && !target.is_dir() {
            broken.push(BrokenLink {
                project_id: project.id,
                project_name: project.name.clone(),
                link_path: path.to_string_lossy().to_string(),
                target: target.to_string_lossy().to_string(),
            });
        }
    }
}

/// Doctor fix: remove broken managed links, then resync every project.
pub fn doctor_fix(conn: &Connection, paths: &Paths) -> AppResult<usize> {
    let broken = doctor_scan(conn, paths)?;
    for b in &broken {
        let _ = platform_link::remove_link(Path::new(&b.link_path));
    }
    let ids: Vec<i64> = repo::list_projects(conn)?.iter().map(|p| p.id).collect();
    sync_projects(conn, paths, &ids)?;
    repo::log_op(conn, "doctor_fix", &format!("{} broken links removed", broken.len()));
    Ok(broken.len())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn skill(id: i64, name: &str, dir_path: &str) -> Skill {
        Skill {
            id,
            name: name.into(),
            source_type: "net".into(),
            install_source: None,
            owner: None,
            repo: None,
            dir_path: dir_path.into(),
            description: None,
            latest_sha: None,
            source_path: None,
            tree_sha: None,
            status: "ok".into(),
            updated_at: String::new(),
            source_url: None,
            github_source: None,
        }
    }

    #[test]
    fn direct_wins_name_conflicts() {
        let rows = vec![
            (skill(1, "react", "net/a/x/react"), "direct".to_string()),
            (skill(2, "react", "net/b/y/react"), "java".to_string()),
        ];
        let eff = resolve_effective(&rows);
        assert_eq!(eff.len(), 2);
        assert!(!eff[0].conflicted);
        assert_eq!(eff[0].via, "direct");
        assert!(eff[1].conflicted);
    }

    #[test]
    fn same_skill_via_two_presets_is_not_a_conflict() {
        let rows = vec![
            (skill(1, "tdd", "net/a/x/tdd"), "java".to_string()),
            (skill(1, "tdd", "net/a/x/tdd"), "kotlin".to_string()),
        ];
        let eff = resolve_effective(&rows);
        assert_eq!(eff.len(), 1);
        assert!(!eff[0].conflicted);
    }

    fn setup_dirs() -> (tempfile::TempDir, Paths, PathBuf) {
        let tmp = tempfile::tempdir().unwrap();
        let paths = Paths::with_root(tmp.path().join("console"));
        paths.ensure_layout().unwrap();
        let project = tmp.path().join("project");
        std::fs::create_dir_all(&project).unwrap();
        (tmp, paths, project)
    }

    fn make_source(paths: &Paths, rel: &str) -> PathBuf {
        let dir = paths.skills_dir().join(rel);
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("SKILL.md"), "---\nname: x\n---\n").unwrap();
        dir
    }

    #[test]
    fn creates_and_removes_managed_links() {
        let (_tmp, paths, project) = setup_dirs();
        let src_a = make_source(&paths, "local/alpha");
        let src_b = make_source(&paths, "local/beta");

        let mut desired = BTreeMap::new();
        desired.insert("alpha".to_string(), src_a.clone());
        desired.insert("beta".to_string(), src_b);
        let report = sync_project_links(&project, &desired, &paths.skills_dir()).unwrap();
        assert_eq!(report.created.len(), 2);

        // Second run is idempotent.
        let report = sync_project_links(&project, &desired, &paths.skills_dir()).unwrap();
        assert!(report.created.is_empty() && report.removed.is_empty());

        // Dropping beta removes only its link.
        desired.remove("beta");
        let report = sync_project_links(&project, &desired, &paths.skills_dir()).unwrap();
        assert_eq!(report.removed, vec!["beta".to_string()]);
        assert!(project.join(".agents/skills/alpha").exists());
        assert!(!project.join(".agents/skills/beta").exists());
    }

    #[test]
    fn never_touches_unmanaged_entries() {
        let (_tmp, paths, project) = setup_dirs();
        let links_dir = project.join(".agents/skills");
        std::fs::create_dir_all(&links_dir).unwrap();
        // A regular dir and a foreign symlink placed by the user.
        std::fs::create_dir_all(links_dir.join("user-dir")).unwrap();
        let foreign_target = project.join("elsewhere");
        std::fs::create_dir_all(&foreign_target).unwrap();
        platform_link::create_dir_link(&foreign_target, &links_dir.join("foreign")).unwrap();

        let desired = BTreeMap::new(); // nothing desired -> managed links would be removed
        let report = sync_project_links(&project, &desired, &paths.skills_dir()).unwrap();
        assert!(report.removed.is_empty());
        assert!(links_dir.join("user-dir").exists());
        assert!(links_dir.join("foreign").exists());
    }

    #[test]
    fn skips_links_for_missing_sources() {
        let (_tmp, paths, project) = setup_dirs();
        let mut desired = BTreeMap::new();
        desired.insert(
            "ghost".to_string(),
            paths.skills_dir().join("local/ghost"), // never created
        );
        let report = sync_project_links(&project, &desired, &paths.skills_dir()).unwrap();
        assert!(report.created.is_empty());
        assert_eq!(report.conflicts.len(), 1);
    }

    #[test]
    fn missing_project_path_is_reported_not_fatal() {
        let (_tmp, paths, _project) = setup_dirs();
        let desired = BTreeMap::new();
        let report =
            sync_project_links(Path::new("/nonexistent/nowhere"), &desired, &paths.skills_dir())
                .unwrap();
        assert!(report.project_path_missing);
    }

    #[test]
    fn rebuilds_link_pointing_to_stale_target() {
        let (_tmp, paths, project) = setup_dirs();
        let old = make_source(&paths, "net/a/x/tool");
        let new = make_source(&paths, "net/b/y/tool");
        let links_dir = project.join(".agents/skills");
        std::fs::create_dir_all(&links_dir).unwrap();
        platform_link::create_dir_link(&old, &links_dir.join("tool")).unwrap();

        let mut desired = BTreeMap::new();
        desired.insert("tool".to_string(), new.clone());
        let report = sync_project_links(&project, &desired, &paths.skills_dir()).unwrap();
        assert_eq!(report.removed, vec!["tool".to_string()]);
        assert_eq!(report.created, vec!["tool".to_string()]);
        assert_eq!(
            platform_link::read_link_target(&links_dir.join("tool")).unwrap(),
            platform_link::normalize(new)
        );
    }
}
