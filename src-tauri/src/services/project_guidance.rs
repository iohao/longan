//! Generate project instructions without taking ownership of user-authored files.

use std::collections::{BTreeMap, BTreeSet};
use std::ops::Range;
use std::path::{Path, PathBuf};

use rusqlite::Connection;

use crate::db::repo;
use crate::error::{AppError, AppResult};
use crate::models::{Project, ProjectGuidanceResult, SkillInstallMode};
use crate::paths::Paths;
use crate::services::{linker, platform_link, project_files};
use crate::validate;

const AGENTS: &str = "AGENTS.md";
const GUIDE: &str = ".agents/longan.md";
const START: &str = "<!-- longan:start -->";
const END: &str = "<!-- longan:end -->";
const GUIDE_START: &str = "<!-- longan:generated:start -->";
const GUIDE_END: &str = "<!-- longan:generated:end -->";
const ROOT_BLOCK: &str = "<!-- longan:start -->\nSome skills in this project are managed by Longan.\nBefore adding or modifying skills, read `.agents/longan.md` for managed\nskill locations, source paths, and the required registration and sync steps.\n<!-- longan:end -->";

fn invalid(message: impl Into<String>) -> AppError {
    AppError::InvalidInput(message.into())
}

fn read_file(root: &Path, relative: &str) -> AppResult<Option<String>> {
    validate::ensure_safe_relative(relative)?;
    let mut path = root.to_path_buf();
    let segments: Vec<_> = relative.split('/').collect();
    for (index, segment) in segments.iter().enumerate() {
        path.push(segment);
        match std::fs::symlink_metadata(&path) {
            Ok(meta) => {
                if platform_link::is_dir_link(&path)
                    || (index + 1 < segments.len() && !meta.is_dir())
                    || (index + 1 == segments.len() && !meta.is_file())
                {
                    return Err(invalid(format!(
                        "{}: expected a regular file or directory, not a link or another file type",
                        path.display()
                    )));
                }
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
            Err(error) => return Err(error.into()),
        }
    }
    Ok(Some(std::fs::read_to_string(path)?))
}

fn block_range(content: &str) -> AppResult<Option<Range<usize>>> {
    let starts: Vec<_> = content.match_indices(START).map(|(i, _)| i).collect();
    let ends: Vec<_> = content.match_indices(END).map(|(i, _)| i).collect();
    match (starts.as_slice(), ends.as_slice()) {
        ([], []) => Ok(None),
        ([start], [end]) if start < end => {
            for (position, marker) in [(*start, START), (*end, END)] {
                let line_start = content[..position].rfind('\n').map_or(0, |i| i + 1);
                let after = &content[position + marker.len()..];
                if !content[line_start..position].trim().is_empty()
                    || !after.lines().next().unwrap_or("").trim().is_empty()
                {
                    return Err(invalid("AGENTS.md: Longan markers must be on separate lines"));
                }
            }
            Ok(Some(*start..*end + END.len()))
        }
        _ => Err(invalid("AGENTS.md: duplicate or damaged Longan markers; repair them before generating guidance")),
    }
}

fn validate_guide(content: &str) -> AppResult<()> {
    if !content.starts_with(&format!("{GUIDE_START}\n"))
        || !content.trim_end().ends_with(GUIDE_END)
        || content.matches(GUIDE_START).count() != 1
        || content.matches(GUIDE_END).count() != 1
    {
        return Err(invalid(".agents/longan.md: existing file is not recognized as Longan-generated; move it aside or repair its markers"));
    }
    Ok(())
}

fn checked_files(root: &Path) -> AppResult<(Option<String>, Option<String>)> {
    if !root.is_dir() {
        return Err(invalid("project directory does not exist"));
    }
    let agents = read_file(root, AGENTS)?;
    let guide = read_file(root, GUIDE)?;
    block_range(agents.as_deref().unwrap_or(""))?;
    if let Some(content) = &guide {
        validate_guide(content)?;
    }
    Ok((agents, guide))
}

/// A generated file is disposable; the root file is managed only inside its markers.
pub fn generate(
    conn: &Connection,
    paths: &Paths,
    project_id: i64,
) -> AppResult<ProjectGuidanceResult> {
    let project = repo::get_project(conn, project_id)?;
    let (transaction, warnings) = prepare_generation(conn, paths, &project)?;
    Ok(ProjectGuidanceResult {
        updated: transaction.commit()?,
        warnings,
    })
}

pub(super) fn prepare_generation(
    conn: &Connection,
    paths: &Paths,
    project: &Project,
) -> AppResult<(FileTransaction, Vec<String>)> {
    if project.skill_install_mode != SkillInstallMode::Copy {
        return Err(invalid("AI guidance is only available in copy mode"));
    }
    let root = Path::new(&project.path);
    let (agents, guide) = checked_files(root)?;
    let original = agents.as_deref().unwrap_or("");
    let newline = if original.contains("\r\n") {
        "\r\n"
    } else {
        "\n"
    };
    let block = ROOT_BLOCK.replace('\n', newline);
    let mut updated_agents = original.to_owned();
    if let Some(range) = block_range(original)? {
        updated_agents.replace_range(range, &block);
    } else {
        if !original.is_empty() {
            if !original.ends_with('\n') {
                updated_agents.push_str(newline);
            }
            updated_agents.push_str(newline);
        }
        updated_agents.push_str(&block);
        updated_agents.push_str(newline);
    }
    let mut warnings = Vec::new();
    if root.join("AGENTS.override.md").exists() {
        warnings.push("AGENTS.override.md may override AGENTS.md. Add the Longan instruction to the active override if needed, then start a new AI session.".into());
    }
    let transaction = FileTransaction::prepare(
        root,
        vec![
            FileChange::new(AGENTS, agents, Some(updated_agents)),
            FileChange::new(GUIDE, guide, Some(render(conn, paths, project)?)),
        ],
    )?;
    Ok((transaction, warnings))
}

/// Copy-mode syncs create missing instructions and keep managed guidance up to date.
pub fn refresh(conn: &Connection, paths: &Paths, project_id: i64) -> AppResult<Vec<String>> {
    let project = repo::get_project(conn, project_id)?;
    if project.skill_install_mode == SkillInstallMode::Symlink {
        cleanup(&project)?;
        return Ok(vec![]);
    }
    Ok(generate(conn, paths, project_id)?.warnings)
}

pub fn cleanup(project: &Project) -> AppResult<()> {
    let mut transaction = prepare_cleanup(project)?;
    if let Err(error) = transaction.apply() {
        return Err(transaction.recover(error));
    }
    Ok(())
}

pub(super) fn prepare_cleanup(project: &Project) -> AppResult<FileTransaction> {
    let root = Path::new(&project.path);
    if !has_managed_markers(root)? {
        return FileTransaction::prepare(root, vec![]);
    }
    let (agents, guide) = checked_files(root)?;
    let mut changes = Vec::new();
    if let Some(mut content) = agents.clone() {
        if let Some(range) = block_range(&content)? {
            content.replace_range(range, "");
            changes.push(FileChange::new(AGENTS, agents, Some(content)));
        }
    }
    if guide.is_some() {
        changes.push(FileChange::new(GUIDE, guide, None));
    }
    FileTransaction::prepare(root, changes)
}

fn has_managed_markers(root: &Path) -> AppResult<bool> {
    // Cleanup must leave unrelated user files untouched, including linked instructions.
    let agents = read_file(root, AGENTS);
    let guide = read_file(root, GUIDE);
    let claimed = agents
        .as_ref()
        .ok()
        .and_then(|s| s.as_deref())
        .is_some_and(|s| s.contains(START) || s.contains(END))
        || guide
            .as_ref()
            .ok()
            .and_then(|s| s.as_deref())
            .is_some_and(|s| s.contains(GUIDE_START) || s.contains(GUIDE_END));
    if claimed {
        agents?;
        guide?;
    }
    Ok(claimed)
}

fn code(value: &str) -> String {
    if !value.contains(['&', '<', '>', '|', '`', '\r', '\n']) {
        return format!("`{value}`");
    }
    // HTML code preserves special path characters when rendered inside Markdown tables.
    let escaped = value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('|', "&#124;")
        .replace('`', "&#96;")
        .replace('\r', "\\r")
        .replace('\n', "\\n");
    format!("<code>{escaped}</code>")
}

fn render(conn: &Connection, paths: &Paths, project: &Project) -> AppResult<String> {
    let plan = linker::project_plan(conn, paths, project.id)?;
    let root = Path::new(&project.path);
    let library = platform_link::normalize(paths.skills_dir());
    let copies: BTreeMap<_, _> = repo::managed_skill_copies(conn, project.id)?
        .into_iter()
        .map(|copy| (copy.relative_path.clone(), copy))
        .collect();
    let mut dirs = plan.dirs;
    for relative in copies.keys() {
        if let Some((dir, _)) = relative.rsplit_once('/') {
            dirs.entry(dir.to_owned()).or_insert(false);
        }
    }
    let mut rows = BTreeMap::new();
    let mut issues = BTreeSet::new();
    issues.extend(plan.conflicts);
    issues.extend(plan.warnings);
    for (dir, active) in dirs {
        if let Err(error) = project_files::check_directory(root, &dir) {
            issues.insert(error.to_string());
            continue;
        }
        let mut names = BTreeSet::new();
        if active {
            names.extend(plan.desired.keys().cloned());
        }
        if root.join(&dir).is_dir() {
            for entry in std::fs::read_dir(root.join(&dir))? {
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
            if validate::sanitize_link_name(&name).as_deref() != Some(name.as_str()) {
                continue;
            }
            let relative = format!("{dir}/{name}");
            let destination = root.join(&relative);
            let mut installed = None;
            if let Some(copy) = copies.get(&relative) {
                let source = PathBuf::from(&copy.source_path);
                if !source.starts_with(&library)
                    || source
                        .components()
                        .any(|c| c == std::path::Component::ParentDir)
                {
                    issues.insert(format!("{relative}: invalid recorded source path"));
                } else if destination.is_dir() && !platform_link::is_dir_link(&destination) {
                    let modified = project_files::fingerprint(&destination, false, 0)
                        .ok()
                        .as_deref()
                        != Some(copy.fingerprint.as_str());
                    installed = Some((source, if modified { "modified copy" } else { "copy" }));
                    if modified {
                        issues.insert(format!("{relative}: project copy was modified; preserve its contents and resolve the sync conflict"));
                    }
                }
            } else if platform_link::is_dir_link(&destination) {
                if let Some(source) = platform_link::read_link_target(&destination)
                    .filter(|source| source.starts_with(&library))
                {
                    installed = Some((source, "symlink"));
                }
            }
            if let Some((source, state)) = installed {
                if !source.is_dir() {
                    issues.insert(format!(
                        "{relative}: source missing; preserve the installation"
                    ));
                }
                if active
                    && plan
                        .desired
                        .get(&name)
                        .is_some_and(|desired| desired != &source)
                {
                    issues.insert(format!("{relative}: installed source differs from the configured source; resolve the sync conflict first"));
                }
                rows.insert(relative, (source, state));
            } else if (active && plan.desired.contains_key(&name)) || copies.contains_key(&relative)
            {
                issues.insert(format!("{relative}: configured skill is not installed as a managed entry here; do not edit or replace an occupied user directory"));
            }
        }
    }
    let installations = if rows.is_empty() {
        "No managed skill installations are currently present.".to_owned()
    } else {
        let mut table =
            "| Project installation | Source directory | State |\n| --- | --- | --- |\n".to_owned();
        for (relative, (source, state)) in rows {
            table.push_str(&format!(
                "| {} | {} | {state} |\n",
                code(&relative),
                code(&source.to_string_lossy())
            ));
        }
        table.trim_end().to_owned()
    };
    let issues = if issues.is_empty() {
        "None.".to_owned()
    } else {
        issues
            .into_iter()
            .map(|issue| format!("- {}", code(&issue)))
            .collect::<Vec<_>>()
            .join("\n")
    };
    Ok(format!(
        include_str!("templates/project_guidance.md"),
        mode = code(project.skill_install_mode.as_str()),
        storage_root = code(&paths.root.to_string_lossy()),
        local_dir = code(&paths.local_dir().to_string_lossy()),
        installations = installations,
        issues = issues,
    ))
}

struct FileChange {
    relative: String,
    before: Option<String>,
    after: Option<String>,
    backed_up: bool,
    installed: bool,
}

impl FileChange {
    fn new(relative: &str, before: Option<String>, after: Option<String>) -> Self {
        Self {
            relative: relative.to_owned(),
            before,
            after,
            backed_up: false,
            installed: false,
        }
    }
}

// Keep backups until the enclosing skill conversion and database transaction commit.
pub(super) struct FileTransaction {
    root: PathBuf,
    changes: Vec<FileChange>,
    temp: Option<tempfile::TempDir>,
    created_agents: bool,
}

impl FileTransaction {
    fn prepare(root: &Path, mut changes: Vec<FileChange>) -> AppResult<Self> {
        changes.retain(|change| change.before != change.after);
        let temp = if changes.is_empty() {
            None
        } else {
            Some(
                tempfile::Builder::new()
                    .prefix(".longan-guidance-")
                    .tempdir_in(root)?,
            )
        };
        if let Some(temp) = &temp {
            for (index, change) in changes.iter().enumerate() {
                if let Some(content) = &change.after {
                    let staged = temp.path().join(format!("new-{index}"));
                    std::fs::write(&staged, content)?;
                    if change.before.is_some() {
                        std::fs::set_permissions(
                            &staged,
                            std::fs::metadata(root.join(&change.relative))?.permissions(),
                        )?;
                    }
                }
            }
        }
        Ok(Self {
            root: root.to_path_buf(),
            changes,
            temp,
            created_agents: false,
        })
    }

    pub(super) fn apply(&mut self) -> AppResult<()> {
        let Some(temp) = &self.temp else {
            return Ok(());
        };
        for change in &self.changes {
            if read_file(&self.root, &change.relative)? != change.before {
                return Err(invalid(format!(
                    "{}: file changed during guidance update",
                    change.relative
                )));
            }
        }
        if self
            .changes
            .iter()
            .any(|c| c.relative == GUIDE && c.after.is_some())
            && !self.root.join(".agents").exists()
        {
            std::fs::create_dir(self.root.join(".agents"))?;
            self.created_agents = true;
        }
        for (index, change) in self.changes.iter_mut().enumerate() {
            let destination = self.root.join(&change.relative);
            if change.before.is_some() {
                std::fs::rename(&destination, temp.path().join(format!("old-{index}")))?;
                change.backed_up = true;
            }
            if change.after.is_some() {
                std::fs::rename(temp.path().join(format!("new-{index}")), &destination)?;
                change.installed = true;
            }
        }
        Ok(())
    }

    pub(super) fn rollback(&mut self) -> Vec<String> {
        let Some(temp) = &self.temp else {
            return vec![];
        };
        let mut errors = Vec::new();
        for (index, change) in self.changes.iter_mut().enumerate().rev() {
            let restored = (|| -> AppResult<()> {
                let destination = self.root.join(&change.relative);
                if change.installed {
                    std::fs::remove_file(&destination)?;
                    change.installed = false;
                }
                if change.backed_up {
                    std::fs::rename(temp.path().join(format!("old-{index}")), destination)?;
                    change.backed_up = false;
                }
                Ok(())
            })();
            if let Err(error) = restored {
                errors.push(format!(
                    "{}: {error}; backups: {}",
                    change.relative,
                    temp.path().display()
                ));
            }
        }
        if !errors.is_empty() {
            if let Some(temp) = self.temp.take() {
                let _ = temp.keep();
            }
        } else if self.created_agents {
            let _ = std::fs::remove_dir(self.root.join(".agents"));
            self.created_agents = false;
        }
        errors
    }

    fn recover(&mut self, error: AppError) -> AppError {
        let errors = self.rollback();
        if errors.is_empty() {
            error
        } else {
            AppError::Other(format!("{error}; recovery failed: {}", errors.join("; ")))
        }
    }

    fn commit(mut self) -> AppResult<Vec<String>> {
        if let Err(error) = self.apply() {
            return Err(self.recover(error));
        }
        Ok(self
            .changes
            .iter()
            .map(|change| change.relative.clone())
            .collect())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::Db;
    use crate::models::SkillInstallMode;
    use crate::services::scanner;

    struct Fixture {
        _temp: tempfile::TempDir,
        paths: Paths,
        conn: Connection,
        root: PathBuf,
        id: i64,
        skill_id: i64,
    }

    fn setup() -> Fixture {
        let temp = tempfile::tempdir().unwrap();
        let paths = Paths::with_root(temp.path().join("自定义 library"));
        paths.ensure_layout().unwrap();
        let source = paths.local_dir().join("demo");
        std::fs::create_dir_all(&source).unwrap();
        std::fs::write(source.join("SKILL.md"), "---\nname: demo\n---\nOriginal").unwrap();
        let conn = Db::open_in_memory().unwrap().conn.into_inner().unwrap();
        scanner::rescan(&conn, &paths).unwrap();
        let skill_id = repo::list_skills(&conn).unwrap()[0].id;
        let root = temp.path().join("项目");
        std::fs::create_dir_all(&root).unwrap();
        let id = repo::create_project(&conn, "Demo", root.to_str().unwrap()).unwrap();
        repo::set_project_skill(&conn, id, skill_id, true).unwrap();
        repo::set_project_skill_install_mode(&conn, id, SkillInstallMode::Copy).unwrap();
        Fixture {
            _temp: temp,
            paths,
            conn,
            root,
            id,
            skill_id,
        }
    }

    fn guide(f: &Fixture) -> String {
        std::fs::read_to_string(f.root.join(GUIDE)).unwrap()
    }

    #[test]
    fn copy_sync_generates_fixed_english_with_actual_paths_and_is_idempotent() {
        let f = setup();
        assert!(!f.root.join(AGENTS).exists());
        let original = "# 用户说明\r\n\r\nKeep this.\r\n";
        std::fs::write(f.root.join(AGENTS), original).unwrap();
        let result = linker::sync_project(&f.conn, &f.paths, f.id).unwrap();
        assert!(result.conflicts.is_empty());
        let text = guide(&f);
        assert!(text.contains("# Longan-managed skills"));
        assert!(text.contains(&f.paths.local_dir().to_string_lossy().to_string()));
        assert!(text.contains("| `.agents/skills/demo` |"));
        let agents = std::fs::read_to_string(f.root.join(AGENTS)).unwrap();
        assert!(agents.starts_with(original));
        assert!(agents.contains(&ROOT_BLOCK.replace('\n', "\r\n")));
        assert_eq!(agents.matches(START).count(), 1);
        let modified = std::fs::metadata(f.root.join(GUIDE))
            .unwrap()
            .modified()
            .unwrap();
        let again = linker::sync_project(&f.conn, &f.paths, f.id).unwrap();
        assert!(again.updated.is_empty());
        assert!(again.conflicts.is_empty());
        assert_eq!(
            std::fs::read_to_string(f.root.join(AGENTS)).unwrap(),
            agents
        );
        assert_eq!(
            std::fs::metadata(f.root.join(GUIDE))
                .unwrap()
                .modified()
                .unwrap(),
            modified
        );
    }

    #[test]
    fn copy_sync_generates_guidance_and_refreshes_associations() {
        let f = setup();
        linker::sync_project(&f.conn, &f.paths, f.id).unwrap();
        assert!(guide(&f).contains("Installation mode: `copy`"));
        assert!(guide(&f).contains("| copy |"));
        repo::set_project_skill(&f.conn, f.id, f.skill_id, false).unwrap();
        linker::sync_project(&f.conn, &f.paths, f.id).unwrap();
        assert!(guide(&f).contains("No managed skill installations"));
    }

    #[test]
    fn converting_to_copy_generates_guidance_from_converted_installations_and_reports_warnings() {
        let f = setup();
        repo::set_project_skill_install_mode(&f.conn, f.id, SkillInstallMode::Symlink).unwrap();
        repo::create_agent(&f.conn, "Claude", ".claude/skills", true).unwrap();
        linker::sync_project(&f.conn, &f.paths, f.id).unwrap();
        std::fs::write(f.root.join(AGENTS), "User instructions\n").unwrap();
        std::fs::write(f.root.join("AGENTS.override.md"), "Override").unwrap();
        let report =
            linker::set_project_mode(&f.conn, &f.paths, f.id, SkillInstallMode::Copy).unwrap();
        let agents = std::fs::read_to_string(f.root.join(AGENTS)).unwrap();
        assert!(agents.starts_with("User instructions\n"));
        assert_eq!(agents.matches(START).count(), 1);
        let text = guide(&f);
        assert!(text.contains("Installation mode: `copy`"));
        for directory in [".agents/skills/demo", ".claude/skills/demo"] {
            assert!(!platform_link::is_dir_link(&f.root.join(directory)));
            assert!(text.contains(&format!("| `{directory}` |")));
        }
        assert!(!text.contains("| symlink |"));
        assert!(text.contains("| copy |"));
        assert_eq!(report.conflicts.len(), 1);
        assert!(report.conflicts[0].contains("AGENTS.override.md"));
        assert_eq!(
            repo::get_project_sync_report(&f.conn, f.id)
                .unwrap()
                .unwrap()
                .conflicts,
            report.conflicts
        );
    }

    #[test]
    fn converting_to_copy_generates_guidance_without_skills() {
        let f = setup();
        repo::set_project_skill(&f.conn, f.id, f.skill_id, false).unwrap();
        repo::set_project_skill_install_mode(&f.conn, f.id, SkillInstallMode::Symlink).unwrap();
        linker::set_project_mode(&f.conn, &f.paths, f.id, SkillInstallMode::Copy).unwrap();
        assert!(std::fs::read_to_string(f.root.join(AGENTS))
            .unwrap()
            .contains(ROOT_BLOCK));
        assert!(guide(&f).contains("No managed skill installations"));
    }

    #[test]
    fn unsafe_guidance_rolls_back_copy_conversion_without_changing_user_files() {
        for (relative, content) in [(AGENTS, START), (GUIDE, "User documentation")] {
            let f = setup();
            repo::set_project_skill_install_mode(&f.conn, f.id, SkillInstallMode::Symlink).unwrap();
            repo::create_agent(&f.conn, "Claude", ".claude/skills", true).unwrap();
            linker::sync_project(&f.conn, &f.paths, f.id).unwrap();
            std::fs::write(f.root.join(relative), content).unwrap();
            let error = linker::set_project_mode(&f.conn, &f.paths, f.id, SkillInstallMode::Copy)
                .unwrap_err();
            assert!(error.to_string().contains("AI guidance"));
            assert_eq!(
                repo::get_project(&f.conn, f.id).unwrap().skill_install_mode,
                SkillInstallMode::Symlink
            );
            for directory in [".agents/skills/demo", ".claude/skills/demo"] {
                assert!(platform_link::is_dir_link(&f.root.join(directory)));
            }
            assert!(repo::managed_skill_copies(&f.conn, f.id)
                .unwrap()
                .is_empty());
            assert_eq!(
                std::fs::read_to_string(f.root.join(relative)).unwrap(),
                content
            );
            let other = if relative == AGENTS { GUIDE } else { AGENTS };
            assert!(!f.root.join(other).exists());
        }
    }

    #[test]
    fn failed_copy_conversion_commit_restores_guidance_links_and_original_mode() {
        for existing_guidance in [false, true] {
            let f = setup();
            repo::set_project_skill_install_mode(&f.conn, f.id, SkillInstallMode::Symlink).unwrap();
            repo::create_agent(&f.conn, "Claude", ".claude/skills", true).unwrap();
            linker::sync_project(&f.conn, &f.paths, f.id).unwrap();
            std::fs::write(f.root.join(AGENTS), "User instructions\n").unwrap();
            if existing_guidance {
                repo::set_project_skill_install_mode(&f.conn, f.id, SkillInstallMode::Copy)
                    .unwrap();
                generate(&f.conn, &f.paths, f.id).unwrap();
                repo::set_project_skill_install_mode(&f.conn, f.id, SkillInstallMode::Symlink)
                    .unwrap();
            }
            let agents = std::fs::read_to_string(f.root.join(AGENTS)).unwrap();
            let original_guide = read_file(&f.root, GUIDE).unwrap();
            f.conn.execute_batch("CREATE TABLE commit_failure (project_id INTEGER REFERENCES projects(id) DEFERRABLE INITIALLY DEFERRED);
                CREATE TRIGGER fail_commit AFTER UPDATE OF skill_install_mode ON projects BEGIN INSERT INTO commit_failure VALUES (-1); END;").unwrap();
            let error = linker::set_project_mode(&f.conn, &f.paths, f.id, SkillInstallMode::Copy)
                .unwrap_err();
            assert!(error.to_string().contains("FOREIGN KEY"));
            assert_eq!(
                repo::get_project(&f.conn, f.id).unwrap().skill_install_mode,
                SkillInstallMode::Symlink
            );
            for directory in [".agents/skills/demo", ".claude/skills/demo"] {
                assert!(platform_link::is_dir_link(&f.root.join(directory)));
            }
            assert!(repo::managed_skill_copies(&f.conn, f.id)
                .unwrap()
                .is_empty());
            assert_eq!(
                std::fs::read_to_string(f.root.join(AGENTS)).unwrap(),
                agents
            );
            assert_eq!(read_file(&f.root, GUIDE).unwrap(), original_guide);
        }
    }

    #[cfg(unix)]
    #[test]
    fn guidance_write_failure_restores_instructions_and_all_converted_links() {
        use std::os::unix::fs::PermissionsExt;
        let f = setup();
        repo::set_project_skill_install_mode(&f.conn, f.id, SkillInstallMode::Symlink).unwrap();
        repo::create_agent(&f.conn, "Claude", ".claude/skills", true).unwrap();
        linker::sync_project(&f.conn, &f.paths, f.id).unwrap();
        std::fs::write(f.root.join(AGENTS), "User instructions\n").unwrap();
        let directory = f.root.join(".agents");
        let permissions = std::fs::metadata(&directory).unwrap().permissions();
        std::fs::set_permissions(&directory, std::fs::Permissions::from_mode(0o555)).unwrap();
        let probe = directory.join("permission-probe");
        if std::fs::write(&probe, "").is_ok() {
            // Privileged test runners may bypass directory permissions.
            std::fs::remove_file(probe).unwrap();
            std::fs::set_permissions(&directory, permissions).unwrap();
            return;
        }
        let result = linker::set_project_mode(&f.conn, &f.paths, f.id, SkillInstallMode::Copy);
        std::fs::set_permissions(&directory, permissions).unwrap();
        assert!(result.unwrap_err().to_string().contains("AI guidance"));
        assert_eq!(
            repo::get_project(&f.conn, f.id).unwrap().skill_install_mode,
            SkillInstallMode::Symlink
        );
        for directory in [".agents/skills/demo", ".claude/skills/demo"] {
            assert!(platform_link::is_dir_link(&f.root.join(directory)));
        }
        assert!(repo::managed_skill_copies(&f.conn, f.id)
            .unwrap()
            .is_empty());
        assert_eq!(
            std::fs::read_to_string(f.root.join(AGENTS)).unwrap(),
            "User instructions\n"
        );
        assert!(!f.root.join(GUIDE).exists());
    }

    #[test]
    fn symlink_mode_never_generates_guidance_and_leaves_user_files_untouched() {
        let f = setup();
        repo::set_project_skill_install_mode(&f.conn, f.id, SkillInstallMode::Symlink).unwrap();
        for _ in 0..2 {
            linker::sync_project(&f.conn, &f.paths, f.id).unwrap();
            assert!(generate(&f.conn, &f.paths, f.id)
                .unwrap_err()
                .to_string()
                .contains("only available in copy mode"));
            assert!(!f.root.join(GUIDE).exists());
            assert!(!f.root.join(AGENTS).exists());
        }
        std::fs::write(f.root.join(AGENTS), "User instructions").unwrap();
        std::fs::write(f.root.join(GUIDE), "User documentation").unwrap();
        assert!(linker::sync_project(&f.conn, &f.paths, f.id)
            .unwrap()
            .conflicts
            .is_empty());
        assert_eq!(
            std::fs::read_to_string(f.root.join(AGENTS)).unwrap(),
            "User instructions"
        );
        assert_eq!(guide(&f), "User documentation");
    }

    #[test]
    fn switching_to_symlinks_removes_guidance_and_switching_back_regenerates_it() {
        let f = setup();
        std::fs::write(f.root.join(AGENTS), "User instructions\n").unwrap();
        linker::sync_project(&f.conn, &f.paths, f.id).unwrap();
        generate(&f.conn, &f.paths, f.id).unwrap();
        linker::set_project_mode(&f.conn, &f.paths, f.id, SkillInstallMode::Symlink).unwrap();
        assert!(!f.root.join(GUIDE).exists());
        assert!(platform_link::is_dir_link(
            &f.root.join(".agents/skills/demo")
        ));
        let agents = std::fs::read_to_string(f.root.join(AGENTS)).unwrap();
        assert!(agents.contains("User instructions"));
        assert!(!agents.contains(START));
        linker::set_project_mode(&f.conn, &f.paths, f.id, SkillInstallMode::Copy).unwrap();
        assert!(f.root.join(GUIDE).exists());
        assert!(std::fs::read_to_string(f.root.join(AGENTS))
            .unwrap()
            .contains(START));
        assert!(guide(&f).contains("| copy |"));
    }

    #[test]
    fn ordinary_symlink_sync_cleans_legacy_guidance_and_reports_unsafe_cleanup() {
        let f = setup();
        generate(&f.conn, &f.paths, f.id).unwrap();
        repo::set_project_skill_install_mode(&f.conn, f.id, SkillInstallMode::Symlink).unwrap();
        linker::sync_project(&f.conn, &f.paths, f.id).unwrap();
        assert!(!f.root.join(GUIDE).exists());
        assert!(!std::fs::read_to_string(f.root.join(AGENTS))
            .unwrap()
            .contains(START));
        std::fs::write(f.root.join(AGENTS), START).unwrap();
        let report = linker::sync_project(&f.conn, &f.paths, f.id).unwrap();
        assert!(report
            .conflicts
            .iter()
            .any(|conflict| conflict.contains("AI guidance")));
        assert_eq!(std::fs::read_to_string(f.root.join(AGENTS)).unwrap(), START);
    }

    #[test]
    fn cleanup_rejects_damaged_files_before_changing_the_mode_or_installations() {
        for damaged in [AGENTS, GUIDE] {
            let f = setup();
            linker::sync_project(&f.conn, &f.paths, f.id).unwrap();
            generate(&f.conn, &f.paths, f.id).unwrap();
            std::fs::write(f.root.join(damaged), START).unwrap();
            let agents = std::fs::read_to_string(f.root.join(AGENTS)).unwrap();
            let original_guide = guide(&f);
            assert!(
                linker::set_project_mode(&f.conn, &f.paths, f.id, SkillInstallMode::Symlink)
                    .is_err()
            );
            assert_eq!(
                repo::get_project(&f.conn, f.id).unwrap().skill_install_mode,
                SkillInstallMode::Copy
            );
            assert!(!platform_link::is_dir_link(
                &f.root.join(".agents/skills/demo")
            ));
            assert_eq!(
                std::fs::read_to_string(f.root.join(AGENTS)).unwrap(),
                agents
            );
            assert_eq!(guide(&f), original_guide);
        }
    }

    #[test]
    fn database_failure_rolls_back_guidance_cleanup_alongside_all_skill_conversions() {
        let f = setup();
        repo::create_agent(&f.conn, "Claude", ".claude/skills", true).unwrap();
        linker::sync_project(&f.conn, &f.paths, f.id).unwrap();
        generate(&f.conn, &f.paths, f.id).unwrap();
        let agents = std::fs::read_to_string(f.root.join(AGENTS)).unwrap();
        let original_guide = guide(&f);
        let copies = repo::managed_skill_copies(&f.conn, f.id).unwrap().len();
        f.conn.execute_batch("CREATE TRIGGER fail_mode BEFORE UPDATE OF skill_install_mode ON projects BEGIN SELECT RAISE(FAIL, 'simulated mode save failure'); END;").unwrap();
        assert!(
            linker::set_project_mode(&f.conn, &f.paths, f.id, SkillInstallMode::Symlink).is_err()
        );
        assert_eq!(
            repo::get_project(&f.conn, f.id).unwrap().skill_install_mode,
            SkillInstallMode::Copy
        );
        for directory in [".agents/skills/demo", ".claude/skills/demo"] {
            assert!(!platform_link::is_dir_link(&f.root.join(directory)));
            assert!(f.root.join(directory).join("SKILL.md").is_file());
        }
        assert_eq!(
            repo::managed_skill_copies(&f.conn, f.id).unwrap().len(),
            copies
        );
        assert_eq!(
            std::fs::read_to_string(f.root.join(AGENTS)).unwrap(),
            agents
        );
        assert_eq!(guide(&f), original_guide);
    }

    #[test]
    fn cleanup_write_failure_restores_the_preceding_instruction_change() {
        let f = setup();
        generate(&f.conn, &f.paths, f.id).unwrap();
        let agents = std::fs::read_to_string(f.root.join(AGENTS)).unwrap();
        let original_guide = guide(&f);
        let mut transaction = prepare_cleanup(&repo::get_project(&f.conn, f.id).unwrap()).unwrap();
        std::fs::remove_file(transaction.temp.as_ref().unwrap().path().join("new-0")).unwrap();
        let error = transaction.apply().unwrap_err();
        let _ = transaction.recover(error);
        assert_eq!(
            std::fs::read_to_string(f.root.join(AGENTS)).unwrap(),
            agents
        );
        assert_eq!(guide(&f), original_guide);
    }

    #[test]
    fn database_commit_failure_restores_guidance_and_copied_installations() {
        let f = setup();
        linker::sync_project(&f.conn, &f.paths, f.id).unwrap();
        generate(&f.conn, &f.paths, f.id).unwrap();
        let agents = std::fs::read_to_string(f.root.join(AGENTS)).unwrap();
        let original_guide = guide(&f);
        f.conn.execute_batch("CREATE TABLE commit_failure (project_id INTEGER REFERENCES projects(id) DEFERRABLE INITIALLY DEFERRED);
            CREATE TRIGGER fail_commit AFTER UPDATE OF skill_install_mode ON projects BEGIN INSERT INTO commit_failure VALUES (-1); END;").unwrap();
        let error = linker::set_project_mode(&f.conn, &f.paths, f.id, SkillInstallMode::Symlink)
            .unwrap_err();
        assert!(error.to_string().contains("FOREIGN KEY"));
        assert_eq!(
            repo::get_project(&f.conn, f.id).unwrap().skill_install_mode,
            SkillInstallMode::Copy
        );
        assert_eq!(repo::managed_skill_copies(&f.conn, f.id).unwrap().len(), 1);
        assert!(!platform_link::is_dir_link(
            &f.root.join(".agents/skills/demo")
        ));
        assert_eq!(
            std::fs::read_to_string(f.root.join(AGENTS)).unwrap(),
            agents
        );
        assert_eq!(guide(&f), original_guide);
    }

    #[test]
    fn edited_skill_copy_blocks_conversion_without_removing_guidance() {
        let f = setup();
        linker::sync_project(&f.conn, &f.paths, f.id).unwrap();
        generate(&f.conn, &f.paths, f.id).unwrap();
        let original_guide = guide(&f);
        let agents = std::fs::read_to_string(f.root.join(AGENTS)).unwrap();
        let skill = f.root.join(".agents/skills/demo/SKILL.md");
        std::fs::write(&skill, "User edit").unwrap();
        assert!(
            linker::set_project_mode(&f.conn, &f.paths, f.id, SkillInstallMode::Symlink).is_err()
        );
        assert_eq!(std::fs::read_to_string(skill).unwrap(), "User edit");
        assert_eq!(guide(&f), original_guide);
        assert_eq!(
            std::fs::read_to_string(f.root.join(AGENTS)).unwrap(),
            agents
        );
    }

    #[cfg(unix)]
    #[test]
    fn linked_guidance_blocks_conversion_without_touching_its_target() {
        let f = setup();
        linker::sync_project(&f.conn, &f.paths, f.id).unwrap();
        generate(&f.conn, &f.paths, f.id).unwrap();
        let saved = f._temp.path().join("saved-guide");
        std::fs::rename(f.root.join(GUIDE), &saved).unwrap();
        std::os::unix::fs::symlink(&saved, f.root.join(GUIDE)).unwrap();
        let original = std::fs::read_to_string(&saved).unwrap();
        assert!(
            linker::set_project_mode(&f.conn, &f.paths, f.id, SkillInstallMode::Symlink).is_err()
        );
        assert_eq!(
            repo::get_project(&f.conn, f.id).unwrap().skill_install_mode,
            SkillInstallMode::Copy
        );
        assert!(!platform_link::is_dir_link(
            &f.root.join(".agents/skills/demo")
        ));
        assert_eq!(std::fs::read_to_string(saved).unwrap(), original);
    }

    #[cfg(unix)]
    #[test]
    fn unwritable_guidance_directory_blocks_conversion_and_restores_root_instructions() {
        use std::os::unix::fs::PermissionsExt;
        let f = setup();
        linker::sync_project(&f.conn, &f.paths, f.id).unwrap();
        generate(&f.conn, &f.paths, f.id).unwrap();
        let agents = std::fs::read_to_string(f.root.join(AGENTS)).unwrap();
        let original_guide = guide(&f);
        let directory = f.root.join(".agents");
        let permissions = std::fs::metadata(&directory).unwrap().permissions();
        std::fs::set_permissions(&directory, std::fs::Permissions::from_mode(0o555)).unwrap();
        let probe = directory.join("permission-probe");
        if std::fs::write(&probe, "").is_ok() {
            // Privileged test runners may bypass directory permissions.
            std::fs::remove_file(probe).unwrap();
            std::fs::set_permissions(&directory, permissions).unwrap();
            return;
        }
        let result = linker::set_project_mode(&f.conn, &f.paths, f.id, SkillInstallMode::Symlink);
        std::fs::set_permissions(&directory, permissions).unwrap();
        assert!(result
            .unwrap_err()
            .to_string()
            .contains("AI guidance cleanup"));
        assert_eq!(
            repo::get_project(&f.conn, f.id).unwrap().skill_install_mode,
            SkillInstallMode::Copy
        );
        assert!(!platform_link::is_dir_link(
            &f.root.join(".agents/skills/demo")
        ));
        assert_eq!(
            std::fs::read_to_string(f.root.join(AGENTS)).unwrap(),
            agents
        );
        assert_eq!(guide(&f), original_guide);
    }

    #[test]
    fn preserves_user_file_and_rejects_bad_markers_before_writing_either_file() {
        let f = setup();
        std::fs::create_dir_all(f.root.join(".agents")).unwrap();
        std::fs::write(f.root.join(GUIDE), "User documentation").unwrap();
        assert!(generate(&f.conn, &f.paths, f.id).is_err());
        assert!(!f.root.join(AGENTS).exists());
        assert_eq!(guide(&f), "User documentation");
        std::fs::remove_file(f.root.join(GUIDE)).unwrap();
        for content in [
            START.to_owned(),
            format!("{END}\n{START}"),
            format!("{START}\n{ROOT_BLOCK}\n{END}"),
            format!("inline {ROOT_BLOCK}"),
        ] {
            std::fs::write(f.root.join(AGENTS), &content).unwrap();
            assert!(generate(&f.conn, &f.paths, f.id).is_err());
            assert_eq!(
                std::fs::read_to_string(f.root.join(AGENTS)).unwrap(),
                content
            );
            assert!(!f.root.join(GUIDE).exists());
        }
    }

    #[test]
    fn copy_sync_restores_missing_guidance_files() {
        for missing in [vec![AGENTS], vec![GUIDE], vec![AGENTS, GUIDE]] {
            let f = setup();
            linker::sync_project(&f.conn, &f.paths, f.id).unwrap();
            for relative in missing {
                std::fs::remove_file(f.root.join(relative)).unwrap();
            }
            let report = linker::sync_project(&f.conn, &f.paths, f.id).unwrap();
            assert!(report.conflicts.is_empty());
            assert!(std::fs::read_to_string(f.root.join(AGENTS))
                .unwrap()
                .contains(ROOT_BLOCK));
            assert!(guide(&f).contains("| `.agents/skills/demo` |"));
        }
    }

    #[test]
    fn damaged_guidance_is_preserved_and_reported_without_blocking_skill_sync() {
        let f = setup();
        generate(&f.conn, &f.paths, f.id).unwrap();
        let damaged = guide(&f).replace(GUIDE_END, "");
        std::fs::write(f.root.join(GUIDE), &damaged).unwrap();
        let report = linker::sync_project(&f.conn, &f.paths, f.id).unwrap();
        assert_eq!(report.created, ["demo"]);
        assert!(report
            .conflicts
            .iter()
            .any(|s| s.contains("not recognized as Longan-generated")));
        assert_eq!(guide(&f), damaged);
        assert_eq!(
            repo::get_project_sync_report(&f.conn, f.id)
                .unwrap()
                .unwrap()
                .conflicts,
            report.conflicts
        );
        assert!(refresh(&f.conn, &f.paths, f.id).is_err());
        assert_eq!(guide(&f), damaged);
    }

    #[test]
    fn cleanup_removes_only_owned_guidance_and_preserves_other_instructions() {
        let f = setup();
        std::fs::write(f.root.join(AGENTS), "Before\n").unwrap();
        generate(&f.conn, &f.paths, f.id).unwrap();
        let mut agents = std::fs::read_to_string(f.root.join(AGENTS)).unwrap();
        agents.push_str("\nAfter\n");
        std::fs::write(f.root.join(AGENTS), &agents).unwrap();
        linker::cleanup_project(&f.conn, &f.paths, f.id).unwrap();
        assert!(!f.root.join(GUIDE).exists());
        assert_eq!(
            std::fs::read_to_string(f.root.join(AGENTS)).unwrap(),
            agents.replace(ROOT_BLOCK, "")
        );
    }

    #[test]
    fn mapping_distinguishes_unmanaged_destinations_modified_copies_and_missing_sources() {
        let f = setup();
        let destination = f.root.join(".agents/skills/demo");
        std::fs::create_dir_all(&destination).unwrap();
        std::fs::write(destination.join("SKILL.md"), "User skill").unwrap();
        generate(&f.conn, &f.paths, f.id).unwrap();
        assert!(!guide(&f).contains("| `.agents/skills/demo` |"));
        assert!(guide(&f).contains("not installed as a managed entry"));
        std::fs::remove_dir_all(&destination).unwrap();
        linker::set_project_mode(&f.conn, &f.paths, f.id, SkillInstallMode::Copy).unwrap();
        std::fs::write(destination.join("SKILL.md"), "Local edit").unwrap();
        std::fs::remove_dir_all(f.paths.local_dir().join("demo")).unwrap();
        linker::sync_project(&f.conn, &f.paths, f.id).unwrap();
        assert!(guide(&f).contains("modified copy"));
        assert!(guide(&f).contains("source missing"));
        assert_eq!(
            std::fs::read_to_string(destination.join("SKILL.md")).unwrap(),
            "Local edit"
        );
    }

    #[test]
    fn expands_preset_collections_and_enabled_agent_directories() {
        let f = setup();
        let collection = f.paths.local_dir().join("collection");
        std::fs::create_dir_all(collection.join("child")).unwrap();
        std::fs::write(collection.join("child/SKILL.md"), "Child").unwrap();
        scanner::rescan(&f.conn, &f.paths).unwrap();
        let skill = repo::list_skills(&f.conn)
            .unwrap()
            .into_iter()
            .find(|s| s.name == "collection")
            .unwrap();
        let preset = repo::create_preset(&f.conn, "Preset", None).unwrap();
        repo::set_preset_skills(&f.conn, preset, &[skill.id]).unwrap();
        repo::set_project_preset(&f.conn, f.id, preset, true).unwrap();
        repo::create_agent(&f.conn, "Claude", ".claude/skills", true).unwrap();
        linker::sync_project(&f.conn, &f.paths, f.id).unwrap();
        generate(&f.conn, &f.paths, f.id).unwrap();
        let text = guide(&f);
        assert!(text.contains("| `.agents/skills/child` |"));
        assert!(text.contains("| `.claude/skills/child` |"));
        assert!(text.contains(&collection.join("child").to_string_lossy().to_string()));
    }

    #[test]
    fn reports_instruction_override_and_missing_project() {
        let f = setup();
        std::fs::write(f.root.join("AGENTS.override.md"), "Override").unwrap();
        assert!(
            generate(&f.conn, &f.paths, f.id).unwrap().warnings[0].contains("AGENTS.override.md")
        );
        std::fs::remove_dir_all(&f.root).unwrap();
        assert!(generate(&f.conn, &f.paths, f.id)
            .unwrap_err()
            .to_string()
            .contains("project directory does not exist"));
    }

    #[test]
    fn special_path_characters_are_escaped_without_breaking_tables_or_ownership_markers() {
        assert_eq!(code("a&b|<c>`"), "<code>a&amp;b&#124;&lt;c&gt;&#96;</code>");
        let f = setup();
        let paths = Paths::with_root(f.paths.root.join("a&b"));
        paths.ensure_layout().unwrap();
        let text = render(&f.conn, &paths, &repo::get_project(&f.conn, f.id).unwrap()).unwrap();
        assert!(text.contains("a&amp;b"));
        validate_guide(&text).unwrap();
    }

    #[test]
    fn write_failure_restores_the_preceding_file() {
        let f = setup();
        std::fs::write(f.root.join(AGENTS), "Original").unwrap();
        let result = FileTransaction::prepare(
            &f.root,
            vec![
                FileChange::new(AGENTS, Some("Original".into()), Some("Replacement".into())),
                FileChange::new("absent/child.md", None, Some("Cannot write".into())),
            ],
        )
        .unwrap()
        .commit();
        assert!(result.is_err());
        assert_eq!(
            std::fs::read_to_string(f.root.join(AGENTS)).unwrap(),
            "Original"
        );
        assert_eq!(std::fs::read_dir(&f.root).unwrap().count(), 1);
    }

    #[test]
    fn rechecks_destinations_before_any_changes() {
        let f = setup();
        std::fs::write(f.root.join(AGENTS), "Concurrent edit").unwrap();
        assert!(FileTransaction::prepare(
            &f.root,
            vec![FileChange::new(AGENTS, None, Some("New".into()))]
        )
        .unwrap()
        .commit()
        .is_err());
        assert_eq!(
            std::fs::read_to_string(f.root.join(AGENTS)).unwrap(),
            "Concurrent edit"
        );
    }

    #[cfg(unix)]
    #[test]
    fn rejects_linked_targets_and_ancestors_without_modifying_their_targets() {
        let f = setup();
        let outside = f._temp.path().join("outside");
        std::fs::create_dir_all(&outside).unwrap();
        std::fs::write(outside.join("file"), "Untouched").unwrap();
        std::os::unix::fs::symlink(outside.join("file"), f.root.join(AGENTS)).unwrap();
        assert!(generate(&f.conn, &f.paths, f.id).is_err());
        assert!(refresh(&f.conn, &f.paths, f.id).is_err());
        std::fs::remove_file(f.root.join(AGENTS)).unwrap();
        std::os::unix::fs::symlink(&outside, f.root.join(".agents")).unwrap();
        assert!(generate(&f.conn, &f.paths, f.id).is_err());
        assert_eq!(
            std::fs::read_to_string(outside.join("file")).unwrap(),
            "Untouched"
        );
        assert!(!outside.join("longan.md").exists());
    }
}
