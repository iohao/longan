//! Platform-neutral directory links: symlinks on unix, junctions on windows.
//! Junctions need no privilege or Developer Mode, but are reparse points that
//! `FileType::is_symlink()` does not recognize and whose `read_link` targets
//! come back with a verbatim `\\?\` prefix — hence the helpers below instead
//! of raw `std::fs` calls at the call sites.

use std::io;
use std::path::{Path, PathBuf};

/// Create a directory link at `link` pointing at the absolute dir `target`.
#[cfg(unix)]
pub fn create_dir_link(target: &Path, link: &Path) -> io::Result<()> {
    std::os::unix::fs::symlink(target, link)
}

#[cfg(windows)]
pub fn create_dir_link(target: &Path, link: &Path) -> io::Result<()> {
    junction::create(target, link)
}

/// True when `path` is a link this app could have created:
/// a symlink on unix; a symlink or junction on windows.
#[cfg(unix)]
pub fn is_dir_link(path: &Path) -> bool {
    std::fs::symlink_metadata(path)
        .map(|m| m.file_type().is_symlink())
        .unwrap_or(false)
}

#[cfg(windows)]
pub fn is_dir_link(path: &Path) -> bool {
    use std::os::windows::fs::MetadataExt;
    const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x400;
    std::fs::symlink_metadata(path)
        .map(|m| {
            m.file_type().is_symlink()
                || (m.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0
                    && std::fs::read_link(path).is_ok())
        })
        .unwrap_or(false)
}

/// The link's target, normalized so it can be compared with `starts_with`.
pub fn read_link_target(path: &Path) -> Option<PathBuf> {
    std::fs::read_link(path).ok().map(normalize)
}

/// Remove a link created by `create_dir_link` without touching its target.
pub fn remove_link(path: &Path) -> io::Result<()> {
    #[cfg(unix)]
    {
        std::fs::remove_file(path)
    }
    #[cfg(windows)]
    {
        // Dir symlinks and junctions are directories to the delete APIs;
        // fall back to remove_file for a stray file symlink.
        std::fs::remove_dir(path).or_else(|_| std::fs::remove_file(path))
    }
}

/// Strip windows verbatim (`\\?\`) prefixes; identity elsewhere.
pub fn normalize(p: impl Into<PathBuf>) -> PathBuf {
    let p = p.into();
    #[cfg(windows)]
    {
        dunce::simplified(&p).to_path_buf()
    }
    #[cfg(not(windows))]
    {
        p
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn link_round_trip() {
        let tmp = tempfile::tempdir().unwrap();
        let target = tmp.path().join("target");
        std::fs::create_dir_all(&target).unwrap();
        let link = tmp.path().join("link");

        create_dir_link(&target, &link).unwrap();
        assert!(is_dir_link(&link));
        assert!(!is_dir_link(&target)); // a real dir is not a link
        assert_eq!(read_link_target(&link).unwrap(), normalize(target.clone()));
        // Link resolves to the target dir.
        assert!(link.is_dir());

        remove_link(&link).unwrap();
        assert!(std::fs::symlink_metadata(&link).is_err());
        assert!(target.is_dir()); // target untouched
    }

    #[test]
    fn normalized_target_has_no_verbatim_prefix() {
        let tmp = tempfile::tempdir().unwrap();
        let target = tmp.path().join("t");
        std::fs::create_dir_all(&target).unwrap();
        let link = tmp.path().join("l");
        create_dir_link(&target, &link).unwrap();
        let read = read_link_target(&link).unwrap();
        assert!(!read.to_string_lossy().starts_with(r"\\?\"));
    }
}
