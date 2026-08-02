use std::collections::{BTreeMap, HashMap, HashSet};
use std::sync::atomic::{AtomicBool, AtomicU8, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use chrono::{DateTime, Local};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, State};
use tauri_plugin_opener::OpenerExt;

use crate::bootstrap;
use crate::db::{repo, Db};
use crate::diagnostics;
use crate::error::{AppError, AppResult};
use crate::models::{
    Agent, BrokenLink, EffectiveSkill, GitCacheInfo, ImportResult, ListedSkill,
    LocalSkillPreview, MoveDirection, Preset, PresetReuseMode, PresetReuseResult, Project,
    ProjectGroup, RegistrySkill, Skill, SyncReport,
};
use crate::paths::Paths;
use crate::services::{git_cache, github, importer, installer, linker, platform_link, registry, scanner, updater};
use crate::validate;

pub struct AppState {
    pub db: Db,
    pub paths: Paths,
    pub client: reqwest::Client,
    pub update_checks: tokio::sync::Mutex<()>,
    pub skill_installs: SkillInstallCoordinator,
    pub skill_updates: SkillUpdateCoordinator,
    pub bootstrap_config_file: std::path::PathBuf,
}

const MAX_CONCURRENT_SKILL_INSTALLS: usize = 2;
const MAX_CONCURRENT_SKILL_UPDATES: usize = 2;
const AUTO_UPDATE_CHECK_INTERVAL_SECS: u64 = 60 * 60;
const SKILL_INSTALL_PROGRESS_EVENT: &str = "skill-install-progress";
const SKILL_UPDATE_PROGRESS_EVENT: &str = "skill-update-progress";

struct ActiveSkillUpdate {
    cancellation: Arc<AtomicBool>,
    finalizing: bool,
}

struct ActiveSkillInstall {
    cancellation: Arc<AtomicBool>,
    finalizing: bool,
    target: String,
}

#[derive(Default)]
pub struct SkillInstallCoordinator {
    active: Mutex<HashMap<String, ActiveSkillInstall>>,
}

impl SkillInstallCoordinator {
    fn reserve(&self, operation_id: &str, target: &str) -> AppResult<Arc<AtomicBool>> {
        if operation_id.trim().is_empty() {
            return Err(AppError::InvalidInput("operation ID is required".into()));
        }

        let mut active = self.active.lock().unwrap();
        if active.contains_key(operation_id) {
            return Err(AppError::InvalidInput(
                "skill install operation already in progress".into(),
            ));
        }
        if active.values().any(|install| install.target == target) {
            return Err(AppError::InvalidInput(
                "skill install target already in progress".into(),
            ));
        }
        if active.len() >= MAX_CONCURRENT_SKILL_INSTALLS {
            return Err(AppError::InvalidInput(
                "too many skill installs in progress".into(),
            ));
        }

        let cancellation = Arc::new(AtomicBool::new(false));
        active.insert(
            operation_id.to_owned(),
            ActiveSkillInstall {
                cancellation: Arc::clone(&cancellation),
                finalizing: false,
                target: target.to_owned(),
            },
        );
        Ok(cancellation)
    }

    fn begin_finalize(&self, operation_id: &str) -> bool {
        let mut active = self.active.lock().unwrap();
        let Some(install) = active.get_mut(operation_id) else {
            return true;
        };
        install.finalizing = true;
        install.cancellation.load(Ordering::Acquire)
    }

    fn cancel(&self, operation_id: &str) -> bool {
        let active = self.active.lock().unwrap();
        let Some(install) = active.get(operation_id) else {
            return false;
        };
        if install.finalizing {
            return false;
        }
        install.cancellation.store(true, Ordering::Release);
        true
    }

    fn cancel_all(&self) -> usize {
        let active = self.active.lock().unwrap();
        let mut cancelled = 0;
        for install in active.values() {
            if !install.finalizing {
                install.cancellation.store(true, Ordering::Release);
                cancelled += 1;
            }
        }
        cancelled
    }

    fn finish(&self, operation_id: &str) {
        self.active.lock().unwrap().remove(operation_id);
    }

    fn active_count(&self) -> usize {
        self.active.lock().unwrap().len()
    }
}

#[derive(Default)]
pub struct SkillUpdateCoordinator {
    active: Mutex<HashMap<i64, ActiveSkillUpdate>>,
    cancelling: AtomicBool,
}

impl SkillUpdateCoordinator {
    fn reserve(&self, skill_id: i64) -> AppResult<Arc<AtomicBool>> {
        let mut active = self.active.lock().unwrap();
        if self.cancelling.load(Ordering::Acquire) {
            return Err(AppError::Cancelled);
        }
        if active.contains_key(&skill_id) {
            return Err(AppError::InvalidInput("skill update already in progress".into()));
        }
        if active.len() >= MAX_CONCURRENT_SKILL_UPDATES {
            return Err(AppError::InvalidInput("too many skill updates in progress".into()));
        }
        let cancellation = Arc::new(AtomicBool::new(false));
        active.insert(
            skill_id,
            ActiveSkillUpdate {
                cancellation: Arc::clone(&cancellation),
                finalizing: false,
            },
        );
        Ok(cancellation)
    }

    fn begin_finalize(&self, skill_id: i64) -> bool {
        let mut active = self.active.lock().unwrap();
        let Some(update) = active.get_mut(&skill_id) else {
            return true;
        };
        update.finalizing = true;
        update.cancellation.load(Ordering::Acquire)
    }

    fn finish(&self, skill_id: i64) {
        self.active.lock().unwrap().remove(&skill_id);
    }

    fn cancel_all(&self) -> usize {
        self.cancelling.store(true, Ordering::Release);
        let mut cancelled = 0;
        for update in self.active.lock().unwrap().values() {
            if !update.finalizing {
                update.cancellation.store(true, Ordering::Release);
                cancelled += 1;
            }
        }
        cancelled
    }

    fn active_count(&self) -> usize {
        self.active.lock().unwrap().len()
    }
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct SkillUpdateProgressEvent {
    skill_id: i64,
    phase: &'static str,
    progress: u8,
    downloaded_bytes: Option<u64>,
    total_bytes: Option<u64>,
    error: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct SkillInstallProgressEvent<'a> {
    operation_id: &'a str,
    phase: &'static str,
    progress_percent: Option<u8>,
    downloaded_bytes: Option<u64>,
    total_bytes: Option<u64>,
    error: Option<&'a str>,
}

struct PreparedSkillUpdate {
    owner: String,
    repo_name: String,
    previous: Skill,
    downloaded: installer::DownloadedSkill,
}

impl AppState {
    pub fn token(&self) -> AppResult<Option<String>> {
        let conn = self.db.conn.lock().unwrap();
        repo::get_setting(&conn, "github_token")
    }

}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum UpdateCheckTrigger {
    Manual,
    Startup,
    Scheduled,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum UpdateCheckOutcome {
    Skipped,
    Completed(usize),
}

fn should_run_update_check(
    trigger: UpdateCheckTrigger,
    token_configured: bool,
    interval_elapsed: bool,
) -> bool {
    match trigger {
        UpdateCheckTrigger::Manual => true,
        UpdateCheckTrigger::Startup if token_configured => true,
        UpdateCheckTrigger::Startup | UpdateCheckTrigger::Scheduled => interval_elapsed,
    }
}

fn normalize_github_token(token: Option<String>) -> Option<String> {
    token
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty())
}

pub async fn check_updates_internal(
    state: &AppState,
    trigger: UpdateCheckTrigger,
) -> AppResult<UpdateCheckOutcome> {
    let _check_guard = state.update_checks.lock().await;
    let (token, repos) = {
        let conn = state.db.conn.lock().unwrap();
        let token = normalize_github_token(repo::get_setting(&conn, "github_token")?);
        let interval_elapsed = match trigger {
            UpdateCheckTrigger::Manual => false,
            UpdateCheckTrigger::Startup | UpdateCheckTrigger::Scheduled => {
                updater::should_auto_check(&conn, AUTO_UPDATE_CHECK_INTERVAL_SECS)?
            }
        };
        if !should_run_update_check(trigger, token.is_some(), interval_elapsed) {
            return Ok(UpdateCheckOutcome::Skipped);
        }
        let repos = updater::repos_to_check(&conn)?;
        (token, repos)
    };

    if repos.is_empty() {
        let conn = state.db.conn.lock().unwrap();
        updater::update_last_check_timestamp(&conn)?;
        return Ok(UpdateCheckOutcome::Completed(0));
    }

    let commits = updater::fetch_latest_commits(&state.client, &repos, token.as_deref()).await?;
    let skills = {
        let conn = state.db.conn.lock().unwrap();
        repo::list_skills(&conn)?
    };
    let tree_shas = updater::fetch_skill_tree_shas(
        &state.client,
        &skills,
        &commits,
        token.as_deref(),
    )
    .await?;
    let conn = state.db.conn.lock().unwrap();
    let updates = updater::apply_update_states(&conn, &commits, &tree_shas)?;
    updater::update_last_check_timestamp(&conn)?;
    Ok(UpdateCheckOutcome::Completed(updates))
}

// ---------- registry ----------

#[tauri::command]
pub async fn search_registry(
    state: State<'_, AppState>,
    query: String,
) -> AppResult<Vec<RegistrySkill>> {
    let installed: HashSet<String> = {
        let conn = state.db.conn.lock().unwrap();
        repo::list_skills(&conn)?.into_iter().map(|s| s.dir_path).collect()
    };
    registry::search(&state.client, &installed, &query).await
}

#[tauri::command]
#[expect(
    clippy::too_many_arguments,
    reason = "Tauri injects app state alongside the flat install IPC payload"
)]
pub async fn install_skill(
    app: AppHandle,
    state: State<'_, AppState>,
    owner: String,
    repo_name: String,
    skill_id: String,
    operation_id: String,
    source_url: Option<String>,
    github_source: Option<String>,
) -> AppResult<Skill> {
    validate::validate_segment(&owner)?;
    validate::validate_segment(&repo_name)?;
    validate::validate_segment(&skill_id)?;
    let target = format!("{owner}/{repo_name}/{skill_id}").to_ascii_lowercase();
    let cancellation = state.skill_installs.reserve(&operation_id, &target)?;
    let reporter = |progress: installer::InstallProgress| {
        let (phase, _) = install_progress_value(progress);
        emit_skill_install_progress(
            &app,
            &operation_id,
            phase,
            progress.progress_percent,
            progress.downloaded_bytes,
            progress.total_bytes,
            None,
        );
    };

    let result = async {
        let token = state.token()?;
        let downloaded = installer::download_skill(
            &state.client,
            &state.paths,
            &owner,
            &repo_name,
            &skill_id,
            token.as_deref(),
            Some(&reporter),
            Some(&cancellation),
            true,
            None,
        )
        .await?;
        if state.skill_installs.begin_finalize(&operation_id) {
            downloaded.rollback_files()?;
            return Err(AppError::Cancelled);
        }
        emit_skill_install_progress(&app, &operation_id, "registering", None, None, None, None);
        let conn = state.db.conn.lock().unwrap();
        let install_source = if source_url.is_some() {
            "skills_sh"
        } else {
            "github"
        };

        // Preserve a re-install on DB failure, but remove an unregistered fresh install.
        let existed = match repo::find_skill_by_dir_path(&conn, &downloaded.dir_path) {
            Ok(skill) => skill.is_some(),
            Err(error) => {
                downloaded.rollback_files()?;
                return Err(error);
            }
        };
        let id = match installer::register_skill(
            &conn,
            &downloaded,
            &owner,
            &repo_name,
            Some(install_source),
            source_url.as_deref(),
            github_source.as_deref(),
        ) {
            Ok(id) => id,
            Err(error) => {
                if existed {
                    downloaded.commit_files()?;
                } else {
                    downloaded.rollback_files()?;
                }
                return Err(error);
            }
        };
        emit_skill_install_progress(&app, &operation_id, "syncing", None, None, None, None);
        let skill = (|| {
            let affected = repo::projects_using_skill(&conn, id)?;
            linker::sync_projects(&conn, &state.paths, &affected)?;
            repo::get_skill(&conn, id)
        })();
        downloaded.commit_files()?;
        skill
    }
    .await;

    state.skill_installs.finish(&operation_id);

    match &result {
        Ok(_) => {
            emit_skill_install_progress(
                &app,
                &operation_id,
                "completed",
                Some(100),
                None,
                None,
                None,
            );
            let _ = app.emit("skills-changed", ());
        }
        Err(AppError::Cancelled) => {
            emit_skill_install_progress(&app, &operation_id, "cancelled", None, None, None, None)
        }
        Err(error) => emit_skill_install_progress(
            &app,
            &operation_id,
            "failed",
            None,
            None,
            None,
            Some(&error.to_string()),
        ),
    }
    result
}

#[tauri::command]
pub fn cancel_skill_install(state: State<'_, AppState>, operation_id: String) -> AppResult<bool> {
    Ok(state.skill_installs.cancel(&operation_id))
}

#[tauri::command]
pub async fn cancel_skill_installs(state: State<'_, AppState>) -> AppResult<usize> {
    let cancelled = state.skill_installs.cancel_all();
    let deadline = Instant::now() + Duration::from_secs(3);
    while state.skill_installs.active_count() > 0 && Instant::now() < deadline {
        tokio::time::sleep(Duration::from_millis(25)).await;
    }
    Ok(cancelled)
}

// ---------- skills ----------

#[tauri::command]
pub fn list_skills(state: State<'_, AppState>) -> AppResult<Vec<ListedSkill>> {
    let conn = state.db.conn.lock().unwrap();
    repo::list_skills_with_reference_counts(&conn)
}

#[tauri::command]
pub fn rescan_local(state: State<'_, AppState>) -> AppResult<Vec<Skill>> {
    let conn = state.db.conn.lock().unwrap();
    scanner::rescan(&conn, &state.paths)?;
    repo::list_skills(&conn)
}

/// Inspect a user-picked folder before importing it as a local skill.
#[tauri::command]
pub fn preview_local_skill(state: State<'_, AppState>, path: String) -> AppResult<LocalSkillPreview> {
    scanner::preview_local_import(&state.paths, std::path::Path::new(&path))
}

/// Copy a folder into `skills/local/` and register it.
#[tauri::command]
pub fn import_local_skill(state: State<'_, AppState>, path: String) -> AppResult<Skill> {
    let conn = state.db.conn.lock().unwrap();
    scanner::import_local(&conn, &state.paths, std::path::Path::new(&path))
}

#[tauri::command]
pub async fn check_updates(state: State<'_, AppState>) -> AppResult<usize> {
    match check_updates_internal(&state, UpdateCheckTrigger::Manual).await? {
        UpdateCheckOutcome::Completed(count) => Ok(count),
        UpdateCheckOutcome::Skipped => Ok(0),
    }
}

#[tauri::command]
pub async fn update_skill(
    app: AppHandle,
    state: State<'_, AppState>,
    skill_id: i64,
) -> AppResult<Skill> {
    state.paths.ensure_layout()?;
    let cancellation = state.skill_updates.reserve(skill_id)?;
    let marker = installer::update_marker_path(&state.paths, skill_id);
    if let Err(error) = std::fs::write(&marker, b"") {
        state.skill_updates.finish(skill_id);
        return Err(error.into());
    }

    let last_progress = AtomicU8::new(0);
    let result = update_skill_inner(
        &app,
        &state,
        skill_id,
        &last_progress,
        Arc::clone(&cancellation),
    )
    .await;
    let cancelled = state.skill_updates.begin_finalize(skill_id);
    let result = finalize_skill_update(
        &app,
        &state,
        skill_id,
        &last_progress,
        result,
        cancelled,
    );
    let marker_result = if marker.exists() {
        std::fs::remove_file(marker).map_err(AppError::from)
    } else {
        Ok(())
    };
    state.skill_updates.finish(skill_id);
    let result = result.and_then(|skill| marker_result.map(|_| skill));

    match &result {
        Ok(_) => emit_skill_update_progress(
            &app,
            skill_id,
            "completed",
            100,
            None,
            None,
            None,
        ),
        Err(error) => emit_skill_update_progress(
            &app,
            skill_id,
            "failed",
            last_progress.load(Ordering::Relaxed),
            None,
            None,
            Some(error.to_string()),
        ),
    }

    result
}

/// Update several network skills while downloading each source repository once.
#[tauri::command]
pub async fn update_skills(
    app: AppHandle,
    state: State<'_, AppState>,
    skill_ids: Vec<i64>,
) -> AppResult<Vec<Skill>> {
    let mut unique_ids = HashSet::new();
    let skills = {
        let conn = state.db.conn.lock().unwrap();
        skill_ids
            .into_iter()
            .filter(|id| unique_ids.insert(*id))
            .map(|id| repo::get_skill(&conn, id))
            .collect::<AppResult<Vec<_>>>()?
    };
    if skills.is_empty() {
        return Ok(vec![]);
    }

    let mut groups = BTreeMap::<(String, String), Vec<Skill>>::new();
    for skill in skills {
        if skill.source_type != "net" {
            return Err(AppError::InvalidInput("only net skills can be updated".into()));
        }
        let owner = skill
            .owner
            .clone()
            .ok_or_else(|| AppError::Other("skill has no owner".into()))?;
        let repo_name = skill
            .repo
            .clone()
            .ok_or_else(|| AppError::Other("skill has no repo".into()))?;
        groups.entry((owner, repo_name)).or_default().push(skill);
    }

    let token = state.token()?;
    let mut updated = vec![];
    for ((owner, repo_name), group) in groups {
        let leader_id = group[0].id;
        for skill in &group {
            emit_skill_update_progress(&app, skill.id, "checking", 5, None, None, None);
        }
        let reporter = |progress: installer::InstallProgress| {
            let (phase, value) = install_progress_value(progress);
            for skill in &group {
                let show_bytes = skill.id == leader_id;
                emit_skill_update_progress(
                    &app,
                    skill.id,
                    phase,
                    value,
                    show_bytes.then_some(progress.downloaded_bytes).flatten(),
                    show_bytes.then_some(progress.total_bytes).flatten(),
                    None,
                );
            }
        };
        let repository = match installer::download_repository(
            &state.client,
            &state.paths,
            &owner,
            &repo_name,
            token.as_deref(),
            Some(&reporter),
            None,
        )
        .await
        {
            Ok(repository) => repository,
            Err(error) => {
                for skill in &group {
                    emit_skill_update_progress(
                        &app,
                        skill.id,
                        "failed",
                        0,
                        None,
                        None,
                        Some(error.to_string()),
                    );
                }
                continue;
            }
        };
        let source_paths = group
            .iter()
            .filter_map(|skill| skill.source_path.clone())
            .collect::<Vec<_>>();
        let tree_shas = match github::path_tree_shas(
            &state.client,
            &owner,
            &repo_name,
            token.as_deref(),
            &repository.commit.tree_sha,
            &source_paths,
        )
        .await
        {
            Ok(tree_shas) => tree_shas,
            Err(error) => {
                for skill in &group {
                    emit_skill_update_progress(
                        &app,
                        skill.id,
                        "failed",
                        85,
                        None,
                        None,
                        Some(error.to_string()),
                    );
                }
                continue;
            }
        };

        for skill in &group {
            let skill_id = skill.id;
            let last_progress = AtomicU8::new(85);
            let downloaded = match installer::stage_skill_from_repository(
                &state.paths,
                &owner,
                &repo_name,
                skill.dir_path.rsplit('/').next().unwrap_or(&skill.name),
                skill.source_path.as_deref(),
                &repository,
                Some(&reporter),
                None,
                true,
            )
            .await
            {
                Ok(downloaded) => downloaded,
                Err(error) => {
                    emit_skill_update_progress(
                        &app,
                        skill_id,
                        "failed",
                        last_progress.load(Ordering::Relaxed),
                        None,
                        None,
                        Some(error.to_string()),
                    );
                    continue;
                }
            };
            let mut downloaded = downloaded;
            downloaded.tree_sha = tree_shas.get(&downloaded.source_path).cloned().flatten();

            let prepared = PreparedSkillUpdate {
                owner: owner.clone(),
                repo_name: repo_name.clone(),
                previous: skill.clone(),
                downloaded,
            };
            match finalize_skill_update(&app, &state, skill_id, &last_progress, Ok(prepared), false) {
                Ok(skill) => {
                    emit_skill_update_progress(&app, skill_id, "completed", 100, None, None, None);
                    updated.push(skill);
                }
                Err(error) => emit_skill_update_progress(
                    &app,
                    skill_id,
                    "failed",
                    last_progress.load(Ordering::Relaxed),
                    None,
                    None,
                    Some(error.to_string()),
                ),
            }
        }
    }
    Ok(updated)
}

#[tauri::command]
pub async fn cancel_skill_updates(state: State<'_, AppState>) -> AppResult<usize> {
    let cancelled = state.skill_updates.cancel_all();
    let deadline = Instant::now() + Duration::from_secs(3);
    while state.skill_updates.active_count() > 0 && Instant::now() < deadline {
        tokio::time::sleep(Duration::from_millis(25)).await;
    }
    Ok(cancelled)
}

async fn update_skill_inner(
    app: &AppHandle,
    state: &AppState,
    skill_id: i64,
    last_progress: &AtomicU8,
    cancellation: Arc<AtomicBool>,
) -> AppResult<PreparedSkillUpdate> {
    let (previous, owner, repo_name, name) = {
        let conn = state.db.conn.lock().unwrap();
        let s = repo::get_skill(&conn, skill_id)?;
        if s.source_type != "net" {
            return Err(AppError::InvalidInput("only net skills can be updated".into()));
        }
        let owner = s
            .owner
            .clone()
            .ok_or_else(|| AppError::Other("skill has no owner".into()))?;
        let repo_name = s
            .repo
            .clone()
            .ok_or_else(|| AppError::Other("skill has no repo".into()))?;
        let name = s.dir_path.rsplit('/').next().unwrap_or(&s.name).to_string();
        (s, owner, repo_name, name)
    };
    let token = state.token()?;
    let reporter = |update: installer::InstallProgress| {
        let (phase, progress) = install_progress_value(update);
        last_progress.store(progress, Ordering::Relaxed);
        emit_skill_update_progress(
            app,
            skill_id,
            phase,
            progress,
            update.downloaded_bytes,
            update.total_bytes,
            None,
        );
    };
    let downloaded = installer::download_skill(
        &state.client,
        &state.paths,
        &owner,
        &repo_name,
        &name,
        token.as_deref(),
        Some(&reporter),
        Some(&cancellation),
        true,
        previous.source_path.as_deref(),
    )
    .await?;
    if cancellation.load(Ordering::Acquire) {
        downloaded.rollback_files()?;
        return Err(AppError::Cancelled);
    }
    Ok(PreparedSkillUpdate {
        owner,
        repo_name,
        previous,
        downloaded,
    })
}

fn finalize_skill_update(
    app: &AppHandle,
    state: &AppState,
    skill_id: i64,
    last_progress: &AtomicU8,
    result: AppResult<PreparedSkillUpdate>,
    cancelled: bool,
) -> AppResult<Skill> {
    match result {
        Ok(prepared) if cancelled => {
            prepared.downloaded.rollback_files()?;
            let conn = state.db.conn.lock().unwrap();
            repo::set_skill_status(&conn, skill_id, "update_available")?;
            Err(AppError::Cancelled)
        }
        Ok(prepared) => {
            let conn = state.db.conn.lock().unwrap();
            let install_source = if prepared.previous.source_url.is_some() {
                "skills_sh"
            } else {
                "github"
            };
            last_progress.store(92, Ordering::Relaxed);
            emit_skill_update_progress(app, skill_id, "registering", 92, None, None, None);
            let commit_result = (|| -> AppResult<Skill> {
                let id = installer::register_skill(
                    &conn,
                    &prepared.downloaded,
                    &prepared.owner,
                    &prepared.repo_name,
                    Some(install_source),
                    prepared.previous.source_url.as_deref(),
                    prepared.previous.github_source.as_deref(),
                )?;
                let affected = repo::projects_using_skill(&conn, id)?;
                last_progress.store(97, Ordering::Relaxed);
                emit_skill_update_progress(app, skill_id, "syncing", 97, None, None, None);
                linker::sync_projects(&conn, &state.paths, &affected)?;
                repo::get_skill(&conn, id)
            })();

            let skill = match commit_result {
                Ok(skill) => skill,
                Err(error) => {
                    let _ = prepared.downloaded.rollback_files();
                    let _ = repo::set_skill_status(&conn, skill_id, "update_available");
                    return Err(error);
                }
            };
            if let Err(error) = prepared.downloaded.commit_files() {
                let _ = prepared.downloaded.rollback_files();
                let _ = repo::set_skill_status(&conn, skill_id, "update_available");
                return Err(error);
            }
            Ok(skill)
        }
        Err(error) => {
            if matches!(&error, AppError::Cancelled) {
                let conn = state.db.conn.lock().unwrap();
                let _ = repo::set_skill_status(&conn, skill_id, "update_available");
            }
            Err(error)
        }
    }
}

fn install_progress_value(update: installer::InstallProgress) -> (&'static str, u8) {
    match update.phase {
        installer::InstallPhase::Checking => ("checking", 5),
        installer::InstallPhase::Downloading => {
            let progress = update.progress_percent.map_or_else(
                || match (update.downloaded_bytes, update.total_bytes) {
                    (Some(downloaded), Some(total)) if total > 0 => {
                        10 + ((downloaded.saturating_mul(55) / total).min(55) as u8)
                    }
                    _ => 10,
                },
                |percent| 10 + ((u16::from(percent.min(100)) * 55) / 100) as u8,
            );
            ("downloading", progress)
        }
        installer::InstallPhase::RetryingDownload => ("retrying", 10),
        installer::InstallPhase::Extracting => ("extracting", 70),
        installer::InstallPhase::Installing => ("installing", 85),
    }
}

fn emit_skill_install_progress(
    app: &AppHandle,
    operation_id: &str,
    phase: &'static str,
    progress_percent: Option<u8>,
    downloaded_bytes: Option<u64>,
    total_bytes: Option<u64>,
    error: Option<&str>,
) {
    let _ = app.emit(
        SKILL_INSTALL_PROGRESS_EVENT,
        SkillInstallProgressEvent {
            operation_id,
            phase,
            progress_percent,
            downloaded_bytes,
            total_bytes,
            error,
        },
    );
}

fn emit_skill_update_progress(
    app: &AppHandle,
    skill_id: i64,
    phase: &'static str,
    progress: u8,
    downloaded_bytes: Option<u64>,
    total_bytes: Option<u64>,
    error: Option<String>,
) {
    let _ = app.emit(
        SKILL_UPDATE_PROGRESS_EVENT,
        SkillUpdateProgressEvent {
            skill_id,
            phase,
            progress,
            downloaded_bytes,
            total_bytes,
            error,
        },
    );
}

/// Presets and projects referencing a skill, for the delete confirmation dialog.
#[tauri::command]
pub fn skill_references(
    state: State<'_, AppState>,
    skill_id: i64,
) -> AppResult<(Vec<String>, Vec<String>)> {
    let conn = state.db.conn.lock().unwrap();
    repo::skill_references(&conn, skill_id)
}

/// Detailed reference information for a skill.
#[tauri::command]
pub fn skill_reference_details(
    state: State<'_, AppState>,
    skill_id: i64,
) -> AppResult<Vec<crate::models::ReferenceDetail>> {
    let conn = state.db.conn.lock().unwrap();
    repo::skill_reference_details(&conn, skill_id)
}

fn delete_skill_source(paths: &Paths, skill: &Skill, deleted_at: DateTime<Local>) -> AppResult<()> {
    let source = paths.checked_skill_source_dir(&skill.dir_path)?;
    if !source.exists() {
        return Ok(());
    }

    validate::ensure_contained(&paths.skills_dir(), &source)?;
    if skill.source_type != "local" {
        std::fs::remove_dir_all(source)?;
        return Ok(());
    }

    paths.ensure_layout()?;
    validate::ensure_contained(&paths.root, &paths.trash_dir())?;
    let archive_name = validate::sanitize_link_name(&skill.name)
        .or_else(|| {
            source
                .file_name()
                .and_then(|name| name.to_str())
                .and_then(validate::sanitize_link_name)
        })
        .ok_or_else(|| AppError::InvalidInput("skill has no safe archive name".into()))?;
    let target = paths.trash_dir().join(format!(
        "{archive_name}-{}",
        deleted_at.format("%Y%m%d%H%M%S")
    ));
    match std::fs::symlink_metadata(&target) {
        Ok(_) => {
            return Err(AppError::Other(format!(
                "trash destination already exists: {}",
                target.display()
            )))
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => return Err(error.into()),
    }

    std::fs::rename(source, target)?;
    Ok(())
}

#[tauri::command]
pub fn delete_skill(state: State<'_, AppState>, skill_id: i64) -> AppResult<()> {
    let conn = state.db.conn.lock().unwrap();
    let skill = repo::get_skill(&conn, skill_id)?;
    let affected = repo::projects_using_skill(&conn, skill_id)?;
    delete_skill_source(&state.paths, &skill, Local::now())?;
    // FK cascades make the row delete atomic on its own; no tx needed.
    repo::delete_skill(&conn, skill_id)?;
    repo::log_op(&conn, "delete_skill", &skill.dir_path);
    linker::sync_projects(&conn, &state.paths, &affected)?;
    Ok(())
}

// ---------- presets ----------

#[tauri::command]
pub fn list_presets(state: State<'_, AppState>) -> AppResult<Vec<Preset>> {
    let conn = state.db.conn.lock().unwrap();
    repo::list_presets(&conn)
}

#[tauri::command]
pub fn preset_project_references(
    state: State<'_, AppState>,
    preset_id: i64,
) -> AppResult<Vec<crate::models::PresetProjectReference>> {
    let conn = state.db.conn.lock().unwrap();
    repo::preset_project_references(&conn, preset_id)
}

#[tauri::command]
pub fn create_preset(
    state: State<'_, AppState>,
    name: String,
    description: Option<String>,
    source_preset_ids: Vec<i64>,
    reuse_mode: Option<PresetReuseMode>,
) -> AppResult<i64> {
    let conn = state.db.conn.lock().unwrap();
    repo::create_preset_with_sources(
        &conn,
        &name,
        description.as_deref(),
        &source_preset_ids,
        reuse_mode,
    )
}

#[tauri::command]
pub fn update_preset(
    state: State<'_, AppState>,
    preset_id: i64,
    name: String,
    description: Option<String>,
) -> AppResult<()> {
    let conn = state.db.conn.lock().unwrap();
    repo::update_preset(&conn, preset_id, &name, description.as_deref())?;
    let affected = repo::projects_using_preset(&conn, preset_id)?;
    linker::sync_projects(&conn, &state.paths, &affected)?;
    Ok(())
}

#[tauri::command]
pub fn delete_preset(state: State<'_, AppState>, preset_id: i64) -> AppResult<()> {
    let conn = state.db.conn.lock().unwrap();
    let affected = repo::projects_using_preset(&conn, preset_id)?;
    repo::delete_preset(&conn, preset_id)?;
    linker::sync_projects(&conn, &state.paths, &affected)?;
    Ok(())
}

#[tauri::command]
pub fn set_preset_skills(
    state: State<'_, AppState>,
    preset_id: i64,
    skill_ids: Vec<i64>,
) -> AppResult<()> {
    let conn = state.db.conn.lock().unwrap();
    repo::set_preset_skills(&conn, preset_id, &skill_ids)?;
    let affected = repo::projects_using_preset(&conn, preset_id)?;
    linker::sync_projects(&conn, &state.paths, &affected)?;
    Ok(())
}

#[tauri::command]
pub fn reuse_preset(
    state: State<'_, AppState>,
    preset_id: i64,
    source_preset_ids: Vec<i64>,
    mode: PresetReuseMode,
) -> AppResult<PresetReuseResult> {
    let conn = state.db.conn.lock().unwrap();
    let result = repo::reuse_preset(&conn, preset_id, &source_preset_ids, mode)?;
    let affected = repo::projects_using_preset(&conn, preset_id)?;
    linker::sync_projects(&conn, &state.paths, &affected)?;
    Ok(result)
}

#[tauri::command]
pub fn set_preset_includes(
    state: State<'_, AppState>,
    preset_id: i64,
    included_preset_ids: Vec<i64>,
) -> AppResult<()> {
    let conn = state.db.conn.lock().unwrap();
    repo::set_preset_includes(&conn, preset_id, &included_preset_ids)?;
    let affected = repo::projects_using_preset(&conn, preset_id)?;
    linker::sync_projects(&conn, &state.paths, &affected)?;
    Ok(())
}

// ---------- agents ----------

#[tauri::command]
pub fn list_agents(state: State<'_, AppState>) -> AppResult<Vec<Agent>> {
    let conn = state.db.conn.lock().unwrap();
    repo::list_agents(&conn)
}

#[tauri::command]
pub fn create_agent(
    state: State<'_, AppState>,
    name: String,
    target_dir: String,
    global_enabled: bool,
) -> AppResult<i64> {
    let name = name.trim().to_string();
    if name.is_empty() || name.len() > 50 {
        return Err(AppError::InvalidInput("agent name must be 1-50 chars".into()));
    }
    let target_dir = validate::normalize_agent_dir(&target_dir)?;
    let conn = state.db.conn.lock().unwrap();
    let id = repo::create_agent(&conn, &name, &target_dir, global_enabled)?;
    if global_enabled {
        let ids: Vec<i64> = repo::list_projects(&conn)?.iter().map(|p| p.id).collect();
        linker::sync_projects(&conn, &state.paths, &ids)?;
    }
    repo::log_op(&conn, "create_agent", &format!("{name} -> {target_dir}"));
    Ok(id)
}

#[tauri::command]
pub fn update_agent(
    state: State<'_, AppState>,
    agent_id: i64,
    name: String,
    target_dir: String,
    global_enabled: bool,
) -> AppResult<()> {
    let name = name.trim().to_string();
    if name.is_empty() || name.len() > 50 {
        return Err(AppError::InvalidInput("agent name must be 1-50 chars".into()));
    }
    let target_dir = validate::normalize_agent_dir(&target_dir)?;
    let conn = state.db.conn.lock().unwrap();
    let old = repo::get_agent(&conn, agent_id)?;
    repo::update_agent(&conn, agent_id, &name, &target_dir, global_enabled)?;
    let extras: Vec<String> = if old.target_dir != target_dir {
        vec![old.target_dir.clone()]
    } else {
        vec![]
    };
    let ids: Vec<i64> = repo::list_projects(&conn)?.iter().map(|p| p.id).collect();
    linker::sync_projects_with_sweeps(&conn, &state.paths, &ids, &extras)?;
    repo::log_op(&conn, "update_agent", &format!("#{agent_id} {name}"));
    Ok(())
}

#[tauri::command]
pub fn delete_agent(state: State<'_, AppState>, agent_id: i64) -> AppResult<()> {
    let conn = state.db.conn.lock().unwrap();
    let old = repo::get_agent(&conn, agent_id)?;
    repo::delete_agent(&conn, agent_id)?;
    let ids: Vec<i64> = repo::list_projects(&conn)?.iter().map(|p| p.id).collect();
    linker::sync_projects_with_sweeps(&conn, &state.paths, &ids, &[old.target_dir.clone()])?;
    repo::log_op(&conn, "delete_agent", &format!("{} ({})", old.name, old.target_dir));
    Ok(())
}

#[tauri::command]
pub fn set_project_agent(
    state: State<'_, AppState>,
    project_id: i64,
    agent_id: i64,
    linked: bool,
) -> AppResult<SyncReport> {
    let conn = state.db.conn.lock().unwrap();
    repo::set_project_agent(&conn, project_id, agent_id, linked)?;
    linker::sync_project(&conn, &state.paths, project_id)
}

// ---------- projects ----------

fn project_group_name(name: String) -> AppResult<String> {
    let name = name.trim().to_string();
    if name.is_empty() || name.chars().count() > 50 {
        return Err(AppError::InvalidInput(
            "project group name must be 1-50 characters".into(),
        ));
    }
    if name.eq_ignore_ascii_case("ungrouped") || name == "未分组" {
        return Err(AppError::InvalidInput(
            "project group name is reserved".into(),
        ));
    }
    Ok(name)
}

#[tauri::command]
pub fn list_project_groups(state: State<'_, AppState>) -> AppResult<Vec<ProjectGroup>> {
    let conn = state.db.conn.lock().unwrap();
    repo::list_project_groups(&conn)
}

#[tauri::command]
pub fn create_project_group(state: State<'_, AppState>, name: String) -> AppResult<i64> {
    let name = project_group_name(name)?;
    let conn = state.db.conn.lock().unwrap();
    if repo::project_group_name_exists(&conn, &name, None)? {
        return Err(AppError::InvalidInput(
            "a project group with this name already exists".into(),
        ));
    }
    let id = repo::create_project_group(&conn, &name)?;
    repo::log_op(&conn, "create_project_group", &format!("#{id} {name}"));
    Ok(id)
}

#[tauri::command]
pub fn update_project_group(
    state: State<'_, AppState>,
    group_id: i64,
    name: String,
) -> AppResult<()> {
    if group_id == 0 {
        return Err(AppError::InvalidInput(
            "the ungrouped system group cannot be renamed".into(),
        ));
    }
    let name = project_group_name(name)?;
    let conn = state.db.conn.lock().unwrap();
    if repo::project_group_name_exists(&conn, &name, Some(group_id))? {
        return Err(AppError::InvalidInput(
            "a project group with this name already exists".into(),
        ));
    }
    repo::update_project_group(&conn, group_id, &name)?;
    repo::log_op(&conn, "update_project_group", &format!("#{group_id} {name}"));
    Ok(())
}

#[tauri::command]
pub fn delete_project_group(state: State<'_, AppState>, group_id: i64) -> AppResult<usize> {
    let conn = state.db.conn.lock().unwrap();
    let moved = repo::delete_project_group(&conn, group_id)?;
    repo::log_op(
        &conn,
        "delete_project_group",
        &format!("#{group_id}, moved {moved} projects"),
    );
    Ok(moved)
}

#[tauri::command]
pub fn move_project_group(
    state: State<'_, AppState>,
    group_id: i64,
    direction: MoveDirection,
) -> AppResult<()> {
    if group_id == 0 {
        return Err(AppError::InvalidInput(
            "the ungrouped system group cannot be moved".into(),
        ));
    }
    let conn = state.db.conn.lock().unwrap();
    repo::move_project_group(&conn, group_id, direction)
}

#[tauri::command]
pub fn set_project_group_hidden(
    state: State<'_, AppState>,
    group_id: i64,
    hidden: bool,
) -> AppResult<()> {
    let conn = state.db.conn.lock().unwrap();
    repo::set_project_group_hidden(&conn, group_id, hidden)
}

#[tauri::command]
pub fn list_projects(state: State<'_, AppState>) -> AppResult<Vec<Project>> {
    let conn = state.db.conn.lock().unwrap();
    repo::list_projects(&conn)
}

#[tauri::command]
pub fn get_project(state: State<'_, AppState>, project_id: i64) -> AppResult<Project> {
    let conn = state.db.conn.lock().unwrap();
    repo::get_project(&conn, project_id)
}

#[tauri::command]
pub fn add_project(state: State<'_, AppState>, path: String) -> AppResult<i64> {
    let p = std::path::Path::new(&path);
    if !p.is_dir() {
        return Err(AppError::InvalidInput(format!("not a directory: {path}")));
    }
    let name = p
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| path.clone());
    let conn = state.db.conn.lock().unwrap();
    repo::create_project(&conn, &name, &path)
}

#[tauri::command]
pub fn set_project_group(
    state: State<'_, AppState>,
    project_id: i64,
    group_id: i64,
) -> AppResult<()> {
    let conn = state.db.conn.lock().unwrap();
    repo::set_project_group(&conn, project_id, group_id)
}

#[tauri::command]
pub fn set_projects_group(
    state: State<'_, AppState>,
    project_ids: Vec<i64>,
    group_id: i64,
) -> AppResult<usize> {
    let conn = state.db.conn.lock().unwrap();
    repo::set_projects_group(&conn, &project_ids, group_id)
}

#[tauri::command]
pub fn move_project(
    state: State<'_, AppState>,
    project_id: i64,
    direction: MoveDirection,
) -> AppResult<()> {
    let conn = state.db.conn.lock().unwrap();
    repo::move_project(&conn, project_id, direction)
}

#[tauri::command]
pub fn set_project_hidden(
    state: State<'_, AppState>,
    project_id: i64,
    hidden: bool,
) -> AppResult<()> {
    let conn = state.db.conn.lock().unwrap();
    repo::set_project_hidden(&conn, project_id, hidden)
}

#[tauri::command]
pub fn delete_project(state: State<'_, AppState>, project_id: i64) -> AppResult<()> {
    let conn = state.db.conn.lock().unwrap();
    let project = repo::get_project(&conn, project_id)?;
    // Clean up our links, then forget the project. User files stay untouched.
    // Cleanup failure doesn't block the delete (user intent wins), but leftover
    // links are invisible afterwards, so record what happened.
    let desired = std::collections::BTreeMap::new();
    let project_path = std::path::Path::new(&project.path);
    if let Err(e) = linker::sync_project_links(
        project_path,
        &desired,
        &state.paths.skills_dir(),
    ) {
        tracing::warn!(project_path = %project.path, error = %e, "project link cleanup failed");
        repo::log_op(
            &conn,
            "delete_project_warning",
            &format!("link cleanup failed for {}: {e}", project.path),
        );
    }
    // Also sweep all agent directories for this project.
    let agents = repo::list_agents(&conn)?;
    for agent in &agents {
        if let Err(e) = linker::sync_links_dir(
            &project_path.join(&agent.target_dir),
            &desired,
            &state.paths.skills_dir(),
            false,
        ) {
            tracing::warn!(
                project_path = %project.path,
                agent_dir = %agent.target_dir,
                error = %e,
                "project agent directory cleanup failed"
            );
        }
    }
    repo::delete_project(&conn, project_id)?;
    Ok(())
}

#[tauri::command]
pub fn set_project_preset(
    state: State<'_, AppState>,
    project_id: i64,
    preset_id: i64,
    linked: bool,
) -> AppResult<SyncReport> {
    let conn = state.db.conn.lock().unwrap();
    repo::set_project_preset(&conn, project_id, preset_id, linked)?;
    linker::sync_project(&conn, &state.paths, project_id)
}

#[tauri::command]
pub fn set_project_skill(
    state: State<'_, AppState>,
    project_id: i64,
    skill_id: i64,
    linked: bool,
) -> AppResult<SyncReport> {
    let conn = state.db.conn.lock().unwrap();
    repo::set_project_skill(&conn, project_id, skill_id, linked)?;
    linker::sync_project(&conn, &state.paths, project_id)
}

#[tauri::command]
pub fn effective_skills(
    state: State<'_, AppState>,
    project_id: i64,
) -> AppResult<Vec<EffectiveSkill>> {
    let conn = state.db.conn.lock().unwrap();
    linker::effective_skills(&conn, project_id)
}

#[tauri::command]
pub fn sync_project(state: State<'_, AppState>, project_id: i64) -> AppResult<SyncReport> {
    let conn = state.db.conn.lock().unwrap();
    linker::sync_project(&conn, &state.paths, project_id)
}

/// Append `.agents/skills/` and active agent dirs to the project's .gitignore if not already present.
#[tauri::command]
pub fn gitignore_links(state: State<'_, AppState>, project_id: i64) -> AppResult<()> {
    let conn = state.db.conn.lock().unwrap();
    let project = repo::get_project(&conn, project_id)?;
    let plan = repo::agent_dir_plan(&conn, project_id)?;
    let mut dirs: Vec<String> = vec![linker::DEFAULT_LINKS_DIR.to_string()];
    for (dir, active) in &plan {
        if *active {
            dirs.push(dir.clone());
        }
    }
    let gitignore = std::path::Path::new(&project.path).join(".gitignore");
    let existing = std::fs::read_to_string(&gitignore).unwrap_or_default();
    if let Some(content) = gitignore_append(&existing, &dirs) {
        std::fs::write(&gitignore, content)?;
    }
    Ok(())
}

/// Pure helper: returns Some(new content) if any dirs need appending, None otherwise.
fn gitignore_append(existing: &str, dirs: &[String]) -> Option<String> {
    let mut to_add: Vec<&String> = vec![];
    for dir in dirs {
        let variants = [
            dir.clone(),
            format!("{dir}/"),
            format!("/{dir}"),
            format!("/{dir}/"),
        ];
        let already = existing.lines().any(|l| variants.contains(&l.trim().to_string()));
        if !already {
            to_add.push(dir);
        }
    }
    if to_add.is_empty() {
        return None;
    }
    let mut content = existing.to_string();
    if !content.is_empty() && !content.ends_with('\n') {
        content.push('\n');
    }
    for dir in to_add {
        content.push_str(&format!("{dir}/\n"));
    }
    Some(content)
}

// ---------- doctor & settings ----------

#[tauri::command]
pub fn doctor_scan(state: State<'_, AppState>) -> AppResult<Vec<BrokenLink>> {
    let conn = state.db.conn.lock().unwrap();
    linker::doctor_scan(&conn, &state.paths)
}

#[tauri::command]
pub fn doctor_fix(state: State<'_, AppState>) -> AppResult<usize> {
    let conn = state.db.conn.lock().unwrap();
    linker::doctor_fix(&conn, &state.paths)
}

#[tauri::command]
pub async fn get_git_cache_info(state: State<'_, AppState>) -> AppResult<GitCacheInfo> {
    let paths = state.paths.clone();
    tauri::async_runtime::spawn_blocking(move || git_cache::cache_info(&paths))
        .await
        .map_err(|_| AppError::Other("Git cache inspection task failed".into()))?
        .map_err(|error| AppError::Other(error.to_string()))
}

#[tauri::command]
pub async fn clear_git_cache(state: State<'_, AppState>) -> AppResult<()> {
    if state.skill_installs.active_count() > 0 || state.skill_updates.active_count() > 0 {
        return Err(AppError::InvalidInput(
            "cannot clear Git cache while skill network operations are running".into(),
        ));
    }
    let paths = state.paths.clone();
    tauri::async_runtime::spawn_blocking(move || git_cache::clear_all(&paths))
        .await
        .map_err(|_| AppError::Other("Git cache cleanup task failed".into()))?
        .map_err(|error| AppError::Other(error.to_string()))
}

#[tauri::command]
pub fn get_setting(state: State<'_, AppState>, key: String) -> AppResult<Option<String>> {
    let conn = state.db.conn.lock().unwrap();
    repo::get_setting(&conn, &key)
}

fn system_language_from_locale(locale: Option<&str>) -> &'static str {
    match locale {
        Some(locale) if locale.get(..2).is_some_and(|prefix| prefix.eq_ignore_ascii_case("zh")) => "zh",
        _ => "en",
    }
}

#[tauri::command]
pub fn get_system_language() -> String {
    system_language_from_locale(sys_locale::get_locale().as_deref()).to_owned()
}

/// Validate a custom storage directory and return its canonical path.
fn validate_storage_dir(value: &str) -> AppResult<std::path::PathBuf> {
    let path = std::path::Path::new(value);
    if !path.exists() {
        return Err(AppError::InvalidInput(
            "Storage directory does not exist. Please create it first.".to_string(),
        ));
    }
    if !path.is_dir() {
        return Err(AppError::InvalidInput(
            "Specified path is not a directory.".to_string(),
        ));
    }
    Ok(platform_link::normalize(path.canonicalize()?))
}

#[tauri::command]
pub fn set_setting(state: State<'_, AppState>, key: String, value: String) -> AppResult<()> {
    if key == "storage_dir" {
        return Err(AppError::InvalidInput(
            "storage_dir must be changed through set_storage_dir".into(),
        ));
    }
    let conn = state.db.conn.lock().unwrap();
    repo::set_setting(&conn, &key, &value)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageInfo {
    current_dir: String,
    configured_dir: String,
    is_default: bool,
    restart_required: bool,
}

fn storage_info(state: &AppState) -> AppResult<StorageInfo> {
    let configured = bootstrap::load_storage_root(&state.bootstrap_config_file)?;
    let default = bootstrap::default_storage_root()?;
    Ok(StorageInfo {
        current_dir: state.paths.root.to_string_lossy().into_owned(),
        configured_dir: configured.to_string_lossy().into_owned(),
        is_default: configured == default,
        restart_required: configured != state.paths.root,
    })
}

#[tauri::command]
pub fn get_storage_dir(state: State<'_, AppState>) -> AppResult<StorageInfo> {
    storage_info(&state)
}

/// Persist a storage directory for the next application start.
#[tauri::command]
pub fn set_storage_dir(state: State<'_, AppState>, dir_path: String) -> AppResult<StorageInfo> {
    let storage_root = if dir_path.is_empty() {
        None
    } else {
        Some(validate_storage_dir(&dir_path)?)
    };
    bootstrap::save_storage_root(&state.bootstrap_config_file, storage_root.as_deref())?;
    tracing::info!("storage root updated; restart required");
    storage_info(&state)
}

#[tauri::command]
pub fn open_console_dir(app: tauri::AppHandle, state: State<'_, AppState>) -> AppResult<()> {
    app.opener()
        .open_path(state.paths.root.to_string_lossy(), None::<&str>)
        .map_err(|e| AppError::Other(e.to_string()))
}

#[tauri::command]
pub fn open_logs_dir(app: tauri::AppHandle, state: State<'_, AppState>) -> AppResult<()> {
    std::fs::create_dir_all(state.paths.logs_dir())?;
    app.opener()
        .open_path(state.paths.logs_dir().to_string_lossy(), None::<&str>)
        .map_err(|error| AppError::Other(error.to_string()))
}

#[tauri::command]
pub fn export_diagnostics(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> AppResult<String> {
    let (github_token_configured, last_check) = {
        let conn = state.db.conn.lock().unwrap();
        let token = repo::get_setting(&conn, "github_token")?;
        let last_check = repo::get_setting(&conn, "last_skill_update_check_at")?;
        (token.is_some_and(|value| !value.is_empty()), last_check)
    };
    let output = diagnostics::export(
        &state.paths,
        &app.package_info().version.to_string(),
        github_token_configured,
        last_check.as_deref(),
    )?;
    tracing::info!(path = %output.display(), "diagnostic bundle exported");
    Ok(output.to_string_lossy().into_owned())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FrontendLogEvent {
    level: String,
    message: String,
    stack: Option<String>,
    source: Option<String>,
}

fn sanitize_frontend_log(value: &str, max_chars: usize) -> String {
    value
        .lines()
        .map(|line| {
            let lowercase = line.to_ascii_lowercase();
            if ["authorization", "github_token", "password", "secret", "token="]
                .iter()
                .any(|needle| lowercase.contains(needle))
            {
                "[redacted sensitive line]"
            } else {
                line
            }
        })
        .collect::<Vec<_>>()
        .join("\n")
        .chars()
        .take(max_chars)
        .collect()
}

#[tauri::command]
pub fn log_frontend_event(event: FrontendLogEvent) -> AppResult<()> {
    let message = sanitize_frontend_log(&event.message, 4_000);
    let stack = event
        .stack
        .as_deref()
        .map(|value| sanitize_frontend_log(value, 16_000));
    let source = event
        .source
        .as_deref()
        .map(|value| sanitize_frontend_log(value, 500));

    match event.level.as_str() {
        "debug" => tracing::debug!(target: "frontend", %message, ?source, ?stack),
        "info" => tracing::info!(target: "frontend", %message, ?source, ?stack),
        "warn" => tracing::warn!(target: "frontend", %message, ?source, ?stack),
        "error" => tracing::error!(target: "frontend", %message, ?source, ?stack),
        _ => {
            return Err(AppError::InvalidInput(
                "frontend log level must be debug, info, warn, or error".into(),
            ))
        }
    }
    Ok(())
}

#[tauri::command]
pub fn open_skill_dir(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    skill_id: i64,
) -> AppResult<()> {
    let conn = state.db.conn.lock().unwrap();
    let skill = repo::get_skill(&conn, skill_id)?;
    let path = state.paths.checked_skill_source_dir(&skill.dir_path)?;
    app.opener()
        .open_path(path.to_string_lossy(), None::<&str>)
        .map_err(|e| AppError::Other(e.to_string()))
}

#[tauri::command]
pub fn open_path(app: tauri::AppHandle, path: String) -> AppResult<()> {
    app.opener()
        .open_path(path, None::<&str>)
        .map_err(|e| AppError::Other(e.to_string()))
}

/// Verify a GitHub token without persisting it.
#[tauri::command]
pub async fn verify_github_token(state: State<'_, AppState>, token: String) -> AppResult<bool> {
    let token = token.trim();
    if token.is_empty() {
        return Ok(false);
    }

    let url = "https://api.github.com/user";
    let resp = state.client.get(url).bearer_auth(token).send().await?;

    match resp.status().as_u16() {
        200 => Ok(true),
        401 => Err(AppError::InvalidToken(
            "Token is invalid or expired".to_string(),
        )),
        403 => {
            // Could be rate limited or token has no scopes
            // Try checking rate limit endpoint for more info
            let rate_resp = state
                .client
                .get("https://api.github.com/rate_limit")
                .bearer_auth(token)
                .send()
                .await?;

            if rate_resp.status().as_u16() == 200 {
                Ok(false) // Token works but we hit rate limit (should not happen on single request)
            } else {
                Err(AppError::InvalidToken(
                    "Token is invalid or has insufficient scopes".to_string(),
                ))
            }
        }
        s => Err(AppError::InvalidToken(format!(
            "GitHub returned status {s}"
        ))),
    }
}

// ---------- Profile Export/Import ----------

/// Export current skills and portable preset relationships to JSON.
#[tauri::command]
pub fn export_profile(state: State<'_, AppState>) -> AppResult<String> {
    let conn = state.db.conn.lock().unwrap();
    importer::export_profile(&conn)
}

/// Save an already prepared profile snapshot to a user-selected file.
#[tauri::command]
pub fn save_profile_file(path: String, profile_json: String) -> AppResult<()> {
    importer::save_profile_file(std::path::Path::new(&path), &profile_json)
}

/// Preview a profile import without changing the database.
#[tauri::command]
pub fn preview_profile_import(
    state: State<'_, AppState>,
    profile_json: String,
) -> AppResult<crate::models::ProfileImportPreview> {
    let conn = state.db.conn.lock().unwrap();
    importer::preview_profile_import(&conn, &profile_json)
}

/// Import a profile from JSON string
#[tauri::command]
pub fn import_profile(state: State<'_, AppState>, profile_json: String) -> AppResult<ImportResult> {
    let conn = state.db.conn.lock().unwrap();
    let result = importer::import_profile(&conn, &profile_json)?;
    let project_ids = repo::list_projects(&conn)?
        .into_iter()
        .map(|project| project.id)
        .collect::<Vec<_>>();
    linker::sync_projects(&conn, &state.paths, &project_ids)?;
    Ok(result)
}

#[cfg(test)]
mod tests {
    use chrono::TimeZone;

    use super::*;

    fn test_skill(name: &str, source_type: &str, dir_path: &str) -> Skill {
        Skill {
            id: 1,
            name: name.into(),
            source_type: source_type.into(),
            install_source: None,
            owner: None,
            repo: None,
            dir_path: dir_path.into(),
            description: None,
            latest_sha: None,
            source_path: None,
            tree_sha: None,
            status: "ok".into(),
            updated_at: "2027-08-01T20:20:00".into(),
            source_url: None,
            github_source: None,
        }
    }

    #[test]
    fn delete_skill_source_moves_local_skill_to_timestamped_trash_directory() {
        let temp = tempfile::tempdir().unwrap();
        let paths = Paths::with_root(temp.path().to_path_buf());
        paths.ensure_layout().unwrap();
        let source = paths.local_dir().join("longan-release");
        std::fs::create_dir_all(&source).unwrap();
        std::fs::write(source.join("SKILL.md"), "recover me").unwrap();
        let skill = test_skill("longan-release", "local", "local/longan-release");
        let deleted_at = Local
            .with_ymd_and_hms(2027, 8, 1, 20, 20, 0)
            .single()
            .unwrap();

        delete_skill_source(&paths, &skill, deleted_at).unwrap();

        let archived = paths
            .trash_dir()
            .join("longan-release-20270801202000")
            .join("SKILL.md");
        assert_eq!(
            (source.exists(), std::fs::read_to_string(archived).unwrap()),
            (false, "recover me".into())
        );
    }

    #[test]
    fn delete_skill_source_preserves_local_source_when_trash_target_exists() {
        let temp = tempfile::tempdir().unwrap();
        let paths = Paths::with_root(temp.path().to_path_buf());
        paths.ensure_layout().unwrap();
        let source = paths.local_dir().join("longan-release");
        std::fs::create_dir_all(&source).unwrap();
        let target = paths.trash_dir().join("longan-release-20270801202000");
        std::fs::create_dir_all(&target).unwrap();
        std::fs::write(target.join("marker"), "existing archive").unwrap();
        let skill = test_skill("longan-release", "local", "local/longan-release");
        let deleted_at = Local
            .with_ymd_and_hms(2027, 8, 1, 20, 20, 0)
            .single()
            .unwrap();

        let result = delete_skill_source(&paths, &skill, deleted_at);

        assert!(result.is_err());
        assert!(source.exists());
        assert_eq!(
            std::fs::read_to_string(target.join("marker")).unwrap(),
            "existing archive"
        );
    }

    #[test]
    fn delete_skill_source_physically_removes_network_skill() {
        let temp = tempfile::tempdir().unwrap();
        let paths = Paths::with_root(temp.path().to_path_buf());
        paths.ensure_layout().unwrap();
        let source = paths.net_dir().join("owner/repo/network-skill");
        std::fs::create_dir_all(&source).unwrap();
        let skill = test_skill(
            "network-skill",
            "net",
            "net/owner/repo/network-skill",
        );

        delete_skill_source(&paths, &skill, Local::now()).unwrap();

        assert!(!source.exists());
    }

    #[test]
    fn update_slots_reject_duplicates_and_third_concurrent_update() {
        let updates = SkillUpdateCoordinator::default();

        assert!(updates.reserve(1).is_ok());
        assert!(updates.reserve(1).is_err());
        assert!(updates.reserve(2).is_ok());
        assert!(updates.reserve(3).is_err());

        updates.finish(1);
        assert!(updates.reserve(3).is_ok());
    }

    #[test]
    fn install_slots_reject_duplicate_operations_targets_and_third_install() {
        let installs = SkillInstallCoordinator::default();

        assert!(installs.reserve("operation-1", "owner/repo/one").is_ok());
        assert!(installs.reserve("operation-1", "owner/repo/two").is_err());
        assert!(installs.reserve("operation-2", "owner/repo/one").is_err());
        assert!(installs.reserve("operation-2", "owner/repo/two").is_ok());
        assert!(installs.reserve("operation-3", "owner/repo/three").is_err());

        installs.finish("operation-1");
        assert!(installs.reserve("operation-3", "owner/repo/three").is_ok());
    }

    #[test]
    fn install_cancellation_stops_running_but_not_finalizing_tasks() {
        let installs = SkillInstallCoordinator::default();
        let running = installs
            .reserve("operation-1", "owner/repo/one")
            .unwrap();
        let finalizing = installs
            .reserve("operation-2", "owner/repo/two")
            .unwrap();
        assert!(!installs.begin_finalize("operation-2"));

        assert!(installs.cancel("operation-1"));
        assert!(!installs.cancel("operation-2"));
        assert!(running.load(Ordering::Acquire));
        assert!(!finalizing.load(Ordering::Acquire));
        assert!(installs.begin_finalize("operation-1"));
    }

    #[test]
    fn cancelling_all_installs_only_marks_cancellable_tasks() {
        let installs = SkillInstallCoordinator::default();
        let running = installs
            .reserve("operation-1", "owner/repo/one")
            .unwrap();
        let finalizing = installs
            .reserve("operation-2", "owner/repo/two")
            .unwrap();
        assert!(!installs.begin_finalize("operation-2"));

        assert_eq!(installs.cancel_all(), 1);
        assert!(running.load(Ordering::Acquire));
        assert!(!finalizing.load(Ordering::Acquire));
    }

    #[test]
    fn cancelling_updates_marks_running_tokens_but_not_finalizing_tasks() {
        let updates = SkillUpdateCoordinator::default();
        let running = updates.reserve(1).unwrap();
        let finalizing = updates.reserve(2).unwrap();
        assert!(!updates.begin_finalize(2));

        assert_eq!(updates.cancel_all(), 1);
        assert!(running.load(Ordering::Acquire));
        assert!(!finalizing.load(Ordering::Acquire));
        assert!(updates.begin_finalize(1));
        assert!(updates.reserve(3).is_err());
    }

    #[test]
    fn startup_check_runs_with_a_configured_token() {
        assert!(should_run_update_check(
            UpdateCheckTrigger::Startup,
            true,
            false,
        ));
    }

    #[test]
    fn missing_github_token_is_not_configured() {
        assert_eq!(normalize_github_token(None), None);
    }

    #[test]
    fn whitespace_github_token_is_not_configured() {
        assert_eq!(normalize_github_token(Some("  \n".into())), None);
    }

    #[test]
    fn configured_github_token_is_trimmed() {
        assert_eq!(
            normalize_github_token(Some("  github-token  ".into())),
            Some("github-token".into()),
        );
    }

    #[test]
    fn system_language_maps_chinese_locales_to_chinese() {
        assert_eq!(system_language_from_locale(Some("zh-CN")), "zh");
        assert_eq!(system_language_from_locale(Some("zh_Hant_TW")), "zh");
    }

    #[test]
    fn system_language_maps_other_or_missing_locales_to_english() {
        assert_eq!(system_language_from_locale(Some("en-US")), "en");
        assert_eq!(system_language_from_locale(Some("ja-JP")), "en");
        assert_eq!(system_language_from_locale(None), "en");
    }

    #[test]
    fn startup_check_waits_for_the_interval_without_a_token() {
        assert!(!should_run_update_check(
            UpdateCheckTrigger::Startup,
            false,
            false,
        ));
    }

    #[test]
    fn scheduled_check_waits_for_the_interval_with_a_token() {
        assert!(!should_run_update_check(
            UpdateCheckTrigger::Scheduled,
            true,
            false,
        ));
    }

    #[test]
    fn scheduled_check_runs_after_the_interval() {
        assert!(should_run_update_check(
            UpdateCheckTrigger::Scheduled,
            false,
            true,
        ));
    }

    #[test]
    fn download_progress_maps_into_its_workflow_range() {
        let update = installer::InstallProgress {
            phase: installer::InstallPhase::Downloading,
            progress_percent: None,
            downloaded_bytes: Some(50),
            total_bytes: Some(100),
        };

        assert_eq!(install_progress_value(update), ("downloading", 37));
        assert_eq!(
            install_progress_value(installer::InstallProgress {
                phase: installer::InstallPhase::Downloading,
                progress_percent: Some(40),
                downloaded_bytes: Some(1_024),
                total_bytes: None,
            }),
            ("downloading", 32)
        );
        assert_eq!(
            install_progress_value(installer::InstallProgress {
                phase: installer::InstallPhase::Extracting,
                progress_percent: None,
                downloaded_bytes: None,
                total_bytes: None,
            }),
            ("extracting", 70)
        );
    }

    #[test]
    fn frontend_logs_redact_sensitive_lines_and_are_bounded() {
        let input = "ordinary line\nAuthorization: Bearer abc\ntoken=secret\nend";
        let sanitized = sanitize_frontend_log(input, 40);

        assert!(sanitized.starts_with("ordinary line\n[redacted sensitive line]"));
        assert!(!sanitized.contains("Bearer abc"));
        assert!(!sanitized.contains("secret"));
        assert_eq!(sanitized.chars().count(), 40);
    }

    #[test]
    fn install_progress_event_serializes_for_frontend_listener() {
        let event = SkillInstallProgressEvent {
            operation_id: "operation-1",
            phase: "downloading",
            progress_percent: Some(25),
            downloaded_bytes: Some(1024),
            total_bytes: Some(4096),
            error: None,
        };

        assert_eq!(
            serde_json::to_value(event).unwrap(),
            serde_json::json!({
                "operationId": "operation-1",
                "phase": "downloading",
                "progressPercent": 25,
                "downloadedBytes": 1024,
                "totalBytes": 4096,
                "error": null
            })
        );
    }
}
