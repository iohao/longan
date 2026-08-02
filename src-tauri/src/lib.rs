mod bootstrap;
mod commands;
mod db;
mod diagnostics;
mod error;
mod logging;
mod models;
mod paths;
mod services;
mod validate;

use std::time::Duration;

use commands::AppState;
use db::Db;
use paths::Paths;
use tauri::{Emitter, Manager};

const AUTO_UPDATE_CHECK_POLL_INTERVAL: Duration = Duration::from_secs(5 * 60);

async fn run_automatic_update_check(
    handle: &tauri::AppHandle,
    trigger: commands::UpdateCheckTrigger,
) {
    let state = handle.state::<AppState>();
    match commands::check_updates_internal(&state, trigger).await {
        Ok(commands::UpdateCheckOutcome::Completed(_)) => {
            let _ = handle.emit("skills-changed", ());
        }
        Ok(commands::UpdateCheckOutcome::Skipped) => {}
        Err(error) => {
            tracing::warn!(%error, ?trigger, "automatic skill update check failed");
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    if let Err(error) = run_inner() {
        eprintln!("Longan failed to start: {error}");
    }
}

fn run_inner() -> Result<(), Box<dyn std::error::Error>> {
    let bootstrap_config_file = bootstrap::config_file()?;
    let (storage_root, bootstrap_warning) = match bootstrap::load_storage_root(&bootstrap_config_file)
    {
        Ok(root) => (root, None),
        Err(error) => (bootstrap::default_storage_root()?, Some(error)),
    };
    let paths = Paths::with_root(storage_root);
    paths.ensure_layout()?;
    logging::init(&paths.logs_dir())?;
    if let Some(error) = bootstrap_warning {
        tracing::error!(%error, "storage bootstrap config is invalid; using the default root");
    }
    tracing::info!("starting Longan");

    let db = Db::open(&paths.db_file())?;
    
    let state = AppState {
        db,
        paths,
        client: services::github::client()?,
        update_checks: tokio::sync::Mutex::new(()),
        skill_installs: commands::SkillInstallCoordinator::default(),
        skill_updates: commands::SkillUpdateCoordinator::default(),
        bootstrap_config_file,
    };

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(state)
        .setup(|app| {
            // Best-effort startup scan & background update check.
            // Runs off the main thread so the window appears immediately.
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let handle_clone = handle.clone();
                let _ = tauri::async_runtime::spawn_blocking(move || {
                    let state = handle_clone.state::<AppState>();
                    {
                        let conn = state.db.conn.lock().unwrap();
                        let _ = services::installer::recover_interrupted_updates(&conn, &state.paths);
                        let _ = services::scanner::rescan(&conn, &state.paths);
                    }
                    let _ = handle_clone.emit("skills-changed", ());
                })
                .await;

                run_automatic_update_check(&handle, commands::UpdateCheckTrigger::Startup).await;

                let mut poll_interval = tokio::time::interval_at(
                    tokio::time::Instant::now() + AUTO_UPDATE_CHECK_POLL_INTERVAL,
                    AUTO_UPDATE_CHECK_POLL_INTERVAL,
                );
                poll_interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
                loop {
                    poll_interval.tick().await;
                    run_automatic_update_check(
                        &handle,
                        commands::UpdateCheckTrigger::Scheduled,
                    )
                    .await;
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::search_registry,
            commands::install_skill,
            commands::cancel_skill_install,
            commands::cancel_skill_installs,
            commands::list_skills,
            commands::rescan_local,
            commands::preview_local_skill,
            commands::import_local_skill,
            commands::check_updates,
            commands::update_skill,
            commands::update_skills,
            commands::cancel_skill_updates,
            commands::skill_references,
            commands::skill_reference_details,
            commands::delete_skill,
            commands::list_presets,
            commands::preset_project_references,
            commands::create_preset,
            commands::update_preset,
            commands::delete_preset,
            commands::set_preset_skills,
            commands::reuse_preset,
            commands::set_preset_includes,
            commands::list_agents,
            commands::create_agent,
            commands::update_agent,
            commands::delete_agent,
            commands::set_project_agent,
            commands::list_project_groups,
            commands::create_project_group,
            commands::update_project_group,
            commands::delete_project_group,
            commands::move_project_group,
            commands::set_project_group_hidden,
            commands::list_projects,
            commands::get_project,
            commands::add_project,
            commands::delete_project,
            commands::set_project_group,
            commands::set_projects_group,
            commands::move_project,
            commands::set_project_hidden,
            commands::set_project_preset,
            commands::set_project_skill,
            commands::effective_skills,
            commands::sync_project,
            commands::gitignore_links,
            commands::doctor_scan,
            commands::doctor_fix,
            commands::get_git_cache_info,
            commands::clear_git_cache,
            commands::verify_github_token,
            commands::get_setting,
            commands::get_system_language,
            commands::set_setting,
            commands::get_storage_dir,
            commands::set_storage_dir,
            commands::open_console_dir,
            commands::open_logs_dir,
            commands::export_diagnostics,
            commands::log_frontend_event,
            commands::open_skill_dir,
            commands::open_path,
            commands::export_profile,
            commands::save_profile_file,
            commands::preview_profile_import,
            commands::import_profile,
        ])
        .run(tauri::generate_context!())?;
    Ok(())
}
