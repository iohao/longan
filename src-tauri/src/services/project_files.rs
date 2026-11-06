//! Materialize a project's skills without overwriting files owned or edited by its user.

use std::collections::{BTreeMap, BTreeSet};
use std::path::{Path, PathBuf};

use rusqlite::Connection;

use crate::db::{self, repo};
use crate::error::{AppError, AppResult};
use crate::models::{Project, SkillInstallMode, SyncReport};
use crate::paths::Paths;
use crate::services::{linker::DEFAULT_LINKS_DIR, platform_link, project_guidance};
use crate::validate;

const VCS_DIRS: &[&str] = &[".git", ".hg", ".svn"];

#[derive(Debug)]
enum EntryState {
    Missing,
    Link(PathBuf),
    Copy(String),
}

struct Change {
    relative: String,
    source: Option<PathBuf>,
    previous: EntryState,
    copy: Option<repo::ManagedSkillCopy>,
}

struct StagedChange {
    change: Change,
    temp: tempfile::TempDir,
    backed_up: bool,
    installed: bool,
}

/// Refuse linked ancestors: a project-relative destination must stay inside the project.
pub(super) fn check_directory(root: &Path, relative: &str) -> AppResult<()> {
    if relative != DEFAULT_LINKS_DIR
        && validate::normalize_agent_dir(relative).ok().as_deref() != Some(relative)
    {
        return Err(AppError::InvalidInput(format!(
            "{relative}: invalid skill directory"
        )));
    }
    let mut path = root.to_path_buf();
    for segment in relative.split('/') {
        path.push(segment);
        match std::fs::symlink_metadata(&path) {
            Ok(meta) if platform_link::is_dir_link(&path) || !meta.is_dir() => {
                return Err(AppError::InvalidInput(format!(
                    "{}: linked or non-directory ancestor",
                    path.display()
                )));
            }
            Ok(_) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => return Err(error.into()),
        }
    }
    Ok(())
}

fn hash(bytes: &[u8]) -> AppResult<String> {
    git2::Oid::hash_object(git2::ObjectType::Blob, bytes)
        .map(|oid| oid.to_string())
        .map_err(|error| AppError::Other(error.to_string()))
}

fn file_permissions(meta: &std::fs::Metadata) -> u32 {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        meta.permissions().mode() & 0o777
    }
    #[cfg(not(unix))]
    {
        u32::from(meta.permissions().readonly())
    }
}

/// A content baseline includes empty directories and permissions, but never follows links.
pub(super) fn fingerprint(root: &Path, skip_vcs: bool, depth: usize) -> AppResult<String> {
    if depth > 32 {
        return Err(AppError::InvalidInput(format!(
            "{}: skill tree is too deep",
            root.display()
        )));
    }
    let meta = std::fs::symlink_metadata(root)?;
    if platform_link::is_dir_link(root) || !meta.is_dir() {
        return Err(AppError::InvalidInput(format!(
            "{}: expected a real skill directory",
            root.display()
        )));
    }
    let mut entries = std::fs::read_dir(root)?.collect::<Result<Vec<_>, _>>()?;
    entries.sort_by_key(|entry| entry.file_name());
    let mut manifest = Vec::new();
    for entry in entries {
        let name = entry
            .file_name()
            .into_string()
            .map_err(|_| AppError::InvalidInput("skill filenames must be valid UTF-8".into()))?;
        if skip_vcs && VCS_DIRS.contains(&name.as_str()) {
            continue;
        }
        let path = entry.path();
        let meta = std::fs::symlink_metadata(&path)?;
        if meta.file_type().is_symlink() || platform_link::is_dir_link(&path) {
            return Err(AppError::InvalidInput(format!(
                "{}: copy mode does not support symbolic links or junctions",
                path.display()
            )));
        }
        let (kind, digest, permissions) = if meta.is_dir() {
            ("dir", fingerprint(&path, skip_vcs, depth + 1)?, 0)
        } else if meta.is_file() {
            (
                "file",
                hash(&std::fs::read(&path)?)?,
                file_permissions(&meta),
            )
        } else {
            return Err(AppError::InvalidInput(format!(
                "{}: unsupported file type",
                path.display()
            )));
        };
        manifest.push((name, kind, digest, permissions));
    }
    hash(&serde_json::to_vec(&manifest).map_err(|error| AppError::Other(error.to_string()))?)
}

fn label(relative: &str) -> &str {
    relative.strip_prefix(".agents/skills/").unwrap_or(relative)
}

#[derive(Default)]
pub struct SyncPlan {
    pub desired: BTreeMap<String, PathBuf>,
    pub dirs: BTreeMap<String, bool>,
    pub unavailable: Vec<PathBuf>,
    pub conflicts: Vec<String>,
    pub warnings: Vec<String>,
    pub changing_mode: bool,
}

/// Ordinary sync skips conflicts; a mode change preflights the entire project first.
pub fn sync(
    conn: &Connection,
    paths: &Paths,
    project: &Project,
    plan: SyncPlan,
) -> AppResult<SyncReport> {
    let SyncPlan {
        desired,
        mut dirs,
        unavailable,
        conflicts,
        warnings,
        changing_mode,
    } = plan;
    let root = Path::new(&project.path);
    let mut report = SyncReport {
        conflicts,
        ..SyncReport::default()
    };
    if !root.is_dir() {
        report.project_path_missing = true;
        if changing_mode {
            return Err(AppError::InvalidInput(
                "project directory does not exist".into(),
            ));
        }
        repo::save_project_sync_report(conn, project.id, &report)?;
        return Ok(report);
    }

    let copies: BTreeMap<_, _> = repo::managed_skill_copies(conn, project.id)?
        .into_iter()
        .map(|copy| (copy.relative_path.clone(), copy))
        .collect();
    for relative in copies.keys() {
        if let Some((dir, _)) = relative.rsplit_once('/') {
            dirs.entry(dir.to_owned()).or_insert(false);
        }
    }
    let skills_root = platform_link::normalize(paths.skills_dir());
    let mut changes = Vec::new();
    let mut source_fingerprints: BTreeMap<PathBuf, String> = BTreeMap::new();
    for (dir, active) in &dirs {
        if let Err(error) = check_directory(root, dir) {
            report.conflicts.push(error.to_string());
            continue;
        }
        let destination_dir = root.join(dir);
        let mut names = BTreeSet::new();
        if *active {
            names.extend(desired.keys().cloned());
        }
        if destination_dir.is_dir() {
            for entry in std::fs::read_dir(&destination_dir)? {
                names.insert(entry?.file_name().to_string_lossy().into_owned());
            }
        }
        for relative in copies.keys() {
            if let Some((parent, name)) = relative.rsplit_once('/') {
                if parent == dir {
                    names.insert(name.to_owned());
                }
            }
        }
        for name in names {
            let relative = format!("{dir}/{name}");
            let source = if *active { desired.get(&name) } else { None };
            let copy = copies.get(&relative);
            if validate::sanitize_link_name(&name).as_deref() != Some(name.as_str()) {
                if copy.is_some() || source.is_some() {
                    report
                        .conflicts
                        .push(format!("{relative}: invalid skill name"));
                }
                continue;
            }
            let destination = root.join(&relative);
            let previous = match std::fs::symlink_metadata(&destination) {
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => EntryState::Missing,
                Err(error) => return Err(error.into()),
                Ok(_) if copy.is_some() => match fingerprint(&destination, false, 0) {
                    Ok(value) if copy.is_some_and(|copy| copy.fingerprint == value) => {
                        EntryState::Copy(value)
                    }
                    _ => {
                        report.conflicts.push(format!("{relative}: project copy was modified; back it up and move it aside, or restore its original contents before syncing"));
                        continue;
                    }
                },
                Ok(_) => match platform_link::read_link_target(&destination) {
                    Some(target)
                        if platform_link::is_dir_link(&destination)
                            && target.starts_with(&skills_root) =>
                    {
                        EntryState::Link(target)
                    }
                    _ => {
                        if source.is_some() {
                            report
                                .conflicts
                                .push(format!("{relative}: destination is not managed by Longan"));
                        }
                        continue;
                    }
                },
            };
            if source.is_none() && *active {
                let old_source = copy
                    .map(|copy| PathBuf::from(&copy.source_path))
                    .or_else(|| {
                        if let EntryState::Link(target) = &previous {
                            Some(target.clone())
                        } else {
                            None
                        }
                    });
                if old_source
                    .as_ref()
                    .is_some_and(|old| unavailable.iter().any(|missing| old.starts_with(missing)))
                {
                    report.conflicts.push(format!(
                        "{relative}: source missing; existing installation preserved"
                    ));
                    continue;
                }
            }
            let new_copy = if let Some(source) = source {
                if !source.is_dir() || validate::ensure_contained(&skills_root, source).is_err() {
                    report.conflicts.push(format!(
                        "{relative}: source missing or outside the skill library"
                    ));
                    continue;
                }
                if project.skill_install_mode == SkillInstallMode::Copy {
                    let value = if let Some(value) = source_fingerprints.get(source) {
                        value.clone()
                    } else {
                        match fingerprint(source, true, 0) {
                            Ok(value) => {
                                source_fingerprints.insert(source.clone(), value.clone());
                                value
                            }
                            Err(error) => {
                                report.conflicts.push(format!("{relative}: {error}"));
                                continue;
                            }
                        }
                    };
                    if matches!(&previous, EntryState::Copy(old) if *old == value)
                        && copy.is_some_and(|copy| Path::new(&copy.source_path) == source)
                    {
                        continue;
                    }
                    Some(repo::ManagedSkillCopy {
                        relative_path: relative.clone(),
                        source_path: source.to_string_lossy().into_owned(),
                        fingerprint: value,
                    })
                } else {
                    if matches!(&previous, EntryState::Link(old) if old == source) {
                        continue;
                    }
                    None
                }
            } else {
                if matches!(previous, EntryState::Missing) && copy.is_none() {
                    continue;
                }
                None
            };
            changes.push(Change {
                relative,
                source: source.cloned(),
                previous,
                copy: new_copy,
            });
        }
    }
    if changing_mode && !report.conflicts.is_empty() {
        return Err(AppError::InvalidInput(format!(
            "mode change blocked:\n{}",
            report.conflicts.join("\n")
        )));
    }
    report.conflicts.extend(warnings);

    let mut guidance = if changing_mode && project.skill_install_mode == SkillInstallMode::Symlink {
        Some(project_guidance::prepare_cleanup(project).map_err(|error| {
            AppError::InvalidInput(format!("mode change blocked: AI guidance cleanup: {error}"))
        })?)
    } else {
        None
    };

    // Staging stays on the destination filesystem so replacement and rollback use rename.
    let mut staged = Vec::new();
    let mut forgotten = Vec::new();
    let mut created_dirs = Vec::new();
    let outcome = (|| -> AppResult<()> {
        for (dir, active) in &dirs {
            if *active && check_directory(root, dir).is_ok() {
                create_directories(root, dir, &mut created_dirs)?;
            }
        }
        for change in changes {
            if change.source.is_none() && matches!(change.previous, EntryState::Missing) {
                forgotten.push(change.relative);
                continue;
            }
            let destination = root.join(&change.relative);
            let parent = destination
                .parent()
                .ok_or_else(|| AppError::InvalidInput("missing destination parent".into()))?;
            if !parent.is_dir() {
                return Err(AppError::InvalidInput(format!(
                    "{}: destination parent missing",
                    parent.display()
                )));
            }
            let temp = tempfile::Builder::new()
                .prefix(".longan-sync-")
                .tempdir_in(parent)?;
            if let Some(source) = &change.source {
                if project.skill_install_mode == SkillInstallMode::Copy {
                    validate::copy_dir_safe(source, &temp.path().join("new"), VCS_DIRS, 0)?;
                    if change.copy.as_ref().map(|copy| copy.fingerprint.as_str())
                        != Some(fingerprint(&temp.path().join("new"), false, 0)?.as_str())
                    {
                        return Err(AppError::Other(format!(
                            "{}: source changed while copying",
                            change.relative
                        )));
                    }
                } else {
                    platform_link::create_dir_link(source, &temp.path().join("new"))?;
                }
            }
            staged.push(StagedChange {
                change,
                temp,
                backed_up: false,
                installed: false,
            });
        }
        // Recheck every destination before touching any of them.
        for item in &staged {
            check_directory(
                root,
                item.change
                    .relative
                    .rsplit_once('/')
                    .map(|(dir, _)| dir)
                    .unwrap_or(""),
            )?;
            let destination = root.join(&item.change.relative);
            let unchanged = match &item.change.previous {
                EntryState::Missing => {
                    matches!(std::fs::symlink_metadata(&destination), Err(error) if error.kind() == std::io::ErrorKind::NotFound)
                }
                EntryState::Link(target) => {
                    platform_link::read_link_target(&destination).as_ref() == Some(target)
                }
                EntryState::Copy(value) => {
                    fingerprint(&destination, false, 0).ok().as_ref() == Some(value)
                }
            };
            if !unchanged {
                return Err(AppError::Other(format!(
                    "{}: destination changed during sync",
                    item.change.relative
                )));
            }
        }
        db::with_tx(conn, |conn| {
            if let Some(guidance) = &mut guidance {
                guidance
                    .apply()
                    .map_err(|error| AppError::Other(format!("AI guidance cleanup: {error}")))?;
            }
            for item in &mut staged {
                let destination = root.join(&item.change.relative);
                if !matches!(item.change.previous, EntryState::Missing) {
                    std::fs::rename(&destination, item.temp.path().join("old"))?;
                    item.backed_up = true;
                }
                if item.change.source.is_some() {
                    std::fs::rename(item.temp.path().join("new"), &destination)?;
                    item.installed = true;
                }
                if let Some(copy) = &item.change.copy {
                    repo::save_managed_skill_copy(conn, project.id, copy)?;
                } else {
                    repo::remove_managed_skill_copy(conn, project.id, &item.change.relative)?;
                }
                let name = label(&item.change.relative).to_owned();
                if item.change.source.is_some() {
                    if matches!(item.change.previous, EntryState::Missing) {
                        report.created.push(name);
                    } else {
                        report.updated.push(name);
                    }
                } else if !matches!(item.change.previous, EntryState::Missing) {
                    report.removed.push(name);
                }
            }
            for relative in &forgotten {
                repo::remove_managed_skill_copy(conn, project.id, relative)?;
            }
            if changing_mode {
                repo::set_project_skill_install_mode(conn, project.id, project.skill_install_mode)?;
                if project.skill_install_mode == SkillInstallMode::Copy {
                    // Render from the converted files and records, keeping backups until commit.
                    let (transaction, warnings) =
                        project_guidance::prepare_generation(conn, paths, project)
                            .map_err(|error| AppError::Other(format!("AI guidance: {error}")))?;
                    guidance
                        .insert(transaction)
                        .apply()
                        .map_err(|error| AppError::Other(format!("AI guidance: {error}")))?;
                    report.conflicts.extend(
                        warnings
                            .into_iter()
                            .map(|warning| format!("AI guidance: {warning}")),
                    );
                }
            }
            repo::save_project_sync_report(conn, project.id, &report)
        })
    })();
    if let Err(error) = outcome {
        let mut recovery_errors = Vec::new();
        for item in staged.iter_mut().rev() {
            let destination = root.join(&item.change.relative);
            let restored = (|| -> AppResult<()> {
                if item.installed {
                    if platform_link::is_dir_link(&destination) {
                        platform_link::remove_link(&destination)?;
                    } else {
                        std::fs::remove_dir_all(&destination)?;
                    }
                }
                if item.backed_up {
                    std::fs::rename(item.temp.path().join("old"), &destination)?;
                }
                Ok(())
            })();
            if let Err(recovery) = restored {
                recovery_errors.push(format!(
                    "{}: {recovery}; backup: {}",
                    item.change.relative,
                    item.temp.path().display()
                ));
            }
        }
        if let Some(guidance) = &mut guidance {
            recovery_errors.extend(guidance.rollback());
        }
        if !recovery_errors.is_empty() {
            // Never let TempDir delete the only surviving original after failed recovery.
            for item in staged {
                let _ = item.temp.keep();
            }
            return Err(AppError::Other(format!(
                "{error}; recovery failed: {}",
                recovery_errors.join("; ")
            )));
        }
        drop(staged);
        for dir in created_dirs.iter().rev() {
            let _ = std::fs::remove_dir(dir);
        }
        return Err(error);
    }
    drop(staged);
    for (dir, active) in dirs {
        if !active {
            let _ = std::fs::remove_dir(root.join(dir));
        }
    }
    Ok(report)
}

fn create_directories(root: &Path, relative: &str, created: &mut Vec<PathBuf>) -> AppResult<()> {
    check_directory(root, relative)?;
    let mut path = root.to_path_buf();
    for segment in relative.split('/') {
        path.push(segment);
        if !path.exists() {
            std::fs::create_dir(&path)?;
            created.push(path.clone());
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::services::{linker, scanner};

    struct Fixture {
        _temp: tempfile::TempDir,
        paths: Paths,
        conn: Connection,
        project_id: i64,
        source: PathBuf,
        destination: PathBuf,
    }

    fn setup() -> Fixture {
        let temp = tempfile::tempdir().unwrap();
        let paths = Paths::with_root(temp.path().join("console"));
        paths.ensure_layout().unwrap();
        let root = temp.path().join("project");
        std::fs::create_dir_all(&root).unwrap();
        let source = paths.local_dir().join("demo");
        std::fs::create_dir_all(source.join("scripts")).unwrap();
        std::fs::write(source.join("SKILL.md"), "---\nname: demo\n---\nOriginal").unwrap();
        std::fs::write(source.join("scripts/run.sh"), "echo original").unwrap();
        let conn = db::Db::open_in_memory().unwrap().conn.into_inner().unwrap();
        scanner::rescan(&conn, &paths).unwrap();
        let skill = repo::list_skills(&conn).unwrap().pop().unwrap();
        let project_id = repo::create_project(&conn, "project", root.to_str().unwrap()).unwrap();
        repo::set_project_skill(&conn, project_id, skill.id, true).unwrap();
        let destination = root.join(DEFAULT_LINKS_DIR).join("demo");
        Fixture {
            _temp: temp,
            paths,
            conn,
            project_id,
            source,
            destination,
        }
    }

    #[test]
    fn converts_both_ways_and_copies_real_files_with_permissions() {
        let f = setup();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(
                f.source.join("scripts/run.sh"),
                std::fs::Permissions::from_mode(0o755),
            )
            .unwrap();
        }
        linker::sync_project(&f.conn, &f.paths, f.project_id).unwrap();
        assert!(platform_link::is_dir_link(&f.destination));
        let result =
            linker::set_project_mode(&f.conn, &f.paths, f.project_id, SkillInstallMode::Copy)
                .unwrap();
        assert_eq!(result.updated, ["demo"]);
        assert!(!platform_link::is_dir_link(&f.destination));
        assert_eq!(
            fingerprint(&f.source, true, 0).unwrap(),
            fingerprint(&f.destination, false, 0).unwrap()
        );
        std::fs::write(f.destination.join("scripts/run.sh"), "echo local").unwrap();
        assert_eq!(
            std::fs::read_to_string(f.source.join("scripts/run.sh")).unwrap(),
            "echo original"
        );
        std::fs::copy(
            f.source.join("scripts/run.sh"),
            f.destination.join("scripts/run.sh"),
        )
        .unwrap();
        linker::set_project_mode(&f.conn, &f.paths, f.project_id, SkillInstallMode::Symlink)
            .unwrap();
        assert!(platform_link::is_dir_link(&f.destination));
        assert!(repo::managed_skill_copies(&f.conn, f.project_id)
            .unwrap()
            .is_empty());
    }

    #[test]
    fn copy_sync_updates_source_changes_and_is_idempotent() {
        let f = setup();
        linker::set_project_mode(&f.conn, &f.paths, f.project_id, SkillInstallMode::Copy).unwrap();
        std::fs::write(f.source.join("SKILL.md"), "Updated").unwrap();
        std::fs::remove_file(f.source.join("scripts/run.sh")).unwrap();
        std::fs::write(f.source.join("scripts/new.sh"), "new").unwrap();
        let result = linker::sync_project(&f.conn, &f.paths, f.project_id).unwrap();
        assert_eq!(result.updated, ["demo"]);
        assert_eq!(
            std::fs::read_to_string(f.destination.join("SKILL.md")).unwrap(),
            "Updated"
        );
        assert!(!f.destination.join("scripts/run.sh").exists());
        let modified = std::fs::metadata(f.destination.join("SKILL.md"))
            .unwrap()
            .modified()
            .unwrap();
        let again = linker::sync_project(&f.conn, &f.paths, f.project_id).unwrap();
        assert!(again.updated.is_empty());
        assert_eq!(
            std::fs::metadata(f.destination.join("SKILL.md"))
                .unwrap()
                .modified()
                .unwrap(),
            modified
        );
    }

    #[test]
    fn protects_modified_added_and_deleted_files_during_sync_and_cleanup() {
        for modification in ["edit", "add", "delete", "symlink"] {
            let f = setup();
            linker::set_project_mode(&f.conn, &f.paths, f.project_id, SkillInstallMode::Copy)
                .unwrap();
            match modification {
                "edit" => std::fs::write(f.destination.join("SKILL.md"), "local").unwrap(),
                "add" => std::fs::write(f.destination.join("notes.txt"), "local").unwrap(),
                "delete" => std::fs::remove_file(f.destination.join("scripts/run.sh")).unwrap(),
                _ => platform_link::create_dir_link(&f.source, &f.destination.join("external"))
                    .unwrap(),
            }
            std::fs::write(f.source.join("SKILL.md"), "upstream").unwrap();
            let result = linker::sync_project(&f.conn, &f.paths, f.project_id).unwrap();
            assert_eq!(result.conflicts.len(), 1, "{modification}");
            assert!(result.updated.is_empty());
            let cleanup = linker::cleanup_project(&f.conn, &f.paths, f.project_id).unwrap();
            assert_eq!(cleanup.conflicts.len(), 1, "{modification}");
            assert!(f.destination.is_dir());
        }
    }

    #[test]
    fn blocks_the_whole_mode_change_when_any_copy_is_edited() {
        let f = setup();
        let agent = repo::create_agent(&f.conn, "agent", ".claude/skills", true).unwrap();
        linker::set_project_mode(&f.conn, &f.paths, f.project_id, SkillInstallMode::Copy).unwrap();
        let project = repo::get_project(&f.conn, f.project_id).unwrap();
        let other = Path::new(&project.path).join(".claude/skills/demo");
        std::fs::write(other.join("SKILL.md"), "local").unwrap();
        let error =
            linker::set_project_mode(&f.conn, &f.paths, f.project_id, SkillInstallMode::Symlink)
                .unwrap_err();
        assert!(error.to_string().contains(".claude/skills/demo"));
        assert_eq!(
            repo::get_project(&f.conn, f.project_id)
                .unwrap()
                .skill_install_mode,
            SkillInstallMode::Copy
        );
        assert!(!platform_link::is_dir_link(&f.destination));
        assert_eq!(
            std::fs::read_to_string(other.join("SKILL.md")).unwrap(),
            "local"
        );
        assert!(agent > 0);
    }

    #[test]
    fn database_failure_restores_all_links_and_original_mode() {
        let f = setup();
        repo::create_agent(&f.conn, "agent", ".claude/skills", true).unwrap();
        linker::sync_project(&f.conn, &f.paths, f.project_id).unwrap();
        f.conn.execute_batch("CREATE TRIGGER fail_mode BEFORE UPDATE OF skill_install_mode ON projects BEGIN SELECT RAISE(FAIL, 'simulated database failure'); END;").unwrap();
        assert!(
            linker::set_project_mode(&f.conn, &f.paths, f.project_id, SkillInstallMode::Copy)
                .is_err()
        );
        assert!(platform_link::is_dir_link(&f.destination));
        let project = repo::get_project(&f.conn, f.project_id).unwrap();
        assert!(platform_link::is_dir_link(
            &Path::new(&project.path).join(".claude/skills/demo")
        ));
        assert_eq!(project.skill_install_mode, SkillInstallMode::Symlink);
        assert!(repo::managed_skill_copies(&f.conn, f.project_id)
            .unwrap()
            .is_empty());
    }

    #[test]
    fn never_claims_an_unmanaged_directory_or_follows_a_linked_ancestor() {
        let f = setup();
        std::fs::create_dir_all(&f.destination).unwrap();
        std::fs::write(f.destination.join("SKILL.md"), "user owned").unwrap();
        assert!(
            linker::set_project_mode(&f.conn, &f.paths, f.project_id, SkillInstallMode::Copy)
                .is_err()
        );
        assert_eq!(
            std::fs::read_to_string(f.destination.join("SKILL.md")).unwrap(),
            "user owned"
        );
        let project = repo::get_project(&f.conn, f.project_id).unwrap();
        std::fs::remove_dir_all(Path::new(&project.path).join(".agents")).unwrap();
        platform_link::create_dir_link(&f.paths.root, &Path::new(&project.path).join(".agents"))
            .unwrap();
        let result = linker::sync_project(&f.conn, &f.paths, f.project_id).unwrap();
        assert_eq!(result.conflicts.len(), 1);
        assert!(!f.paths.root.join("skills/demo").exists());
    }

    #[test]
    fn preserves_copies_when_source_disappears_and_cleans_up_after_unlinking() {
        let f = setup();
        linker::set_project_mode(&f.conn, &f.paths, f.project_id, SkillInstallMode::Copy).unwrap();
        std::fs::remove_dir_all(&f.source).unwrap();
        let result = linker::sync_project(&f.conn, &f.paths, f.project_id).unwrap();
        assert!(!result.conflicts.is_empty());
        assert!(f.destination.join("SKILL.md").is_file());
        let project = repo::get_project(&f.conn, f.project_id).unwrap();
        repo::set_project_skill(&f.conn, f.project_id, project.skill_ids[0], false).unwrap();
        linker::sync_project(&f.conn, &f.paths, f.project_id).unwrap();
        assert!(!f.destination.exists());
    }

    #[test]
    fn rejects_nested_source_links_before_converting_any_installations() {
        let f = setup();
        linker::sync_project(&f.conn, &f.paths, f.project_id).unwrap();
        platform_link::create_dir_link(&f.paths.root, &f.source.join("external")).unwrap();
        assert!(
            linker::set_project_mode(&f.conn, &f.paths, f.project_id, SkillInstallMode::Copy)
                .is_err()
        );
        assert!(platform_link::is_dir_link(&f.destination));
    }

    #[test]
    fn local_rescan_keeps_missing_sources_referenced_by_copy_projects() {
        let f = setup();
        linker::set_project_mode(&f.conn, &f.paths, f.project_id, SkillInstallMode::Copy).unwrap();
        std::fs::remove_dir_all(&f.source).unwrap();
        scanner::rescan(&f.conn, &f.paths).unwrap();
        assert!(f.destination.join("SKILL.md").is_file());
        let project = repo::get_project(&f.conn, f.project_id).unwrap();
        assert_eq!(project.skill_ids.len(), 1);
        assert_eq!(
            repo::get_skill(&f.conn, project.skill_ids[0])
                .unwrap()
                .status,
            "missing"
        );
        assert!(!repo::get_project_sync_report(&f.conn, f.project_id)
            .unwrap()
            .unwrap()
            .conflicts
            .is_empty());
        std::fs::create_dir_all(&f.source).unwrap();
        std::fs::write(f.source.join("SKILL.md"), "---\nname: demo\n---\nRestored").unwrap();
        scanner::rescan(&f.conn, &f.paths).unwrap();
        assert!(std::fs::read_to_string(f.destination.join("SKILL.md"))
            .unwrap()
            .contains("Restored"));
        assert!(repo::get_project_sync_report(&f.conn, f.project_id)
            .unwrap()
            .unwrap()
            .conflicts
            .is_empty());
    }

    #[test]
    fn cleanup_forgets_absent_copies_without_recreating_their_directories() {
        let f = setup();
        linker::set_project_mode(&f.conn, &f.paths, f.project_id, SkillInstallMode::Copy).unwrap();
        let project = repo::get_project(&f.conn, f.project_id).unwrap();
        let directory = Path::new(&project.path).join(".agents");
        std::fs::remove_dir_all(&directory).unwrap();
        linker::cleanup_project(&f.conn, &f.paths, f.project_id).unwrap();
        assert!(repo::managed_skill_copies(&f.conn, f.project_id)
            .unwrap()
            .is_empty());
        assert!(!directory.exists());
    }

    #[test]
    fn mode_is_project_scoped_and_presets_expand_collections_in_copy_mode() {
        let f = setup();
        let child = f.paths.local_dir().join("collection/child");
        std::fs::create_dir_all(&child).unwrap();
        std::fs::write(child.join("SKILL.md"), "---\nname: child\n---\n").unwrap();
        scanner::rescan(&f.conn, &f.paths).unwrap();
        let collection = repo::list_skills(&f.conn)
            .unwrap()
            .into_iter()
            .find(|skill| skill.name == "collection")
            .unwrap();
        let preset = repo::create_preset(&f.conn, "preset", None).unwrap();
        repo::set_preset_skills(&f.conn, preset, &[collection.id]).unwrap();
        repo::set_project_preset(&f.conn, f.project_id, preset, true).unwrap();
        let other_root = f._temp.path().join("other");
        std::fs::create_dir(&other_root).unwrap();
        let other = repo::create_project(&f.conn, "other", other_root.to_str().unwrap()).unwrap();
        repo::set_project_preset(&f.conn, other, preset, true).unwrap();
        linker::set_project_mode(&f.conn, &f.paths, f.project_id, SkillInstallMode::Copy).unwrap();
        linker::sync_project(&f.conn, &f.paths, other).unwrap();
        let project = repo::get_project(&f.conn, f.project_id).unwrap();
        let copied = Path::new(&project.path).join(".agents/skills/child");
        assert!(copied.join("SKILL.md").is_file());
        assert!(!platform_link::is_dir_link(&copied));
        assert!(platform_link::is_dir_link(
            &other_root.join(".agents/skills/child")
        ));
        assert_eq!(
            repo::get_project(&f.conn, other)
                .unwrap()
                .skill_install_mode,
            SkillInstallMode::Symlink
        );
    }

    #[test]
    fn resolved_name_conflicts_do_not_block_safe_mode_conversion() {
        let f = setup();
        let other_source = f.paths.local_dir().join("other");
        std::fs::create_dir_all(&other_source).unwrap();
        std::fs::write(other_source.join("SKILL.md"), "---\nname: demo\n---\nLoser").unwrap();
        scanner::rescan(&f.conn, &f.paths).unwrap();
        let other_skill = repo::list_skills(&f.conn)
            .unwrap()
            .into_iter()
            .find(|skill| skill.dir_path == "local/other")
            .unwrap();
        let preset = repo::create_preset(&f.conn, "preset", None).unwrap();
        repo::set_preset_skills(&f.conn, preset, &[other_skill.id]).unwrap();
        repo::set_project_preset(&f.conn, f.project_id, preset, true).unwrap();
        let report =
            linker::set_project_mode(&f.conn, &f.paths, f.project_id, SkillInstallMode::Copy)
                .unwrap();
        assert!(!report.conflicts.is_empty());
        assert_eq!(
            std::fs::read_to_string(f.destination.join("SKILL.md")).unwrap(),
            "---\nname: demo\n---\nOriginal"
        );
    }

    #[test]
    fn missing_project_blocks_conversion_without_saving_the_requested_mode() {
        let f = setup();
        let project = repo::get_project(&f.conn, f.project_id).unwrap();
        std::fs::remove_dir_all(&project.path).unwrap();
        assert!(
            linker::set_project_mode(&f.conn, &f.paths, f.project_id, SkillInstallMode::Copy)
                .is_err()
        );
        assert_eq!(
            repo::get_project(&f.conn, f.project_id)
                .unwrap()
                .skill_install_mode,
            SkillInstallMode::Symlink
        );
        assert!(!Path::new(&project.path).exists());
    }

    #[test]
    fn keeps_modified_old_agent_copies_discoverable_after_directory_changes() {
        let f = setup();
        let agent = repo::create_agent(&f.conn, "agent", ".old/skills", true).unwrap();
        linker::set_project_mode(&f.conn, &f.paths, f.project_id, SkillInstallMode::Copy).unwrap();
        let project = repo::get_project(&f.conn, f.project_id).unwrap();
        let old = Path::new(&project.path).join(".old/skills/demo");
        std::fs::write(old.join("SKILL.md"), "local edit").unwrap();
        repo::update_agent(&f.conn, agent, "agent", ".new/skills", true).unwrap();
        let result = linker::sync_project(&f.conn, &f.paths, f.project_id).unwrap();
        assert!(result
            .conflicts
            .iter()
            .any(|conflict| conflict.contains(".old/skills/demo")));
        assert!(Path::new(&project.path)
            .join(".new/skills/demo/SKILL.md")
            .is_file());
        assert!(repo::get_project_sync_report(&f.conn, f.project_id)
            .unwrap()
            .unwrap()
            .conflicts
            .iter()
            .any(|conflict| conflict.contains(".old/skills/demo")));
    }
}
