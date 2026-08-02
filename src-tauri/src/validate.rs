//! Shared input/path validation for anything that ends up on the filesystem:
//! frontmatter-derived names, frontend-supplied identifiers, DB-stored
//! relative paths, and copies out of untrusted trees (downloads, imports).

use std::path::{Component, Path, PathBuf};

use crate::error::{AppError, AppResult};
use crate::services::platform_link;

/// Windows reserved device names (case-insensitive, extension ignored).
const RESERVED: &[&str] = &[
    "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8",
    "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
];

const MAX_NAME_LEN: usize = 100;

fn is_reserved(s: &str) -> bool {
    let stem = s.split('.').next().unwrap_or("");
    RESERVED.iter().any(|r| stem.eq_ignore_ascii_case(r))
}

/// Make an arbitrary (e.g. frontmatter-derived) string safe to use as a single
/// link/dir name. Returns `None` when nothing safe remains, so callers can fall
/// back to an already-trusted name such as the on-disk directory name.
pub fn sanitize_link_name(raw: &str) -> Option<String> {
    let cleaned: String = raw
        .trim()
        .chars()
        .filter(|c| !c.is_control())
        .map(|c| {
            if matches!(c, ':' | '<' | '>' | '"' | '|' | '?' | '*') {
                '-'
            } else {
                c
            }
        })
        .collect();
    // Split on path separators and drop dot-only segments so `../../x` can
    // never survive as a traversal, then rebuild a single flat name.
    let parts: Vec<&str> = cleaned
        .split(['/', '\\'])
        .map(|seg| seg.trim().trim_start_matches('.').trim_end_matches([' ', '.']))
        .filter(|seg| !seg.is_empty())
        .collect();
    let mut s = parts.join("-");
    if s.chars().count() > MAX_NAME_LEN {
        s = s.chars().take(MAX_NAME_LEN).collect();
    }
    if s.is_empty() || is_reserved(&s) {
        return None;
    }
    Some(s)
}

/// Strict allowlist for owner/repo/skill identifiers coming from the frontend.
pub fn validate_segment(s: &str) -> AppResult<()> {
    let ok = !s.is_empty()
        && s.len() <= MAX_NAME_LEN
        && !s.starts_with('.')
        && s.chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.'))
        && !is_reserved(s);
    if ok {
        Ok(())
    } else {
        Err(AppError::InvalidInput(format!("invalid identifier: {s}")))
    }
}

/// Reject relative paths that could escape their base when joined:
/// absolute paths, drive prefixes, and `..` components.
pub fn ensure_safe_relative(rel: &str) -> AppResult<()> {
    let path = Path::new(rel);
    for comp in path.components() {
        match comp {
            Component::Normal(_) | Component::CurDir => {}
            _ => {
                return Err(AppError::InvalidInput(format!(
                    "unsafe relative path: {rel}"
                )))
            }
        }
    }
    Ok(())
}

const MAX_AGENT_DIR_SEGMENTS: usize = 8;
const MAX_AGENT_DIR_LEN: usize = 200;

/// Normalize and validate an agent link dir (project-relative), returning the
/// canonical form: '/'-separated, no "./" segments, no trailing slash, e.g.
/// ".claude/skills". Unlike `validate_segment`, leading dots are allowed
/// (dot-dirs are the whole point), but `.agents/skills` is reserved for the
/// default sync and rejected so a user-defined agent can never co-manage it.
pub fn normalize_agent_dir(raw: &str) -> AppResult<String> {
    let s = raw.trim().replace('\\', "/");
    if s.is_empty() {
        return Err(AppError::InvalidInput("agent dir is empty".into()));
    }
    ensure_safe_relative(&s)?;
    let mut segments: Vec<&str> = vec![];
    for seg in s.split('/') {
        if seg.is_empty() || seg == "." {
            continue;
        }
        let ok = seg.len() <= MAX_NAME_LEN
            && seg.chars().any(|c| c != '.')
            && seg
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.'))
            && !is_reserved(seg);
        if !ok {
            return Err(AppError::InvalidInput(format!(
                "invalid agent dir segment: {seg}"
            )));
        }
        segments.push(seg);
    }
    if segments.is_empty() || segments.len() > MAX_AGENT_DIR_SEGMENTS {
        return Err(AppError::InvalidInput(format!("invalid agent dir: {raw}")));
    }
    let dir = segments.join("/");
    if dir.len() > MAX_AGENT_DIR_LEN {
        return Err(AppError::InvalidInput(format!("agent dir too long: {raw}")));
    }
    if dir == ".agents/skills" || dir.starts_with(".agents/skills/") {
        return Err(AppError::InvalidInput(
            "reserved: .agents/skills is managed by the default sync".into(),
        ));
    }
    Ok(dir)
}

/// Canonicalized containment check: `candidate` (which must exist) has to live
/// under `base`. Returns the canonical candidate path for the caller to use.
pub fn ensure_contained(base: &Path, candidate: &Path) -> AppResult<PathBuf> {
    let base = platform_link::normalize(base.canonicalize()?);
    let cand = platform_link::normalize(candidate.canonicalize()?);
    if cand.starts_with(&base) && cand != base {
        Ok(cand)
    } else {
        Err(AppError::InvalidInput(format!(
            "path escapes managed directory: {}",
            candidate.display()
        )))
    }
}

const MAX_COPY_DEPTH: usize = 32;

/// Recursive copy for untrusted trees: skips symlinks (never follows them),
/// skips `skip_names` entries at any level, and refuses absurdly deep nesting.
pub fn copy_dir_safe(src: &Path, dst: &Path, skip_names: &[&str], depth: usize) -> AppResult<()> {
    if depth > MAX_COPY_DEPTH {
        return Err(AppError::InvalidInput(format!(
            "directory tree deeper than {MAX_COPY_DEPTH} levels: {}",
            src.display()
        )));
    }
    std::fs::create_dir_all(dst)?;
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let name = entry.file_name();
        if skip_names.iter().any(|s| name.to_string_lossy() == *s) {
            continue;
        }
        let from = entry.path();
        let file_type = std::fs::symlink_metadata(&from)?.file_type();
        if file_type.is_symlink() {
            continue; // never follow links out of an untrusted tree
        }
        let to = dst.join(name);
        if file_type.is_dir() {
            copy_dir_safe(&from, &to, skip_names, depth + 1)?;
        } else {
            std::fs::copy(&from, &to)?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sanitize_strips_traversal_and_separators() {
        assert_eq!(sanitize_link_name("../../.ssh/foo"), Some("ssh-foo".into()));
        assert_eq!(sanitize_link_name("a/b\\c"), Some("a-b-c".into()));
        assert_eq!(sanitize_link_name("  my-skill  "), Some("my-skill".into()));
        assert_eq!(sanitize_link_name("name."), Some("name".into()));
    }

    #[test]
    fn sanitize_rejects_unusable_names() {
        assert_eq!(sanitize_link_name(""), None);
        assert_eq!(sanitize_link_name(".."), None);
        assert_eq!(sanitize_link_name("..."), None);
        assert_eq!(sanitize_link_name("CON"), None);
        assert_eq!(sanitize_link_name("con.txt"), None);
        assert_eq!(sanitize_link_name("\u{7}\u{8}"), None);
    }

    #[test]
    fn sanitize_strips_control_chars_and_truncates() {
        assert_eq!(sanitize_link_name("a\u{0}b\nc"), Some("abc".into()));
        let long = "x".repeat(300);
        assert_eq!(sanitize_link_name(&long).unwrap().len(), MAX_NAME_LEN);
    }

    #[test]
    fn segment_allowlist() {
        assert!(validate_segment("ok-name_1.2").is_ok());
        assert!(validate_segment("").is_err());
        assert!(validate_segment("..").is_err());
        assert!(validate_segment(".hidden").is_err());
        assert!(validate_segment("a/b").is_err());
        assert!(validate_segment("a\\b").is_err());
        assert!(validate_segment("a b").is_err());
        assert!(validate_segment("nul").is_err());
        assert!(validate_segment(&"x".repeat(101)).is_err());
    }

    #[test]
    fn safe_relative_rejects_escapes() {
        assert!(ensure_safe_relative("net/owner/repo/skill").is_ok());
        assert!(ensure_safe_relative("local/name").is_ok());
        assert!(ensure_safe_relative("../outside").is_err());
        assert!(ensure_safe_relative("a/../../b").is_err());
        assert!(ensure_safe_relative("/etc/passwd").is_err());
    }

    #[test]
    fn agent_dir_normalizes_accepted_forms() {
        assert_eq!(normalize_agent_dir(".claude/skills").unwrap(), ".claude/skills");
        assert_eq!(normalize_agent_dir("./x/y/").unwrap(), "x/y");
        assert_eq!(normalize_agent_dir("  .cursor\\skills  ").unwrap(), ".cursor/skills");
        assert_eq!(normalize_agent_dir("a//b").unwrap(), "a/b");
    }

    #[test]
    fn agent_dir_rejects_unsafe_or_reserved() {
        assert!(normalize_agent_dir("").is_err());
        assert!(normalize_agent_dir("   ").is_err());
        assert!(normalize_agent_dir(".").is_err());
        assert!(normalize_agent_dir("/abs/path").is_err());
        assert!(normalize_agent_dir("..").is_err());
        assert!(normalize_agent_dir("a/../b").is_err());
        assert!(normalize_agent_dir("C:\\x").is_err()); // ':' fails the charset check
        assert!(normalize_agent_dir("a/.../b").is_err()); // dot-only segment
        assert!(normalize_agent_dir("con/x").is_err()); // windows reserved name
        assert!(normalize_agent_dir("a b/c").is_err()); // whitespace inside segment
        assert!(normalize_agent_dir(".agents/skills").is_err()); // reserved default
        assert!(normalize_agent_dir("./.agents/skills/").is_err()); // reserved after normalize
        assert!(normalize_agent_dir(".agents/skills/sub").is_err());
        assert!(normalize_agent_dir("a/b/c/d/e/f/g/h/i").is_err()); // too deep
        let long = format!("{}/x", "y".repeat(99));
        assert!(normalize_agent_dir(&long).is_ok());
        let too_long = format!("{}/{}/{}", "y".repeat(99), "z".repeat(99), "w".repeat(99));
        assert!(normalize_agent_dir(&too_long).is_err()); // total length cap
    }

    #[test]
    fn contained_accepts_inside_rejects_outside() {
        let tmp = tempfile::tempdir().unwrap();
        let base = tmp.path().join("base");
        let inside = base.join("child");
        std::fs::create_dir_all(&inside).unwrap();
        let outside = tmp.path().join("outside");
        std::fs::create_dir_all(&outside).unwrap();

        assert!(ensure_contained(&base, &inside).is_ok());
        assert!(ensure_contained(&base, &outside).is_err());
        assert!(ensure_contained(&base, &base).is_err()); // base itself is not "inside"
    }

    #[test]
    fn copy_skips_symlinks_and_vcs() {
        use crate::services::platform_link;
        let tmp = tempfile::tempdir().unwrap();
        let src = tmp.path().join("src");
        std::fs::create_dir_all(src.join("sub")).unwrap();
        std::fs::write(src.join("file.txt"), "data").unwrap();
        std::fs::write(src.join("sub/inner.txt"), "inner").unwrap();
        std::fs::create_dir_all(src.join(".git")).unwrap();
        std::fs::write(src.join(".git/HEAD"), "ref").unwrap();
        let secret = tmp.path().join("secret");
        std::fs::create_dir_all(&secret).unwrap();
        std::fs::write(secret.join("key"), "private").unwrap();
        platform_link::create_dir_link(&secret, &src.join("leak")).unwrap();

        let dst = tmp.path().join("dst");
        copy_dir_safe(&src, &dst, &[".git"], 0).unwrap();
        assert!(dst.join("file.txt").is_file());
        assert!(dst.join("sub/inner.txt").is_file());
        assert!(!dst.join(".git").exists());
        assert!(!dst.join("leak").exists()); // symlink dropped, target not copied
    }

    #[test]
    fn copy_rejects_excessive_depth() {
        let tmp = tempfile::tempdir().unwrap();
        let mut deep = tmp.path().join("src");
        for _ in 0..=MAX_COPY_DEPTH + 1 {
            deep = deep.join("d");
        }
        std::fs::create_dir_all(&deep).unwrap();
        let err = copy_dir_safe(&tmp.path().join("src"), &tmp.path().join("dst"), &[], 0);
        assert!(err.is_err());
    }
}
