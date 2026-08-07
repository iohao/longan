use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};

use flate2::read::GzDecoder;
use rusqlite::Connection;
use tar::{Archive, EntryType};

use crate::db::repo;
use crate::error::{AppError, AppResult};
use crate::paths::Paths;
use crate::services::git_cache;
use crate::services::github;
use crate::services::scanner;
use crate::validate;

/// Outcome of the network+filesystem phase of an install.
pub struct DownloadedSkill {
    pub dir_path: String,
    pub sha: String,
    pub source_path: String,
    pub tree_sha: Option<String>,
    pub name: String,
    pub description: Option<String>,
    target_path: PathBuf,
    backup_path: Option<PathBuf>,
    had_existing_target: bool,
}

/// Downloaded and extracted repository snapshot shared by one or more skills.
pub struct DownloadedRepository {
    pub commit: github::Commit,
    source: RepositorySource,
}

enum RepositorySource {
    Git(git_cache::CachedRepository),
    Archive {
        _temp: tempfile::TempDir,
        extract_root: PathBuf,
    },
}

impl DownloadedSkill {
    pub fn commit_files(&self) -> AppResult<()> {
        if let Some(backup) = &self.backup_path {
            if backup.exists() {
                std::fs::remove_dir_all(backup)?;
            }
        }
        Ok(())
    }

    pub fn rollback_files(&self) -> AppResult<()> {
        if let Some(backup) = &self.backup_path {
            if self.target_path.exists() {
                std::fs::remove_dir_all(&self.target_path)?;
            }
            if backup.exists() {
                std::fs::rename(backup, &self.target_path)?;
            }
        } else if !self.had_existing_target && self.target_path.exists() {
            std::fs::remove_dir_all(&self.target_path)?;
        }
        Ok(())
    }
}

#[derive(Clone, Copy)]
pub enum InstallPhase {
    Checking,
    Downloading,
    RetryingDownload,
    Extracting,
    Installing,
}

#[derive(Clone, Copy)]
pub struct InstallProgress {
    pub phase: InstallPhase,
    pub progress_percent: Option<u8>,
    pub downloaded_bytes: Option<u64>,
    pub total_bytes: Option<u64>,
}

pub type ProgressReporter<'a> = dyn Fn(InstallProgress) + Send + Sync + 'a;

static ARCHIVE_LOCKS: OnceLock<Mutex<HashMap<PathBuf, Arc<tokio::sync::Mutex<()>>>>> =
    OnceLock::new();

/// Network + filesystem phase: download HEAD tarball -> extract to temp ->
/// locate skill dir -> stage next to target -> atomic swap.
/// Deliberately takes no DB connection so the future stays Send.
pub async fn download_skill(
    client: &reqwest::Client,
    paths: &Paths,
    owner: &str,
    repo_name: &str,
    skill_id: &str,
    token: Option<&str>,
    progress: Option<&ProgressReporter<'_>>,
    cancellation: Option<&Arc<AtomicBool>>,
    retain_backup: bool,
    source_path: Option<&str>,
) -> AppResult<DownloadedSkill> {
    validate::validate_segment(owner)?;
    validate::validate_segment(repo_name)?;
    validate::validate_segment(skill_id)?;
    paths.ensure_layout()?;

    let repository = download_repository(
        client,
        paths,
        owner,
        repo_name,
        token,
        progress,
        cancellation,
    )
    .await?;
    let mut downloaded = stage_skill_from_repository(
        paths,
        owner,
        repo_name,
        skill_id,
        source_path,
        &repository,
        progress,
        cancellation,
        retain_backup,
    )
    .await?;
    if downloaded.tree_sha.is_none() {
        let tree_sha = github::path_tree_sha(
            client,
            owner,
            repo_name,
            token,
            &repository.commit.tree_sha,
            &downloaded.source_path,
        )
        .await;
        match tree_sha {
            Ok(tree_sha) => downloaded.tree_sha = tree_sha,
            Err(error) => {
                downloaded.rollback_files()?;
                return Err(error);
            }
        }
    }
    if let Err(error) = ensure_not_cancelled(cancellation) {
        downloaded.rollback_files()?;
        return Err(error);
    }
    Ok(downloaded)
}

/// Download and extract one repository snapshot. Callers can stage multiple
/// skills from the returned repository without repeating the network transfer.
pub async fn download_repository(
    client: &reqwest::Client,
    paths: &Paths,
    owner: &str,
    repo_name: &str,
    token: Option<&str>,
    progress: Option<&ProgressReporter<'_>>,
    cancellation: Option<&Arc<AtomicBool>>,
) -> AppResult<DownloadedRepository> {
    report_progress(progress, InstallPhase::Checking, None, None, None);
    let commit = github::latest_commit(client, owner, repo_name, token).await?;
    ensure_not_cancelled(cancellation)?;

    report_progress(progress, InstallPhase::Downloading, None, Some(0), None);
    let cache_paths = paths.clone();
    let cache_owner = owner.to_string();
    let cache_repo = repo_name.to_string();
    let cache_commit = commit.clone();
    let cache_token = token.map(str::to_owned);
    let cache_cancellation = cancellation.cloned();
    let (progress_tx, mut progress_rx) = tokio::sync::mpsc::unbounded_channel();
    let cache_task = tokio::task::spawn_blocking(move || {
        let reporter = |update| {
            let _ = progress_tx.send(update);
        };
        git_cache::fetch_repository(
            &cache_paths,
            &cache_owner,
            &cache_repo,
            &cache_commit,
            cache_token.as_deref(),
            cache_cancellation.as_ref(),
            Some(&reporter),
        )
    });
    while !cache_task.is_finished() {
        match tokio::time::timeout(std::time::Duration::from_millis(50), progress_rx.recv()).await {
            Ok(Some(update)) => report_git_fetch_progress(progress, update),
            Ok(None) => break,
            Err(_) => {}
        }
    }
    let cache_result = cache_task
        .await
        .map_err(|_| AppError::Other("Git cache task failed".into()))?;
    while let Ok(update) = progress_rx.try_recv() {
        report_git_fetch_progress(progress, update);
    }
    match cache_result {
        Ok(cached) => {
            return Ok(DownloadedRepository {
                commit: cached.commit.clone(),
                source: RepositorySource::Git(cached),
            });
        }
        Err(git_cache::GitCacheError::Cancelled) => return Err(AppError::Cancelled),
        Err(error) => {
            tracing::warn!(
                %owner,
                %repo_name,
                %error,
                "Git cache unavailable; using commit tarball fallback"
            );
        }
    }
    ensure_not_cancelled(cancellation)?;

    let tarball = download_or_reuse_tarball(
        client,
        paths,
        owner,
        repo_name,
        &commit.sha,
        token,
        progress,
        cancellation,
    )
    .await?;

    report_progress(progress, InstallPhase::Extracting, None, None, None);
    let temp = tempfile::tempdir()?;
    let extract_root = temp.path().join("extract");
    std::fs::create_dir_all(&extract_root)?;
    extract_tarball(&tarball, &extract_root)?;
    ensure_not_cancelled(cancellation)?;

    Ok(DownloadedRepository {
        commit,
        source: RepositorySource::Archive {
            _temp: temp,
            extract_root,
        },
    })
}

#[expect(
    clippy::too_many_arguments,
    reason = "Keeps tarball cache coordination aligned with the existing downloader API"
)]
async fn download_or_reuse_tarball(
    client: &reqwest::Client,
    paths: &Paths,
    owner: &str,
    repo_name: &str,
    commit_sha: &str,
    token: Option<&str>,
    progress: Option<&ProgressReporter<'_>>,
    cancellation: Option<&Arc<AtomicBool>>,
) -> AppResult<PathBuf> {
    let commit_sha = git2::Oid::from_str(commit_sha)
        .map_err(|_| AppError::InvalidInput("invalid Git commit SHA".into()))?
        .to_string();
    let archive_path = paths.git_cache_archive(owner, repo_name, &commit_sha)?;
    ensure_archive_parent(paths, owner, repo_name)?;
    let archive_dir = archive_path
        .parent()
        .ok_or_else(|| AppError::Other("Git archive cache has no parent directory".into()))?;
    let lock = archive_lock(archive_dir)?;
    let _guard = acquire_archive_lock(lock, cancellation).await?;
    ensure_not_cancelled(cancellation)?;

    let archive_valid = archive_is_valid(&archive_path).await?;
    ensure_not_cancelled(cancellation)?;
    if archive_valid {
        return Ok(archive_path);
    }
    remove_invalid_archive(&archive_path)?;

    let temporary = tempfile::NamedTempFile::new_in(archive_dir)?.into_temp_path();
    let temporary_path = temporary.to_path_buf();
    download_tarball_with_retry(
        client,
        owner,
        repo_name,
        &commit_sha,
        token,
        &temporary_path,
        progress,
        cancellation,
    )
    .await?;
    ensure_not_cancelled(cancellation)?;
    validate_tarball_async(temporary_path).await?;
    ensure_not_cancelled(cancellation)?;
    temporary
        .persist(&archive_path)
        .map_err(|error| AppError::from(error.error))?;
    Ok(archive_path)
}

fn archive_lock(path: &Path) -> AppResult<Arc<tokio::sync::Mutex<()>>> {
    let mut locks = ARCHIVE_LOCKS
        .get_or_init(|| Mutex::new(HashMap::new()))
        .lock()
        .map_err(|_| AppError::Other("archive lock registry poisoned".into()))?;
    Ok(locks
        .entry(path.to_path_buf())
        .or_insert_with(|| Arc::new(tokio::sync::Mutex::new(())))
        .clone())
}

async fn acquire_archive_lock(
    lock: Arc<tokio::sync::Mutex<()>>,
    cancellation: Option<&Arc<AtomicBool>>,
) -> AppResult<tokio::sync::OwnedMutexGuard<()>> {
    loop {
        ensure_not_cancelled(cancellation)?;
        if let Ok(guard) = tokio::time::timeout(
            std::time::Duration::from_millis(50),
            Arc::clone(&lock).lock_owned(),
        )
        .await
        {
            return Ok(guard);
        }
    }
}

fn ensure_archive_parent(paths: &Paths, owner: &str, repo_name: &str) -> AppResult<()> {
    let root = paths.git_cache_dir();
    ensure_real_directory(&root)?;
    let owner_dir = root.join(owner);
    ensure_real_directory(&owner_dir)?;
    let archive_dir = owner_dir.join(format!("{repo_name}.archives"));
    ensure_real_directory(&archive_dir)
}

fn ensure_real_directory(path: &Path) -> AppResult<()> {
    match std::fs::symlink_metadata(path) {
        Ok(metadata) if metadata.file_type().is_symlink() || !metadata.is_dir() => Err(
            AppError::Other(format!("cache path is not a directory: {}", path.display())),
        ),
        Ok(_) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            std::fs::create_dir_all(path)?;
            Ok(())
        }
        Err(error) => Err(error.into()),
    }
}

async fn archive_is_valid(path: &Path) -> AppResult<bool> {
    let path = path.to_path_buf();
    tokio::task::spawn_blocking(move || {
        let metadata = match std::fs::symlink_metadata(&path) {
            Ok(metadata) => metadata,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(false),
            Err(error) => return Err(AppError::from(error)),
        };
        if metadata.file_type().is_symlink() || !metadata.is_file() {
            return Ok(false);
        }
        Ok(validate_tarball(&path).is_ok())
    })
    .await
    .map_err(|_| AppError::Other("Tarball cache validation task failed".into()))?
}

async fn validate_tarball_async(path: PathBuf) -> AppResult<()> {
    tokio::task::spawn_blocking(move || validate_tarball(&path))
        .await
        .map_err(|_| AppError::Other("Tarball validation task failed".into()))?
}

fn remove_invalid_archive(path: &Path) -> AppResult<()> {
    match std::fs::symlink_metadata(path) {
        Ok(metadata) if metadata.file_type().is_symlink() || metadata.is_file() => {
            std::fs::remove_file(path)?;
            Ok(())
        }
        Ok(_) => Err(AppError::Other(format!(
            "tarball cache path is not a regular file: {}",
            path.display()
        ))),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error.into()),
    }
}

/// Stage one skill from an already extracted repository snapshot.
pub async fn stage_skill_from_repository(
    paths: &Paths,
    owner: &str,
    repo_name: &str,
    skill_id: &str,
    source_path: Option<&str>,
    repository: &DownloadedRepository,
    progress: Option<&ProgressReporter<'_>>,
    cancellation: Option<&Arc<AtomicBool>>,
    retain_backup: bool,
) -> AppResult<DownloadedSkill> {
    report_progress(progress, InstallPhase::Installing, None, None, None);
    // Stage on the same filesystem as the target so the final rename is atomic.
    let target = paths.net_dir().join(owner).join(repo_name).join(skill_id);
    let staging = paths
        .net_dir()
        .join(owner)
        .join(repo_name)
        .join(format!(".staging-{skill_id}"));
    if staging.exists() {
        std::fs::remove_dir_all(&staging)?;
    }
    std::fs::create_dir_all(staging.parent().unwrap())?;
    let (source_path, tree_sha) = match &repository.source {
        RepositorySource::Git(cached) => {
            let cached = cached.clone();
            let export_skill_id = skill_id.to_string();
            let export_source_path = source_path.map(str::to_owned);
            let export_staging = staging.clone();
            let export_cancellation = cancellation.cloned();
            let exported = tokio::task::spawn_blocking(move || {
                git_cache::export_skill(
                    &cached,
                    &export_skill_id,
                    export_source_path.as_deref(),
                    &export_staging,
                    export_cancellation.as_ref(),
                )
            })
            .await
            .map_err(|_| AppError::Other("Git export task failed".into()))?
            .map_err(|error| {
                map_skill_export_error(error, owner, repo_name, skill_id)
            })?;
            (exported.source_path, Some(exported.tree_sha))
        }
        RepositorySource::Archive { extract_root, .. } => {
            let (skill_src, source_path) = skill_source(extract_root, skill_id, source_path)
                .ok_or_else(|| {
                    AppError::SkillSourceUnavailable(format!(
                        "skill '{skill_id}' with SKILL.md in {owner}/{repo_name}"
                    ))
                })?;
            validate::copy_dir_safe(&skill_src, &staging, &[], 0)?;
            (source_path, None)
        }
    };
    if let Err(error) = ensure_not_cancelled(cancellation) {
        let _ = std::fs::remove_dir_all(&staging);
        return Err(error);
    }

    let had_existing_target = target.exists();
    let backup_path = swap_in_place(
        &staging,
        &target,
        &format!(".backup-{skill_id}"),
        retain_backup,
    )?;

    let (fm_name, fm_desc) = scanner::parse_skill_md(&target);
    Ok(DownloadedSkill {
        dir_path: format!("net/{owner}/{repo_name}/{skill_id}"),
        sha: repository.commit.sha.clone(),
        source_path,
        tree_sha,
        name: fm_name
            .and_then(|n| validate::sanitize_link_name(&n))
            .unwrap_or_else(|| skill_id.to_string()),
        description: fm_desc,
        target_path: target,
        backup_path,
        had_existing_target,
    })
}

fn skill_source(
    extract_root: &Path,
    skill_id: &str,
    source_path: Option<&str>,
) -> Option<(PathBuf, String)> {
    if let Some(source_path) = source_path {
        let root = repository_root(extract_root)?;
        let candidate = root.join(source_path);
        if candidate.join("SKILL.md").is_file() {
            return Some((candidate, source_path.to_string()));
        }
        return None;
    }

    let candidate = find_skill_dir(extract_root, skill_id)?;
    let root = repository_root(extract_root)?;
    let source_path = candidate
        .strip_prefix(root)
        .ok()?
        .to_string_lossy()
        .replace('\\', "/");
    Some((candidate, source_path))
}

fn repository_root(extract_root: &Path) -> Option<PathBuf> {
    std::fs::read_dir(extract_root)
        .ok()?
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .find(|path| path.is_dir())
}

async fn download_tarball_with_retry(
    client: &reqwest::Client,
    owner: &str,
    repo_name: &str,
    git_ref: &str,
    token: Option<&str>,
    tarball: &Path,
    progress: Option<&ProgressReporter<'_>>,
    cancellation: Option<&Arc<AtomicBool>>,
) -> AppResult<()> {
    let mut attempt = 0;
    loop {
        let result = github::download_tarball_ref(
            client,
            owner,
            repo_name,
            git_ref,
            token,
            tarball,
            || cancellation.is_some_and(|token| token.load(Ordering::Acquire)),
            |downloaded_bytes, total_bytes| {
                report_progress(
                    progress,
                    InstallPhase::Downloading,
                    byte_progress_percent(downloaded_bytes, total_bytes),
                    Some(downloaded_bytes),
                    total_bytes,
                );
            },
        )
        .await;

        match result {
            Ok(()) => return Ok(()),
            Err(error) if should_retry_download(&error, attempt) => {
                attempt += 1;
                report_progress(progress, InstallPhase::RetryingDownload, None, None, None);
                ensure_not_cancelled(cancellation)?;
                tokio::time::sleep(std::time::Duration::from_millis(500)).await;
                ensure_not_cancelled(cancellation)?;
            }
            Err(error) => return Err(error),
        }
    }
}

fn should_retry_download(error: &AppError, attempt: u8) -> bool {
    attempt == 0 && matches!(error, AppError::Network(_))
}

fn ensure_not_cancelled(cancellation: Option<&Arc<AtomicBool>>) -> AppResult<()> {
    if cancellation.is_some_and(|token| token.load(Ordering::Acquire)) {
        Err(AppError::Cancelled)
    } else {
        Ok(())
    }
}

fn map_git_cache_error(error: git_cache::GitCacheError) -> AppError {
    match error {
        git_cache::GitCacheError::Cancelled => AppError::Cancelled,
        git_cache::GitCacheError::Authentication => {
            AppError::InvalidToken("GitHub authentication failed".into())
        }
        git_cache::GitCacheError::NotFound => {
            AppError::NotFound("skill path not found in commit".into())
        }
        other => AppError::Network(other.to_string()),
    }
}

fn map_skill_export_error(
    error: git_cache::GitCacheError,
    owner: &str,
    repo_name: &str,
    skill_id: &str,
) -> AppError {
    match error {
        git_cache::GitCacheError::NotFound => AppError::SkillSourceUnavailable(format!(
            "skill '{skill_id}' with SKILL.md in {owner}/{repo_name}"
        )),
        other => map_git_cache_error(other),
    }
}

fn report_progress(
    reporter: Option<&ProgressReporter<'_>>,
    phase: InstallPhase,
    progress_percent: Option<u8>,
    downloaded_bytes: Option<u64>,
    total_bytes: Option<u64>,
) {
    if let Some(reporter) = reporter {
        reporter(InstallProgress {
            phase,
            progress_percent,
            downloaded_bytes,
            total_bytes,
        });
    }
}

fn report_git_fetch_progress(
    reporter: Option<&ProgressReporter<'_>>,
    progress: git_cache::GitFetchProgress,
) {
    report_progress(
        reporter,
        InstallPhase::Downloading,
        object_progress_percent(progress.received_objects, progress.total_objects),
        Some(progress.received_bytes),
        None,
    );
}

fn object_progress_percent(received_objects: usize, total_objects: usize) -> Option<u8> {
    (total_objects > 0)
        .then(|| (received_objects.min(total_objects).saturating_mul(100) / total_objects) as u8)
}

fn byte_progress_percent(downloaded_bytes: u64, total_bytes: Option<u64>) -> Option<u8> {
    total_bytes
        .filter(|total| *total > 0)
        .map(|total| (downloaded_bytes.min(total).saturating_mul(100) / total) as u8)
}

/// DB phase: record the downloaded skill.
pub fn register_skill(
    conn: &Connection,
    downloaded: &DownloadedSkill,
    owner: &str,
    repo_name: &str,
    install_source: Option<&str>,
    source_url: Option<&str>,
    github_source: Option<&str>,
) -> AppResult<i64> {
    let id = crate::db::with_tx(conn, |conn| {
        repo::upsert_skill(
            conn,
            &downloaded.name,
            "net",
            Some(owner),
            Some(repo_name),
            &downloaded.dir_path,
            downloaded.description.as_deref(),
            Some(&downloaded.sha),
            source_url,
            github_source,
            install_source,
            Some(&downloaded.source_path),
            downloaded.tree_sha.as_deref(),
        )
    })?;
    repo::log_op(conn, "install", &downloaded.dir_path);
    Ok(id)
}

/// Replace `target` with `staging` without a remove-then-rename crash window:
/// the old copy is renamed aside first and restored if the swap fails.
fn swap_in_place(
    staging: &Path,
    target: &Path,
    backup_name: &str,
    retain_backup: bool,
) -> AppResult<Option<PathBuf>> {
    let backup = target.with_file_name(backup_name);
    if backup.exists() {
        std::fs::remove_dir_all(&backup)?;
    }
    if target.exists() {
        std::fs::rename(target, &backup)?;
    }
    if let Err(e) = std::fs::rename(staging, target) {
        let _ = std::fs::rename(&backup, target); // restore the old copy
        return Err(e.into());
    }
    if retain_backup && backup.exists() {
        Ok(Some(backup))
    } else {
        let _ = std::fs::remove_dir_all(&backup);
        Ok(None)
    }
}

pub fn update_marker_path(paths: &Paths, skill_id: i64) -> PathBuf {
    paths.skills_dir().join(format!(".updating-{skill_id}"))
}

pub fn recover_interrupted_updates(conn: &Connection, paths: &Paths) -> AppResult<usize> {
    paths.ensure_layout()?;
    let mut recovered = 0;
    for entry in std::fs::read_dir(paths.skills_dir())? {
        let entry = entry?;
        let file_name = entry.file_name();
        let Some(skill_id) = file_name
            .to_str()
            .and_then(|name| name.strip_prefix(".updating-"))
            .and_then(|id| id.parse::<i64>().ok())
        else {
            continue;
        };

        if let Ok(skill) = repo::get_skill(conn, skill_id) {
            let target = paths.checked_skill_source_dir(&skill.dir_path)?;
            recover_update_files(&target)?;
            repo::set_skill_status(conn, skill_id, "update_available")?;
            recovered += 1;
        }
        std::fs::remove_file(entry.path())?;
    }
    Ok(recovered)
}

fn recover_update_files(target: &Path) -> AppResult<()> {
    let Some(file_name) = target.file_name().and_then(|name| name.to_str()) else {
        return Ok(());
    };
    let Some(parent) = target.parent() else {
        return Ok(());
    };
    let staging = parent.join(format!(".staging-{file_name}"));
    let backup = parent.join(format!(".backup-{file_name}"));

    if staging.exists() {
        std::fs::remove_dir_all(staging)?;
    }
    if backup.exists() {
        if target.exists() {
            std::fs::remove_dir_all(target)?;
        }
        std::fs::rename(backup, target)?;
    }
    Ok(())
}

/// Unpack only regular files and directories; symlinks, hardlinks, and device
/// entries in the archive are dropped so a hostile repo can't link outside the
/// extract dir (the later copy also skips links as defense in depth).
fn validate_tarball(tarball: &Path) -> AppResult<()> {
    let file = std::fs::File::open(tarball)?;
    let mut archive = Archive::new(GzDecoder::new(file));
    for entry in archive.entries()? {
        let entry = entry?;
        let _ = entry.path()?;
    }
    Ok(())
}

fn extract_tarball(tarball: &Path, dest: &Path) -> AppResult<()> {
    let file = std::fs::File::open(tarball)?;
    let mut archive = Archive::new(GzDecoder::new(file));
    for entry in archive.entries()? {
        let mut entry = entry?;
        match entry.header().entry_type() {
            EntryType::Regular | EntryType::Directory => {
                entry.unpack_in(dest)?;
            }
            _ => continue,
        }
    }
    Ok(())
}

/// Find a directory named `skill_id` that contains SKILL.md, searching breadth-first.
/// Falls back to any SKILL.md dir whose frontmatter `name` matches, or any SKILL.md dir.
pub fn find_skill_dir(root: &Path, skill_id: &str) -> Option<PathBuf> {
    let mut queue = vec![root.to_path_buf()];
    let mut frontmatter_match = None;
    let mut any_skill_dir = None;

    // Special case: if skill_id is "any", skip exact match and frontmatter checks
    let exact_match_required = skill_id != "any";

    while let Some(dir) = queue.pop() {
        let entries = match std::fs::read_dir(&dir) {
            Ok(e) => e,
            Err(_) => continue,
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if !path.is_dir() {
                continue;
            }
            if path.join("SKILL.md").is_file() {
                if any_skill_dir.is_none() {
                    any_skill_dir = Some(path.clone());
                }
                // Try exact match by directory name
                if exact_match_required && entry.file_name().to_string_lossy() == skill_id {
                    return Some(path);
                }
                // Try frontmatter match
                if exact_match_required {
                    let (name, _) = scanner::parse_skill_md(&path);
                    if name.as_deref() == Some(skill_id) {
                        frontmatter_match = Some(path.clone());
                    }
                }
            }
            queue.push(path);
        }
    }

    // If not doing exact match, return the first found; otherwise return frontmatter match or any found
    if skill_id == "any" {
        any_skill_dir
    } else {
        frontmatter_match.or(any_skill_dir)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_skill(root: &Path, rel: &str, fm_name: Option<&str>) {
        let dir = root.join(rel);
        std::fs::create_dir_all(&dir).unwrap();
        let fm = fm_name
            .map(|n| format!("---\nname: {n}\ndescription: d\n---\n"))
            .unwrap_or_default();
        std::fs::write(dir.join("SKILL.md"), format!("{fm}# body\n")).unwrap();
    }

    #[test]
    fn finds_skill_dir_by_directory_name() {
        let tmp = tempfile::tempdir().unwrap();
        make_skill(tmp.path(), "repo-abc123/skills/my-skill", None);
        make_skill(tmp.path(), "repo-abc123/skills/other", None);
        let found = find_skill_dir(tmp.path(), "my-skill").unwrap();
        assert!(found.ends_with("skills/my-skill"));
    }

    #[test]
    fn falls_back_to_frontmatter_name() {
        let tmp = tempfile::tempdir().unwrap();
        make_skill(tmp.path(), "repo-x/weird-dir", Some("target-skill"));
        let found = find_skill_dir(tmp.path(), "target-skill").unwrap();
        assert!(found.ends_with("weird-dir"));
    }

    #[test]
    fn falls_back_to_any_skill_dir_when_unmatched() {
        let tmp = tempfile::tempdir().unwrap();
        make_skill(tmp.path(), "repo-x/single-skill", None);
        let found = find_skill_dir(tmp.path(), "repo-x").unwrap();
        assert!(found.ends_with("single-skill"));
    }

    #[test]
    fn returns_none_when_absent() {
        let tmp = tempfile::tempdir().unwrap();
        assert!(find_skill_dir(tmp.path(), "nope").is_none());
    }

    #[test]
    fn missing_git_skill_maps_to_source_unavailable() {
        let error = map_skill_export_error(
            git_cache::GitCacheError::NotFound,
            "owner",
            "repo",
            "removed-skill",
        );

        assert!(matches!(error, AppError::SkillSourceUnavailable(_)));
    }

    #[test]
    fn rejects_traversal_identifiers() {
        assert!(validate::validate_segment("..").is_err());
        assert!(validate::validate_segment("a/b").is_err());
        assert!(validate::validate_segment("").is_err());
        assert!(validate::validate_segment("ok-name").is_ok());
    }

    #[test]
    fn retries_only_the_first_download_network_error() {
        let network = AppError::Network("response body interrupted".into());

        assert!(should_retry_download(&network, 0));
        assert!(!should_retry_download(&network, 1));
        assert!(!should_retry_download(&AppError::RateLimited, 0));
        assert!(!should_retry_download(&AppError::Cancelled, 0));
    }

    #[test]
    fn calculates_git_object_progress_percentage() {
        assert_eq!(object_progress_percent(0, 0), None);
        assert_eq!(object_progress_percent(1, 4), Some(25));
        assert_eq!(object_progress_percent(5, 4), Some(100));
    }

    #[test]
    fn calculates_tarball_byte_progress_percentage() {
        assert_eq!(byte_progress_percent(50, Some(100)), Some(50));
        assert_eq!(byte_progress_percent(10, None), None);
        assert_eq!(byte_progress_percent(10, Some(0)), None);
    }

    #[test]
    fn swap_restores_backup_when_swap_fails() {
        let tmp = tempfile::tempdir().unwrap();
        let target = tmp.path().join("skill");
        std::fs::create_dir_all(&target).unwrap();
        std::fs::write(target.join("SKILL.md"), "old").unwrap();

        // Staging is missing, so the swap's rename must fail after the old
        // copy was moved aside — and the old copy must come back.
        let staging = tmp.path().join(".staging-skill");
        let err = swap_in_place(&staging, &target, ".backup-skill", false);
        assert!(err.is_err());
        assert_eq!(
            std::fs::read_to_string(target.join("SKILL.md")).unwrap(),
            "old"
        );
        assert!(!tmp.path().join(".backup-skill").exists());
    }

    #[test]
    fn swap_replaces_existing_target() {
        let tmp = tempfile::tempdir().unwrap();
        let target = tmp.path().join("skill");
        std::fs::create_dir_all(&target).unwrap();
        std::fs::write(target.join("SKILL.md"), "old").unwrap();
        let staging = tmp.path().join(".staging-skill");
        std::fs::create_dir_all(&staging).unwrap();
        std::fs::write(staging.join("SKILL.md"), "new").unwrap();

        swap_in_place(&staging, &target, ".backup-skill", false).unwrap();
        assert_eq!(
            std::fs::read_to_string(target.join("SKILL.md")).unwrap(),
            "new"
        );
        assert!(!staging.exists());
        assert!(!tmp.path().join(".backup-skill").exists());
    }

    #[test]
    fn interrupted_update_restores_backup_and_update_status() {
        let tmp = tempfile::tempdir().unwrap();
        let paths = Paths::with_root(tmp.path().join("console"));
        paths.ensure_layout().unwrap();
        let db = crate::db::Db::open_in_memory().unwrap();
        let conn = db.conn.lock().unwrap();
        let skill_id = repo::upsert_skill(
            &conn,
            "skill",
            "net",
            Some("owner"),
            Some("repo"),
            "net/owner/repo/skill",
            None,
            Some("old-sha"),
            None,
            None,
            Some("github"),
            None,
            None,
        )
        .unwrap();
        let target = paths.skill_source_dir("net/owner/repo/skill");
        make_skill(target.parent().unwrap(), "skill", None);
        std::fs::write(target.join("SKILL.md"), "old").unwrap();
        let staging = target.with_file_name(".staging-skill");
        make_skill(staging.parent().unwrap(), ".staging-skill", Some("new"));
        swap_in_place(&staging, &target, ".backup-skill", true).unwrap();
        std::fs::write(update_marker_path(&paths, skill_id), b"").unwrap();

        assert_eq!(recover_interrupted_updates(&conn, &paths).unwrap(), 1);
        assert_eq!(
            std::fs::read_to_string(target.join("SKILL.md")).unwrap(),
            "old"
        );
        assert_eq!(
            repo::get_skill(&conn, skill_id).unwrap().status,
            "update_available"
        );
        assert!(!update_marker_path(&paths, skill_id).exists());
        assert!(!target.with_file_name(".backup-skill").exists());
    }

    #[test]
    fn extract_drops_symlink_entries() {
        let tmp = tempfile::tempdir().unwrap();
        let tarball = tmp.path().join("evil.tar.gz");

        let file = std::fs::File::create(&tarball).unwrap();
        let gz = flate2::write::GzEncoder::new(file, flate2::Compression::default());
        let mut builder = tar::Builder::new(gz);

        let body = b"hello";
        let mut header = tar::Header::new_gnu();
        header.set_entry_type(EntryType::Regular);
        header.set_size(body.len() as u64);
        header.set_mode(0o644);
        header.set_cksum();
        builder
            .append_data(&mut header, "repo/file.txt", &body[..])
            .unwrap();

        let mut link = tar::Header::new_gnu();
        link.set_entry_type(EntryType::Symlink);
        link.set_size(0);
        link.set_mode(0o777);
        link.set_cksum();
        builder
            .append_link(&mut link, "repo/leak", "/etc/passwd")
            .unwrap();
        builder.into_inner().unwrap().finish().unwrap();

        validate_tarball(&tarball).unwrap();
        let dest = tmp.path().join("out");
        std::fs::create_dir_all(&dest).unwrap();
        extract_tarball(&tarball, &dest).unwrap();
        assert!(dest.join("repo/file.txt").is_file());
        assert!(std::fs::symlink_metadata(dest.join("repo/leak")).is_err());
    }
}
