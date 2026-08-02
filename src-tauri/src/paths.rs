use std::fs::OpenOptions;
use std::io::{self, Write};
use std::path::PathBuf;

use crate::error::AppResult;
use crate::validate;

/// Central place for all application data paths.
#[derive(Clone, Debug)]
pub struct Paths {
    pub root: PathBuf,
}

impl Paths {
    const GITIGNORE_CONTENT: &'static [u8] = b"git-cache/\nlogs/\n";

    /// Use a resolved storage root. Tests use this with temporary directories.
    pub fn with_root(root: PathBuf) -> Self {
        Self { root }
    }

    pub fn db_file(&self) -> PathBuf {
        self.root.join("longan.db")
    }

    pub fn skills_dir(&self) -> PathBuf {
        self.root.join("skills")
    }

    pub fn net_dir(&self) -> PathBuf {
        self.skills_dir().join("net")
    }

    pub fn local_dir(&self) -> PathBuf {
        self.skills_dir().join("local")
    }

    pub fn git_cache_dir(&self) -> PathBuf {
        self.root.join("git-cache")
    }

    pub fn logs_dir(&self) -> PathBuf {
        self.root.join("logs")
    }

    pub fn trash_dir(&self) -> PathBuf {
        self.root.join("trash")
    }

    pub fn git_cache_repo(&self, owner: &str, repo: &str) -> AppResult<PathBuf> {
        validate::validate_segment(owner)?;
        validate::validate_segment(repo)?;
        Ok(self.git_cache_dir().join(owner).join(format!("{repo}.git")))
    }

    pub fn git_cache_archive(&self, owner: &str, repo: &str, commit: &str) -> AppResult<PathBuf> {
        validate::validate_segment(owner)?;
        validate::validate_segment(repo)?;
        validate::validate_segment(commit)?;
        Ok(self
            .git_cache_dir()
            .join(owner)
            .join(format!("{repo}.archives"))
            .join(format!("{commit}.tar.gz")))
    }

    /// Absolute source dir for a skill given its `dir_path` relative to `skills/`.
    pub fn skill_source_dir(&self, dir_path: &str) -> PathBuf {
        self.skills_dir().join(dir_path)
    }

    /// Like `skill_source_dir`, but rejects `dir_path` values (e.g. from a
    /// tampered DB row) that would escape the skills root when joined.
    pub fn checked_skill_source_dir(&self, dir_path: &str) -> AppResult<PathBuf> {
        validate::ensure_safe_relative(dir_path)?;
        Ok(self.skills_dir().join(dir_path))
    }

    /// Ensure the directory skeleton exists.
    pub fn ensure_layout(&self) -> std::io::Result<()> {
        std::fs::create_dir_all(self.net_dir())?;
        std::fs::create_dir_all(self.local_dir())?;
        std::fs::create_dir_all(self.git_cache_dir())?;
        std::fs::create_dir_all(self.logs_dir())?;
        std::fs::create_dir_all(self.trash_dir())?;
        self.ensure_gitignore()?;
        Ok(())
    }

    fn ensure_gitignore(&self) -> io::Result<()> {
        match OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(self.root.join(".gitignore"))
        {
            Ok(mut file) => file.write_all(Self::GITIGNORE_CONTENT),
            Err(error) if error.kind() == io::ErrorKind::AlreadyExists => Ok(()),
            Err(error) => Err(error),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ensure_layout_creates_storage_gitignore() {
        let temp = tempfile::tempdir().unwrap();
        let paths = Paths::with_root(temp.path().join("storage"));

        paths.ensure_layout().unwrap();

        assert_eq!(
            std::fs::read_to_string(paths.root.join(".gitignore")).unwrap(),
            "git-cache/\nlogs/\n"
        );
    }

    #[test]
    fn ensure_layout_preserves_existing_storage_gitignore() {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path().join("storage");
        std::fs::create_dir_all(&root).unwrap();
        let gitignore = root.join(".gitignore");
        std::fs::write(&gitignore, "custom\n").unwrap();
        let paths = Paths::with_root(root);

        paths.ensure_layout().unwrap();

        assert_eq!(std::fs::read_to_string(gitignore).unwrap(), "custom\n");
    }
}
