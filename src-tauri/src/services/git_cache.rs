use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock, RwLock};
use std::time::{Duration, Instant};

use git2::{
    Cred, ErrorClass, ErrorCode, FetchOptions, ObjectType, Oid, RemoteCallbacks, Repository,
};

use crate::models::GitCacheInfo;
use crate::paths::Paths;
use crate::services::{github, scanner};
use crate::validate;

#[derive(Debug, thiserror::Error)]
pub enum GitCacheError {
    #[error("Git cache operation cancelled")]
    Cancelled,
    #[error("GitHub authentication failed")]
    Authentication,
    #[error("Git cache is corrupt")]
    Corrupt,
    #[error("Git transport failed")]
    Transport,
    #[error("requested commit or skill path is unavailable")]
    NotFound,
    #[error("Git export failed")]
    Export,
    #[error("Git cache I/O failed: {0}")]
    Io(#[from] std::io::Error),
}

#[derive(Clone)]
pub struct CachedRepository {
    pub cache_path: PathBuf,
    pub commit: github::Commit,
}

#[derive(Clone, Copy, Debug)]
pub struct GitFetchProgress {
    pub received_bytes: u64,
    pub received_objects: usize,
    pub total_objects: usize,
}

pub type ProgressReporter<'a> = dyn Fn(GitFetchProgress) + Send + Sync + 'a;

#[derive(Debug)]
pub struct ExportedSkill {
    pub source_path: String,
    pub tree_sha: String,
}

static REPOSITORY_LOCKS: OnceLock<Mutex<HashMap<PathBuf, Arc<Mutex<()>>>>> = OnceLock::new();
static CACHE_MAINTENANCE: OnceLock<RwLock<()>> = OnceLock::new();

pub fn system_git_available() -> bool {
    std::process::Command::new("git")
        .arg("--version")
        .output()
        .is_ok_and(|output| output.status.success())
}

pub fn cache_info(paths: &Paths) -> Result<GitCacheInfo, GitCacheError> {
    let _maintenance = maintenance_lock()
        .read()
        .map_err(|_| GitCacheError::Corrupt)?;
    let root = paths.git_cache_dir();
    if !root.exists() {
        return Ok(GitCacheInfo::default());
    }
    let mut info = GitCacheInfo::default();
    for owner in std::fs::read_dir(&root)? {
        let owner = owner?;
        if !owner.file_type()?.is_dir() {
            continue;
        }
        for repository in std::fs::read_dir(owner.path())? {
            let repository = repository?;
            if repository.file_type()?.is_dir()
                && repository.file_name().to_string_lossy().ends_with(".git")
            {
                info.repository_count += 1;
            }
        }
    }
    info.total_bytes = directory_size(&root)?;
    Ok(info)
}

pub fn clear_all(paths: &Paths) -> Result<(), GitCacheError> {
    let _maintenance = maintenance_lock()
        .write()
        .map_err(|_| GitCacheError::Corrupt)?;
    let root = paths.git_cache_dir();
    if root.exists() {
        let metadata = std::fs::symlink_metadata(&root)?;
        if metadata.file_type().is_symlink() || !metadata.is_dir() {
            return Err(GitCacheError::Corrupt);
        }
        std::fs::remove_dir_all(&root)?;
    }
    std::fs::create_dir_all(root)?;
    Ok(())
}

pub fn fetch_repository(
    paths: &Paths,
    owner: &str,
    repo_name: &str,
    commit: &github::Commit,
    token: Option<&str>,
    cancellation: Option<&Arc<AtomicBool>>,
    progress: Option<&ProgressReporter<'_>>,
) -> Result<CachedRepository, GitCacheError> {
    let _maintenance = maintenance_lock()
        .read()
        .map_err(|_| GitCacheError::Corrupt)?;
    validate::validate_segment(owner).map_err(|_| GitCacheError::NotFound)?;
    validate::validate_segment(repo_name).map_err(|_| GitCacheError::NotFound)?;
    let url = format!("https://github.com/{owner}/{repo_name}.git");
    fetch_repository_from_url(
        paths,
        owner,
        repo_name,
        commit,
        token,
        cancellation,
        progress,
        &url,
        true,
    )
}

fn fetch_repository_from_url(
    paths: &Paths,
    owner: &str,
    repo_name: &str,
    commit: &github::Commit,
    token: Option<&str>,
    cancellation: Option<&Arc<AtomicBool>>,
    progress: Option<&ProgressReporter<'_>>,
    url: &str,
    allow_system_git: bool,
) -> Result<CachedRepository, GitCacheError> {
    let cache_path = paths
        .git_cache_repo(owner, repo_name)
        .map_err(|_| GitCacheError::NotFound)?;
    ensure_cache_parent(paths, owner)?;
    let lock = repository_lock(&cache_path)?;
    let _guard = lock.lock().map_err(|_| GitCacheError::Corrupt)?;
    check_cancelled(cancellation)?;

    let had_cache = cache_path.exists();
    let first = if had_cache {
        match cached_commit_available(&cache_path, &commit.sha) {
            Ok(true) => {
                return Ok(CachedRepository {
                    cache_path,
                    commit: commit.clone(),
                });
            }
            Ok(false) => fetch_once(
                &cache_path,
                url,
                &commit.sha,
                token,
                cancellation,
                progress,
                allow_system_git,
            ),
            Err(GitCacheError::Corrupt) => {
                remove_cache_path(&cache_path)?;
                fetch_once(
                    &cache_path,
                    url,
                    &commit.sha,
                    token,
                    cancellation,
                    progress,
                    allow_system_git,
                )
            }
            Err(error) => return Err(error),
        }
    } else {
        fetch_once(
            &cache_path,
            url,
            &commit.sha,
            token,
            cancellation,
            progress,
            allow_system_git,
        )
    };
    match first {
        Ok(()) => {}
        Err(GitCacheError::Corrupt) if had_cache => {
            remove_cache_path(&cache_path)?;
            fetch_once(
                &cache_path,
                url,
                &commit.sha,
                token,
                cancellation,
                progress,
                allow_system_git,
            )?;
        }
        Err(error) => return Err(error),
    }
    Ok(CachedRepository {
        cache_path,
        commit: commit.clone(),
    })
}

fn cached_commit_available(cache_path: &Path, commit_sha: &str) -> Result<bool, GitCacheError> {
    let repository = Repository::open_bare(cache_path).map_err(|_| GitCacheError::Corrupt)?;
    let oid = Oid::from_str(commit_sha).map_err(|_| GitCacheError::NotFound)?;
    let available = match repository.find_commit(oid) {
        Ok(_) => Ok(true),
        Err(error) if error.code() == ErrorCode::NotFound => Ok(false),
        Err(error) => Err(classify_git_error(error)),
    };
    available
}

pub fn export_skill(
    cached: &CachedRepository,
    skill_id: &str,
    source_path: Option<&str>,
    destination: &Path,
    cancellation: Option<&Arc<AtomicBool>>,
) -> Result<ExportedSkill, GitCacheError> {
    let _maintenance = maintenance_lock()
        .read()
        .map_err(|_| GitCacheError::Corrupt)?;
    let lock = repository_lock(&cached.cache_path)?;
    let _guard = lock.lock().map_err(|_| GitCacheError::Corrupt)?;
    check_cancelled(cancellation)?;
    let repository = Repository::open_bare(&cached.cache_path).map_err(classify_git_error)?;
    let oid = Oid::from_str(&cached.commit.sha).map_err(|_| GitCacheError::NotFound)?;
    let commit = repository.find_commit(oid).map_err(classify_git_error)?;
    let root = commit.tree().map_err(classify_git_error)?;
    let (path, tree) = match source_path {
        Some(path) => {
            validate::ensure_safe_relative(path).map_err(|_| GitCacheError::NotFound)?;
            let tree = tree_at_path(&repository, &root, path)?;
            ensure_skill_tree(&repository, &tree)?;
            (path.to_string(), tree)
        }
        None => find_skill_tree(&repository, &root, skill_id)?,
    };
    if destination.exists() {
        std::fs::remove_dir_all(destination)?;
    }
    std::fs::create_dir_all(destination)?;
    if let Err(error) = export_tree(&repository, &tree, destination, cancellation) {
        let _ = std::fs::remove_dir_all(destination);
        return Err(error);
    }
    Ok(ExportedSkill {
        source_path: path,
        tree_sha: tree.id().to_string(),
    })
}

fn fetch_once(
    cache_path: &Path,
    url: &str,
    commit_sha: &str,
    token: Option<&str>,
    cancellation: Option<&Arc<AtomicBool>>,
    progress: Option<&ProgressReporter<'_>>,
    allow_system_git: bool,
) -> Result<(), GitCacheError> {
    if progress.is_none()
        && allow_system_git
        && token.is_none()
        && cancellation.is_none()
        && system_git_available()
        && system_git_fetch(cache_path, url, commit_sha, cancellation).is_ok()
    {
        return Ok(());
    }
    libgit2_fetch(cache_path, url, commit_sha, token, cancellation, progress)
}

fn system_git_fetch(
    cache_path: &Path,
    url: &str,
    commit_sha: &str,
    cancellation: Option<&Arc<AtomicBool>>,
) -> Result<(), GitCacheError> {
    check_cancelled(cancellation)?;
    if cache_path.exists() {
        Repository::open_bare(cache_path).map_err(|_| GitCacheError::Corrupt)?;
    } else {
        let parent = cache_path.parent().ok_or(GitCacheError::Corrupt)?;
        std::fs::create_dir_all(parent)?;
        run_git(&["init", "--bare", cache_path.to_string_lossy().as_ref()])?;
    }
    run_git(&[
        "--git-dir",
        cache_path.to_string_lossy().as_ref(),
        "fetch",
        "--depth=1",
        url,
        "+HEAD:refs/longan/HEAD",
    ])?;
    check_cancelled(cancellation)?;
    let repository = Repository::open_bare(cache_path).map_err(|_| GitCacheError::Corrupt)?;
    let oid = Oid::from_str(commit_sha).map_err(|_| GitCacheError::NotFound)?;
    if repository.find_commit(oid).is_err() {
        run_git(&[
            "--git-dir",
            cache_path.to_string_lossy().as_ref(),
            "fetch",
            "--depth=1",
            url,
            &format!("+{commit_sha}:refs/longan/target"),
        ])?;
    }
    repository
        .find_commit(oid)
        .map_err(|_| GitCacheError::NotFound)?;
    Ok(())
}

fn run_git(args: &[&str]) -> Result<(), GitCacheError> {
    let output = std::process::Command::new("git")
        .arg("-c")
        .arg("credential.helper=")
        .args(args)
        .env("GIT_TERMINAL_PROMPT", "0")
        .output()
        .map_err(|_| GitCacheError::Transport)?;
    if output.status.success() {
        Ok(())
    } else {
        Err(GitCacheError::Transport)
    }
}

fn libgit2_fetch(
    cache_path: &Path,
    url: &str,
    commit_sha: &str,
    token: Option<&str>,
    cancellation: Option<&Arc<AtomicBool>>,
    progress: Option<&ProgressReporter<'_>>,
) -> Result<(), GitCacheError> {
    let repository = open_or_init(cache_path)?;
    let cancel = cancellation.cloned();
    let secret = token.filter(|value| !value.is_empty()).map(str::to_owned);
    let mut callbacks = RemoteCallbacks::new();
    callbacks.credentials(move |_url, username, _| {
        secret.as_deref().map_or_else(Cred::default, |value| {
            Cred::userpass_plaintext(username.unwrap_or("x-access-token"), value)
        })
    });
    let mut throttle = ProgressThrottle::default();
    callbacks.transfer_progress(move |stats| {
        let update = GitFetchProgress {
            received_bytes: stats.received_bytes() as u64,
            received_objects: stats.received_objects(),
            total_objects: stats.total_objects(),
        };
        if throttle.should_emit(update) {
            if let Some(reporter) = progress {
                reporter(update);
            }
        }
        !cancel
            .as_ref()
            .is_some_and(|token| token.load(Ordering::Acquire))
    });
    let mut options = FetchOptions::new();
    options.remote_callbacks(callbacks);
    if url.starts_with("https://") || url.starts_with("http://") {
        options.depth(1);
    }
    let mut remote = repository
        .remote_anonymous(url)
        .map_err(classify_git_error)?;
    let head_refspec = "+HEAD:refs/longan/HEAD";
    if let Err(error) = remote.fetch(&[head_refspec], Some(&mut options), None) {
        if cancellation.is_some_and(|token| token.load(Ordering::Acquire)) {
            return Err(GitCacheError::Cancelled);
        }
        return Err(classify_git_error(error));
    }
    check_cancelled(cancellation)?;
    let oid = Oid::from_str(commit_sha).map_err(|_| GitCacheError::NotFound)?;
    if repository.find_commit(oid).is_err() {
        let mut callbacks = RemoteCallbacks::new();
        let secret = token.filter(|value| !value.is_empty()).map(str::to_owned);
        callbacks.credentials(move |_url, username, _| {
            secret.as_deref().map_or_else(Cred::default, |value| {
                Cred::userpass_plaintext(username.unwrap_or("x-access-token"), value)
            })
        });
        let cancel = cancellation.cloned();
        let mut throttle = ProgressThrottle::default();
        callbacks.transfer_progress(move |stats| {
            let update = GitFetchProgress {
                received_bytes: stats.received_bytes() as u64,
                received_objects: stats.received_objects(),
                total_objects: stats.total_objects(),
            };
            if throttle.should_emit(update) {
                if let Some(reporter) = progress {
                    reporter(update);
                }
            }
            !cancel
                .as_ref()
                .is_some_and(|token| token.load(Ordering::Acquire))
        });
        let mut options = FetchOptions::new();
        options.remote_callbacks(callbacks);
        if url.starts_with("https://") || url.starts_with("http://") {
            options.depth(1);
        }
        remote
            .fetch(
                &[&format!("+{commit_sha}:refs/longan/target")],
                Some(&mut options),
                None,
            )
            .map_err(classify_git_error)?;
    }
    repository
        .find_commit(oid)
        .map_err(|_| GitCacheError::NotFound)?;
    Ok(())
}

#[derive(Default)]
struct ProgressThrottle {
    last_percent: Option<usize>,
    last_emitted_at: Option<Instant>,
}

impl ProgressThrottle {
    fn should_emit(&mut self, progress: GitFetchProgress) -> bool {
        let percent = git_object_percent(progress.received_objects, progress.total_objects);
        let now = Instant::now();
        let elapsed = self
            .last_emitted_at
            .is_some_and(|last| now.duration_since(last) >= Duration::from_millis(100));
        let complete =
            progress.total_objects > 0 && progress.received_objects >= progress.total_objects;
        let should_emit =
            self.last_emitted_at.is_none() || percent != self.last_percent || elapsed || complete;
        if should_emit {
            self.last_percent = percent;
            self.last_emitted_at = Some(now);
        }
        should_emit
    }
}

fn git_object_percent(received_objects: usize, total_objects: usize) -> Option<usize> {
    (total_objects > 0)
        .then(|| received_objects.min(total_objects).saturating_mul(100) / total_objects)
}

fn open_or_init(path: &Path) -> Result<Repository, GitCacheError> {
    if path.exists() {
        return Repository::open_bare(path).map_err(|_| GitCacheError::Corrupt);
    }
    let parent = path.parent().ok_or(GitCacheError::Corrupt)?;
    std::fs::create_dir_all(parent)?;
    Repository::init_bare(path).map_err(classify_git_error)
}

fn tree_at_path<'repo>(
    repository: &'repo Repository,
    root: &git2::Tree<'repo>,
    path: &str,
) -> Result<git2::Tree<'repo>, GitCacheError> {
    let mut tree = repository
        .find_tree(root.id())
        .map_err(classify_git_error)?;
    for component in path.split('/').filter(|part| !part.is_empty()) {
        let oid = {
            let entry = tree.get_name(component).ok_or(GitCacheError::NotFound)?;
            if entry.kind() != Some(ObjectType::Tree) {
                return Err(GitCacheError::NotFound);
            }
            entry.id()
        };
        tree = repository.find_tree(oid).map_err(classify_git_error)?;
    }
    Ok(tree)
}

fn find_skill_tree<'repo>(
    repository: &'repo Repository,
    root: &git2::Tree<'repo>,
    skill_id: &str,
) -> Result<(String, git2::Tree<'repo>), GitCacheError> {
    let mut stack = vec![(String::new(), root.id())];
    let mut frontmatter_match = None;
    let mut any_match = None;
    while let Some((path, oid)) = stack.pop() {
        let tree = repository.find_tree(oid).map_err(classify_git_error)?;
        if let Some(skill_md) = tree.get_name("SKILL.md") {
            if skill_md.kind() == Some(ObjectType::Blob) {
                if any_match.is_none() {
                    any_match = Some((path.clone(), oid));
                }
                let directory_name = path.rsplit('/').next().unwrap_or("");
                if skill_id != "any" && directory_name == skill_id {
                    return Ok((path, repository.find_tree(oid).map_err(classify_git_error)?));
                }
                if skill_id != "any" {
                    let blob = repository
                        .find_blob(skill_md.id())
                        .map_err(classify_git_error)?;
                    if let Ok(content) = std::str::from_utf8(blob.content()) {
                        if scanner::parse_skill_md_content(content).0.as_deref() == Some(skill_id) {
                            frontmatter_match = Some((path.clone(), oid));
                        }
                    }
                }
            }
        }
        for entry in &tree {
            if entry.kind() == Some(ObjectType::Tree) {
                let name = entry.name().ok_or(GitCacheError::Export)?;
                let child = if path.is_empty() {
                    name.to_string()
                } else {
                    format!("{path}/{name}")
                };
                stack.push((child, entry.id()));
            }
        }
    }
    let selected = if skill_id == "any" {
        any_match
    } else {
        frontmatter_match.or(any_match)
    }
    .ok_or(GitCacheError::NotFound)?;
    Ok((
        selected.0,
        repository
            .find_tree(selected.1)
            .map_err(classify_git_error)?,
    ))
}

fn ensure_skill_tree(repository: &Repository, tree: &git2::Tree<'_>) -> Result<(), GitCacheError> {
    let entry = tree.get_name("SKILL.md").ok_or(GitCacheError::NotFound)?;
    if entry.kind() == Some(ObjectType::Blob) && entry.filemode() != 0o120000 {
        repository
            .find_blob(entry.id())
            .map_err(classify_git_error)?;
        Ok(())
    } else {
        Err(GitCacheError::NotFound)
    }
}

fn export_tree(
    repository: &Repository,
    tree: &git2::Tree<'_>,
    destination: &Path,
    cancellation: Option<&Arc<AtomicBool>>,
) -> Result<(), GitCacheError> {
    for entry in tree {
        check_cancelled(cancellation)?;
        let name = entry.name().ok_or(GitCacheError::Export)?;
        let target = destination.join(name);
        match entry.kind() {
            Some(ObjectType::Tree) => {
                std::fs::create_dir_all(&target)?;
                let child = repository
                    .find_tree(entry.id())
                    .map_err(classify_git_error)?;
                export_tree(repository, &child, &target, cancellation)?;
            }
            Some(ObjectType::Blob) if entry.filemode() != 0o120000 => {
                let blob = repository
                    .find_blob(entry.id())
                    .map_err(classify_git_error)?;
                std::fs::write(&target, blob.content())?;
                #[cfg(unix)]
                if entry.filemode() == 0o100755 {
                    use std::os::unix::fs::PermissionsExt;
                    std::fs::set_permissions(&target, std::fs::Permissions::from_mode(0o755))?;
                }
            }
            _ => {}
        }
    }
    Ok(())
}

fn repository_lock(path: &Path) -> Result<Arc<Mutex<()>>, GitCacheError> {
    Ok(REPOSITORY_LOCKS
        .get_or_init(|| Mutex::new(HashMap::new()))
        .lock()
        .map_err(|_| GitCacheError::Corrupt)?
        .entry(path.to_path_buf())
        .or_insert_with(|| Arc::new(Mutex::new(())))
        .clone())
}

fn maintenance_lock() -> &'static RwLock<()> {
    CACHE_MAINTENANCE.get_or_init(|| RwLock::new(()))
}

fn ensure_cache_parent(paths: &Paths, owner: &str) -> Result<(), GitCacheError> {
    let root = paths.git_cache_dir();
    if root.exists() {
        let metadata = std::fs::symlink_metadata(&root)?;
        if metadata.file_type().is_symlink() || !metadata.is_dir() {
            return Err(GitCacheError::Corrupt);
        }
    } else {
        std::fs::create_dir_all(&root)?;
    }
    let owner_dir = root.join(owner);
    if owner_dir.exists() {
        let metadata = std::fs::symlink_metadata(&owner_dir)?;
        if metadata.file_type().is_symlink() || !metadata.is_dir() {
            return Err(GitCacheError::Corrupt);
        }
    } else {
        std::fs::create_dir_all(&owner_dir)?;
    }
    Ok(())
}

fn check_cancelled(cancellation: Option<&Arc<AtomicBool>>) -> Result<(), GitCacheError> {
    if cancellation.is_some_and(|token| token.load(Ordering::Acquire)) {
        Err(GitCacheError::Cancelled)
    } else {
        Ok(())
    }
}

fn remove_cache_path(path: &Path) -> Result<(), GitCacheError> {
    let metadata = std::fs::symlink_metadata(path)?;
    if metadata.file_type().is_symlink() || metadata.is_file() {
        std::fs::remove_file(path)?;
    } else {
        std::fs::remove_dir_all(path)?;
    }
    Ok(())
}

fn directory_size(path: &Path) -> Result<u64, GitCacheError> {
    let mut total = 0u64;
    for entry in std::fs::read_dir(path)? {
        let entry = entry?;
        let metadata = std::fs::symlink_metadata(entry.path())?;
        if metadata.file_type().is_symlink() {
            continue;
        }
        if metadata.is_dir() {
            total = total.saturating_add(directory_size(&entry.path())?);
        } else {
            total = total.saturating_add(metadata.len());
        }
    }
    Ok(total)
}

fn classify_git_error(error: git2::Error) -> GitCacheError {
    if error.code() == ErrorCode::Auth
        || error.class() == ErrorClass::Http && error.message().contains("401")
    {
        GitCacheError::Authentication
    } else if matches!(
        error.class(),
        ErrorClass::Repository | ErrorClass::Reference | ErrorClass::Index
    ) {
        GitCacheError::Corrupt
    } else if matches!(error.code(), ErrorCode::NotFound | ErrorCode::InvalidSpec) {
        GitCacheError::NotFound
    } else {
        GitCacheError::Transport
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn commit_files(
        repository: &Repository,
        files: &[(&str, &str)],
        message: &str,
    ) -> github::Commit {
        let workdir = repository.workdir().unwrap();
        for (path, content) in files {
            let path = workdir.join(path);
            std::fs::create_dir_all(path.parent().unwrap()).unwrap();
            std::fs::write(path, content).unwrap();
        }
        let mut index = repository.index().unwrap();
        index
            .add_all(["*"].iter(), git2::IndexAddOption::DEFAULT, None)
            .unwrap();
        index.write().unwrap();
        let tree_oid = index.write_tree().unwrap();
        let tree = repository.find_tree(tree_oid).unwrap();
        let signature = git2::Signature::now("Longan", "test@example.com").unwrap();
        let parent = repository
            .head()
            .ok()
            .and_then(|head| head.peel_to_commit().ok());
        let parents = parent.iter().collect::<Vec<_>>();
        let oid = repository
            .commit(
                Some("HEAD"),
                &signature,
                &signature,
                message,
                &tree,
                &parents,
            )
            .unwrap();
        github::Commit {
            sha: oid.to_string(),
            tree_sha: tree_oid.to_string(),
        }
    }

    fn setup_remote() -> (tempfile::TempDir, Repository, github::Commit) {
        let temp = tempfile::tempdir().unwrap();
        let repository = Repository::init(temp.path().join("remote")).unwrap();
        let commit = commit_files(
            &repository,
            &[
                ("skills/one/SKILL.md", "---\nname: one\n---\n"),
                ("skills/one/value.txt", "one-v1"),
                ("skills/two/SKILL.md", "---\nname: two\n---\n"),
                ("skills/two/value.txt", "two-v1"),
            ],
            "initial",
        );
        (temp, repository, commit)
    }

    fn fetch_local(
        paths: &Paths,
        remote: &Repository,
        commit: &github::Commit,
    ) -> Result<CachedRepository, GitCacheError> {
        fetch_repository_from_url(
            paths,
            "owner",
            "repo",
            commit,
            None,
            None,
            None,
            remote.workdir().unwrap().to_string_lossy().as_ref(),
            false,
        )
    }

    #[test]
    fn cache_path_is_scoped_to_owner_and_repo() {
        let paths = Paths::with_root(PathBuf::from("/tmp/longan-test"));
        assert!(paths
            .git_cache_repo("owner", "repo")
            .unwrap()
            .ends_with("owner/repo.git"));
        assert!(paths.git_cache_repo("../owner", "repo").is_err());
    }

    #[test]
    fn authentication_errors_do_not_include_the_secret() {
        let error = classify_git_error(git2::Error::new(
            ErrorCode::Auth,
            ErrorClass::Http,
            "secret-value",
        ));
        assert!(!error.to_string().contains("secret-value"));
    }

    #[test]
    fn empty_cache_fetches_and_exports_only_requested_skill() {
        let (_remote_temp, remote, commit) = setup_remote();
        let console = tempfile::tempdir().unwrap();
        let paths = Paths::with_root(console.path().to_path_buf());
        let cached = fetch_local(&paths, &remote, &commit).unwrap();
        let output = console.path().join("staging");
        let exported = export_skill(&cached, "one", Some("skills/one"), &output, None).unwrap();

        assert_eq!(exported.source_path, "skills/one");
        assert_eq!(
            std::fs::read_to_string(output.join("value.txt")).unwrap(),
            "one-v1"
        );
        assert!(!output.join("../two").exists());
    }

    #[test]
    fn libgit2_fetch_reports_object_progress() {
        let (_remote_temp, remote, commit) = setup_remote();
        let console = tempfile::tempdir().unwrap();
        let paths = Paths::with_root(console.path().to_path_buf());
        let updates = Mutex::new(Vec::new());
        let reporter = |update| updates.lock().unwrap().push(update);

        fetch_repository_from_url(
            &paths,
            "owner",
            "repo",
            &commit,
            None,
            None,
            Some(&reporter),
            remote.workdir().unwrap().to_string_lossy().as_ref(),
            true,
        )
        .unwrap();

        let updates = updates.lock().unwrap();
        assert!(!updates.is_empty());
        assert!(updates.iter().any(|update| update.received_bytes > 0));
        assert!(updates.iter().any(|update| {
            update.total_objects > 0 && update.received_objects == update.total_objects
        }));
    }

    #[test]
    fn object_percentage_handles_unknown_and_complete_totals() {
        assert_eq!(git_object_percent(0, 0), None);
        assert_eq!(git_object_percent(1, 4), Some(25));
        assert_eq!(git_object_percent(5, 4), Some(100));
    }

    #[test]
    fn later_fetch_reuses_cache_and_exports_new_commit() {
        let (_remote_temp, remote, first) = setup_remote();
        let console = tempfile::tempdir().unwrap();
        let paths = Paths::with_root(console.path().to_path_buf());
        let first_cached = fetch_local(&paths, &remote, &first).unwrap();
        let cache_path = first_cached.cache_path.clone();
        let second = commit_files(&remote, &[("skills/one/value.txt", "one-v2")], "update");
        let second_cached = fetch_local(&paths, &remote, &second).unwrap();
        let output = console.path().join("staging");
        export_skill(&second_cached, "one", Some("skills/one"), &output, None).unwrap();

        assert_eq!(second_cached.cache_path, cache_path);
        assert_eq!(
            std::fs::read_to_string(output.join("value.txt")).unwrap(),
            "one-v2"
        );
    }

    #[test]
    fn cached_commit_skips_remote_fetch() {
        let (remote_temp, remote, commit) = setup_remote();
        let console = tempfile::tempdir().unwrap();
        let paths = Paths::with_root(console.path().to_path_buf());
        fetch_local(&paths, &remote, &commit).unwrap();
        drop(remote);
        drop(remote_temp);

        let cached = fetch_repository_from_url(
            &paths,
            "owner",
            "repo",
            &commit,
            None,
            None,
            None,
            "/remote/no-longer-available",
            false,
        )
        .unwrap();

        assert_eq!(cached.commit.sha, commit.sha);
    }

    #[test]
    fn corrupt_cache_is_recreated_without_touching_sibling() {
        let (_remote_temp, remote, commit) = setup_remote();
        let console = tempfile::tempdir().unwrap();
        let paths = Paths::with_root(console.path().to_path_buf());
        let cache = paths.git_cache_repo("owner", "repo").unwrap();
        std::fs::create_dir_all(cache.parent().unwrap()).unwrap();
        std::fs::write(&cache, "broken").unwrap();
        let sibling = paths.git_cache_repo("owner", "sibling").unwrap();
        std::fs::create_dir_all(&sibling).unwrap();
        std::fs::write(sibling.join("keep"), "yes").unwrap();

        fetch_local(&paths, &remote, &commit).unwrap();

        assert!(Repository::open_bare(cache).is_ok());
        assert_eq!(
            std::fs::read_to_string(sibling.join("keep")).unwrap(),
            "yes"
        );
    }

    #[test]
    fn cancelled_export_leaves_existing_skill_untouched() {
        let (_remote_temp, remote, commit) = setup_remote();
        let console = tempfile::tempdir().unwrap();
        let paths = Paths::with_root(console.path().to_path_buf());
        let cached = fetch_local(&paths, &remote, &commit).unwrap();
        let installed = console.path().join("installed");
        std::fs::create_dir_all(&installed).unwrap();
        std::fs::write(installed.join("value.txt"), "old").unwrap();
        let cancellation = Arc::new(AtomicBool::new(true));

        let error = export_skill(
            &cached,
            "one",
            Some("skills/one"),
            &console.path().join("staging"),
            Some(&cancellation),
        )
        .unwrap_err();

        assert!(matches!(error, GitCacheError::Cancelled));
        assert_eq!(
            std::fs::read_to_string(installed.join("value.txt")).unwrap(),
            "old"
        );
    }

    #[test]
    fn one_cached_snapshot_exports_two_skills() {
        let (_remote_temp, remote, commit) = setup_remote();
        let console = tempfile::tempdir().unwrap();
        let paths = Paths::with_root(console.path().to_path_buf());
        let cached = fetch_local(&paths, &remote, &commit).unwrap();

        export_skill(
            &cached,
            "one",
            Some("skills/one"),
            &console.path().join("one"),
            None,
        )
        .unwrap();
        export_skill(
            &cached,
            "two",
            Some("skills/two"),
            &console.path().join("two"),
            None,
        )
        .unwrap();

        assert_eq!(
            std::fs::read_to_string(console.path().join("one/value.txt")).unwrap(),
            "one-v1"
        );
        assert_eq!(
            std::fs::read_to_string(console.path().join("two/value.txt")).unwrap(),
            "two-v1"
        );
    }

    #[test]
    fn concurrent_fetches_share_one_valid_cache() {
        let (_remote_temp, remote, commit) = setup_remote();
        let console = tempfile::tempdir().unwrap();
        let paths = Paths::with_root(console.path().to_path_buf());
        let remote_url = remote.workdir().unwrap().to_string_lossy().to_string();
        let first_paths = paths.clone();
        let first_commit = commit.clone();
        let first_url = remote_url.clone();
        let first = std::thread::spawn(move || {
            fetch_repository_from_url(
                &first_paths,
                "owner",
                "repo",
                &first_commit,
                None,
                None,
                None,
                &first_url,
                false,
            )
        });
        let second_paths = paths.clone();
        let second_commit = commit.clone();
        let second = std::thread::spawn(move || {
            fetch_repository_from_url(
                &second_paths,
                "owner",
                "repo",
                &second_commit,
                None,
                None,
                None,
                &remote_url,
                false,
            )
        });

        first.join().unwrap().unwrap();
        second.join().unwrap().unwrap();
        assert!(Repository::open_bare(paths.git_cache_repo("owner", "repo").unwrap()).is_ok());
    }

    #[test]
    fn clear_cache_preserves_installed_skills() {
        let console = tempfile::tempdir().unwrap();
        let paths = Paths::with_root(console.path().to_path_buf());
        let cache = paths.git_cache_repo("owner", "repo").unwrap();
        std::fs::create_dir_all(&cache).unwrap();
        std::fs::write(cache.join("data"), "cache").unwrap();
        let installed = paths.net_dir().join("owner/repo/skill");
        std::fs::create_dir_all(&installed).unwrap();
        std::fs::write(installed.join("SKILL.md"), "installed").unwrap();

        clear_all(&paths).unwrap();

        assert_eq!(
            std::fs::read_to_string(installed.join("SKILL.md")).unwrap(),
            "installed"
        );
        assert_eq!(cache_info(&paths).unwrap().repository_count, 0);
    }

    #[test]
    fn cache_info_counts_archive_bytes() {
        let console = tempfile::tempdir().unwrap();
        let paths = Paths::with_root(console.path().join("console"));
        let repository = paths.git_cache_repo("owner", "repo").unwrap();
        std::fs::create_dir_all(&repository).unwrap();
        std::fs::write(repository.join("objects"), "git").unwrap();
        let archive = paths
            .git_cache_archive("owner", "repo", "0123456789abcdef")
            .unwrap();
        std::fs::create_dir_all(archive.parent().unwrap()).unwrap();
        std::fs::write(&archive, "archive").unwrap();

        let info = cache_info(&paths).unwrap();

        assert_eq!(info.repository_count, 1);
        assert_eq!(info.total_bytes, 10);
    }
}
