//! Profile transfer using portable skill paths and preset names.

use std::collections::{BTreeMap, HashMap, HashSet};
use std::path::Path;

use rusqlite::{params, Connection, OptionalExtension};

use crate::db::{self, repo};
use crate::error::{AppError, AppResult};
use crate::models::{
    ExportPreset, ExportProfile, ImportResult, ProfileImportPreview, ProfileImportSkill, Skill,
    UnresolvedPresetSkill,
};

const PROFILE_VERSION: &str = "2.0";

struct ProfileSkillResolution {
    available: HashMap<String, i64>,
    skipped: Vec<String>,
    matched: Vec<ProfileImportSkill>,
    missing: Vec<ProfileImportSkill>,
}

pub fn import_profile(conn: &Connection, profile_json: &str) -> AppResult<ImportResult> {
    let profile = parse_profile(profile_json)?;
    validate_profile_presets(conn, &profile.presets)?;
    let skill_resolution = resolve_profile_skills(conn, &profile.skills)?;
    let (created_presets, unresolved_preset_skills) = db::with_tx(conn, |conn| {
        restore_presets(conn, &profile.presets, &skill_resolution.available)
    })?;

    Ok(ImportResult {
        success: true,
        imported_skills: Vec::new(),
        skipped_skills: skill_resolution.skipped,
        installed_from_source: Vec::new(),
        created_presets,
        unresolved_preset_skills,
        error: None,
    })
}

pub fn preview_profile_import(
    conn: &Connection,
    profile_json: &str,
) -> AppResult<ProfileImportPreview> {
    let profile = parse_profile(profile_json)?;
    let existing_preset_names = validate_profile_presets(conn, &profile.presets)?;
    let skill_resolution = resolve_profile_skills(conn, &profile.skills)?;

    let mut new_presets = Vec::new();
    let mut replaced_presets = Vec::new();
    let mut unresolved_preset_skills = Vec::new();

    for preset in &profile.presets {
        if existing_preset_names.contains(&preset.name) {
            replaced_presets.push(preset.name.clone());
        } else {
            new_presets.push(preset.name.clone());
        }

        for skill_ref in &preset.direct_skill_refs {
            if !skill_resolution.available.contains_key(skill_ref) {
                unresolved_preset_skills.push(UnresolvedPresetSkill {
                    preset_name: preset.name.clone(),
                    skill_ref: skill_ref.clone(),
                });
            }
        }
    }

    Ok(ProfileImportPreview {
        version: profile.version,
        export_date: profile.export_date,
        matched_skills: skill_resolution.matched,
        missing_skills: skill_resolution.missing,
        new_presets,
        replaced_presets,
        unresolved_preset_skills,
    })
}

fn parse_profile(profile_json: &str) -> AppResult<ExportProfile> {
    let profile: ExportProfile = serde_json::from_str(profile_json)
        .map_err(|error| AppError::InvalidInput(format!("invalid profile JSON: {error}")))?;
    if profile.version != PROFILE_VERSION {
        return Err(AppError::InvalidInput(format!(
            "unsupported profile version: {}",
            profile.version
        )));
    }
    Ok(profile)
}

fn validate_profile_presets(
    conn: &Connection,
    imported_presets: &[ExportPreset],
) -> AppResult<HashSet<String>> {
    let existing_presets = repo::list_presets(conn)?;
    let existing_names_by_id: HashMap<i64, &str> = existing_presets
        .iter()
        .map(|preset| (preset.id, preset.name.as_str()))
        .collect();
    let existing_names: HashSet<String> = existing_presets
        .iter()
        .map(|preset| preset.name.clone())
        .collect();

    let mut imported_names = HashSet::new();
    for preset in imported_presets {
        if preset.name.trim().is_empty() {
            return Err(AppError::InvalidInput(
                "profile contains an empty preset name".into(),
            ));
        }
        if !imported_names.insert(preset.name.clone()) {
            return Err(AppError::InvalidInput(format!(
                "profile contains duplicate preset: {}",
                preset.name
            )));
        }

        let mut included_names = HashSet::new();
        for included_name in &preset.included_preset_names {
            if !included_names.insert(included_name) {
                return Err(AppError::InvalidInput(format!(
                    "profile preset '{}' includes '{}' more than once",
                    preset.name, included_name
                )));
            }
        }
    }

    let mut graph = BTreeMap::<String, Vec<String>>::new();
    for preset in &existing_presets {
        if imported_names.contains(&preset.name) {
            continue;
        }
        let included_names = preset
            .included_preset_ids
            .iter()
            .filter_map(|id| existing_names_by_id.get(id).map(|name| (*name).to_string()))
            .collect();
        graph.insert(preset.name.clone(), included_names);
    }
    for preset in imported_presets {
        graph.insert(preset.name.clone(), preset.included_preset_names.clone());
    }

    for included_names in graph.values() {
        for included_name in included_names {
            if !graph.contains_key(included_name) {
                return Err(AppError::InvalidInput(format!(
                    "profile references missing preset: {included_name}"
                )));
            }
        }
    }

    let mut visiting = HashSet::new();
    let mut visited = HashSet::new();
    for preset_name in graph.keys() {
        if preset_graph_has_cycle(preset_name, &graph, &mut visiting, &mut visited) {
            return Err(AppError::InvalidInput(
                "profile preset composition contains a cycle".into(),
            ));
        }
    }

    Ok(existing_names)
}

fn preset_graph_has_cycle(
    preset_name: &str,
    graph: &BTreeMap<String, Vec<String>>,
    visiting: &mut HashSet<String>,
    visited: &mut HashSet<String>,
) -> bool {
    if visited.contains(preset_name) {
        return false;
    }
    if !visiting.insert(preset_name.to_string()) {
        return true;
    }

    let has_cycle = graph.get(preset_name).is_some_and(|included_names| {
        included_names
            .iter()
            .any(|included_name| preset_graph_has_cycle(included_name, graph, visiting, visited))
    });
    visiting.remove(preset_name);
    visited.insert(preset_name.to_string());
    has_cycle
}

fn resolve_profile_skills(
    conn: &Connection,
    profile_skills: &[Skill],
) -> AppResult<ProfileSkillResolution> {
    let mut available = HashMap::new();
    let mut skipped = Vec::new();
    let mut matched = Vec::new();
    let mut missing = Vec::new();

    for skill in profile_skills {
        if let Some(existing) = repo::find_skill_by_dir_path(conn, &skill.dir_path)? {
            available.insert(skill.dir_path.clone(), existing.id);
            skipped.push(existing.name);
            matched.push(ProfileImportSkill {
                name: skill.name.clone(),
                dir_path: skill.dir_path.clone(),
            });
        } else {
            missing.push(ProfileImportSkill {
                name: skill.name.clone(),
                dir_path: skill.dir_path.clone(),
            });
        }
    }
    Ok(ProfileSkillResolution {
        available,
        skipped,
        matched,
        missing,
    })
}

fn restore_presets(
    conn: &Connection,
    presets: &[ExportPreset],
    available_skills: &HashMap<String, i64>,
) -> AppResult<(Vec<String>, Vec<String>)> {
    let mut preset_ids = BTreeMap::new();
    for preset in presets {
        conn.execute(
            r#"
            INSERT INTO presets (name, description) VALUES (?1, ?2)
            ON CONFLICT(name) DO UPDATE SET description = excluded.description
            "#,
            params![preset.name, preset.description],
        )?;
        let id = conn.query_row(
            "SELECT id FROM presets WHERE name = ?1",
            params![preset.name],
            |row| row.get::<_, i64>(0),
        )?;
        preset_ids.insert(preset.name.clone(), id);
    }

    let mut unresolved = Vec::new();
    for preset in presets {
        let preset_id = preset_ids.get(&preset.name).copied().ok_or_else(|| {
            AppError::InvalidInput(format!("profile preset was not prepared: {}", preset.name))
        })?;
        conn.execute(
            "DELETE FROM preset_skills WHERE preset_id = ?1",
            params![preset_id],
        )?;
        conn.execute(
            "DELETE FROM preset_includes WHERE preset_id = ?1",
            params![preset_id],
        )?;

        for skill_ref in &preset.direct_skill_refs {
            let skill_id = if let Some(skill_id) = available_skills.get(skill_ref) {
                Some(*skill_id)
            } else {
                conn.query_row(
                    "SELECT id FROM skills WHERE dir_path = ?1",
                    params![skill_ref],
                    |row| row.get::<_, i64>(0),
                )
                .optional()?
            };
            if let Some(skill_id) = skill_id {
                conn.execute(
                    "INSERT OR IGNORE INTO preset_skills (preset_id, skill_id) VALUES (?1, ?2)",
                    params![preset_id, skill_id],
                )?;
            } else {
                unresolved.push(format!("{}: {}", preset.name, skill_ref));
            }
        }
    }

    for preset in presets {
        let preset_id = preset_ids.get(&preset.name).copied().ok_or_else(|| {
            AppError::InvalidInput(format!("profile preset was not prepared: {}", preset.name))
        })?;
        for included_name in &preset.included_preset_names {
            let included_id = if let Some(included_id) = preset_ids.get(included_name) {
                Some(*included_id)
            } else {
                conn.query_row(
                    "SELECT id FROM presets WHERE name = ?1",
                    params![included_name],
                    |row| row.get::<_, i64>(0),
                )
                .optional()?
            };
            let Some(included_id) = included_id else {
                return Err(AppError::InvalidInput(format!(
                    "profile references missing preset: {included_name}"
                )));
            };
            if repo::would_create_preset_cycle(conn, preset_id, included_id)? {
                return Err(AppError::InvalidInput(
                    "profile preset composition contains a cycle".into(),
                ));
            }
            conn.execute(
                "INSERT INTO preset_includes (preset_id, included_preset_id) VALUES (?1, ?2)",
                params![preset_id, included_id],
            )?;
        }
    }

    Ok((preset_ids.into_keys().collect(), unresolved))
}

pub fn export_profile(conn: &Connection) -> AppResult<String> {
    let skills = repo::list_skills(conn)?;
    let skill_paths: HashMap<i64, &str> = skills
        .iter()
        .map(|skill| (skill.id, skill.dir_path.as_str()))
        .collect();
    let presets = repo::list_presets(conn)?;
    let preset_names: HashMap<i64, &str> = presets
        .iter()
        .map(|preset| (preset.id, preset.name.as_str()))
        .collect();

    let portable_presets = presets
        .iter()
        .map(|preset| ExportPreset {
            name: preset.name.clone(),
            description: preset.description.clone(),
            direct_skill_refs: preset
                .direct_skill_ids
                .iter()
                .filter_map(|id| skill_paths.get(id).map(|path| (*path).to_string()))
                .collect(),
            included_preset_names: preset
                .included_preset_ids
                .iter()
                .filter_map(|id| preset_names.get(id).map(|name| (*name).to_string()))
                .collect(),
        })
        .collect();

    let profile = ExportProfile {
        version: PROFILE_VERSION.to_string(),
        export_date: chrono::Local::now().to_rfc3339(),
        skills,
        presets: portable_presets,
    };
    serde_json::to_string_pretty(&profile)
        .map_err(|error| AppError::InvalidInput(format!("failed to serialize profile: {error}")))
}

pub fn save_profile_file(path: &Path, profile_json: &str) -> AppResult<()> {
    parse_profile(profile_json)?;
    std::fs::write(path, profile_json)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::Db;
    use crate::models::{PresetReuseMode, Skill};

    fn test_skill(conn: &Connection, name: &str, dir_path: &str) -> i64 {
        repo::upsert_skill(
            conn,
            name,
            "net",
            Some("owner"),
            Some("repo"),
            dir_path,
            None,
            None,
            None,
            None,
            Some("github"),
            None,
            None,
        )
        .unwrap()
    }

    #[test]
    fn profile_round_trip_restores_direct_skills_and_composition() {
        let source_db = Db::open_in_memory().unwrap();
        let source = source_db.conn.lock().unwrap();
        let skill_id = test_skill(&source, "Design", "net/owner/repo/design");
        let frontend_id = repo::create_preset(&source, "frontend", None).unwrap();
        repo::set_preset_skills(&source, frontend_id, &[skill_id]).unwrap();
        let app_id = repo::create_preset(&source, "app", None).unwrap();
        repo::reuse_preset(&source, app_id, &[frontend_id], PresetReuseMode::Link).unwrap();
        let json = export_profile(&source).unwrap();
        drop(source);

        let target_db = Db::open_in_memory().unwrap();
        let target = target_db.conn.lock().unwrap();
        test_skill(&target, "Design", "net/owner/repo/design");
        import_profile(&target, &json).unwrap();

        let presets = repo::list_presets(&target).unwrap();
        let app = presets.iter().find(|preset| preset.name == "app").unwrap();
        assert_eq!(app.skill_ids.len(), 1);
    }

    #[test]
    fn profile_file_save_preserves_the_export_snapshot() {
        let profile = ExportProfile {
            version: PROFILE_VERSION.into(),
            export_date: "2026-07-30T12:00:00+08:00".into(),
            skills: Vec::new(),
            presets: Vec::new(),
        };
        let profile_json = serde_json::to_string_pretty(&profile).unwrap();
        let temp_dir = tempfile::tempdir().unwrap();
        let output = temp_dir.path().join("longan-profile.json");

        save_profile_file(&output, &profile_json).unwrap();

        assert_eq!(std::fs::read_to_string(output).unwrap(), profile_json);
    }

    #[test]
    fn profile_file_save_rejects_invalid_json_without_creating_a_file() {
        let temp_dir = tempfile::tempdir().unwrap();
        let output = temp_dir.path().join("longan-profile.json");

        let error = save_profile_file(&output, "not-json").unwrap_err();

        assert!(error.to_string().contains("invalid profile JSON"));
        assert!(!output.exists());
    }

    #[test]
    fn profile_file_save_rejects_unsupported_versions() {
        let profile = ExportProfile {
            version: "1.0".into(),
            export_date: "now".into(),
            skills: Vec::new(),
            presets: Vec::new(),
        };
        let temp_dir = tempfile::tempdir().unwrap();
        let output = temp_dir.path().join("longan-profile.json");

        let error =
            save_profile_file(&output, &serde_json::to_string(&profile).unwrap()).unwrap_err();

        assert!(error
            .to_string()
            .contains("unsupported profile version: 1.0"));
        assert!(!output.exists());
    }

    #[test]
    fn profile_file_save_reports_invalid_target_paths() {
        let profile = ExportProfile {
            version: PROFILE_VERSION.into(),
            export_date: "now".into(),
            skills: Vec::new(),
            presets: Vec::new(),
        };
        let temp_dir = tempfile::tempdir().unwrap();
        let output = temp_dir.path().join("missing").join("longan-profile.json");

        let error =
            save_profile_file(&output, &serde_json::to_string(&profile).unwrap()).unwrap_err();

        assert!(matches!(error, AppError::Io(_)));
        assert!(!output.exists());
    }

    #[test]
    fn profile_import_reports_unavailable_skill_references() {
        let profile = ExportProfile {
            version: PROFILE_VERSION.to_string(),
            export_date: "now".into(),
            skills: vec![Skill {
                id: 1,
                name: "Missing".into(),
                source_type: "local".into(),
                install_source: Some("local_import".into()),
                owner: None,
                repo: None,
                dir_path: "local/missing".into(),
                description: None,
                latest_sha: None,
                source_path: None,
                tree_sha: None,
                status: "ok".into(),
                updated_at: "now".into(),
                source_url: None,
                github_source: None,
            }],
            presets: vec![ExportPreset {
                name: "local".into(),
                description: None,
                direct_skill_refs: vec!["local/missing".into()],
                included_preset_names: Vec::new(),
            }],
        };
        let db = Db::open_in_memory().unwrap();
        let conn = db.conn.lock().unwrap();
        let result = import_profile(&conn, &serde_json::to_string(&profile).unwrap()).unwrap();
        assert_eq!(
            result.unresolved_preset_skills,
            vec!["local: local/missing"]
        );
    }

    #[test]
    fn profile_preview_classifies_destination_impact() {
        let db = Db::open_in_memory().unwrap();
        let conn = db.conn.lock().unwrap();
        test_skill(&conn, "Installed", "net/owner/repo/installed");
        repo::create_preset(&conn, "existing", None).unwrap();
        let profile = ExportProfile {
            version: PROFILE_VERSION.into(),
            export_date: "2026-07-29T12:00:00+08:00".into(),
            skills: vec![
                test_profile_skill("Installed", "net/owner/repo/installed"),
                test_profile_skill("Missing", "local/missing"),
            ],
            presets: vec![
                ExportPreset {
                    name: "existing".into(),
                    description: None,
                    direct_skill_refs: vec!["net/owner/repo/installed".into()],
                    included_preset_names: Vec::new(),
                },
                ExportPreset {
                    name: "new".into(),
                    description: None,
                    direct_skill_refs: vec!["local/missing".into()],
                    included_preset_names: vec!["existing".into()],
                },
            ],
        };

        let preview =
            preview_profile_import(&conn, &serde_json::to_string(&profile).unwrap()).unwrap();

        assert_eq!(
            (
                preview.matched_skills,
                preview.missing_skills,
                preview.new_presets,
                preview.replaced_presets,
                preview.unresolved_preset_skills,
            ),
            (
                vec![ProfileImportSkill {
                    name: "Installed".into(),
                    dir_path: "net/owner/repo/installed".into(),
                }],
                vec![ProfileImportSkill {
                    name: "Missing".into(),
                    dir_path: "local/missing".into(),
                }],
                vec!["new".into()],
                vec!["existing".into()],
                vec![UnresolvedPresetSkill {
                    preset_name: "new".into(),
                    skill_ref: "local/missing".into(),
                }],
            )
        );
    }

    #[test]
    fn profile_preview_does_not_modify_presets() {
        let db = Db::open_in_memory().unwrap();
        let conn = db.conn.lock().unwrap();
        let profile = ExportProfile {
            version: PROFILE_VERSION.into(),
            export_date: "now".into(),
            skills: Vec::new(),
            presets: vec![ExportPreset {
                name: "preview-only".into(),
                description: None,
                direct_skill_refs: Vec::new(),
                included_preset_names: Vec::new(),
            }],
        };

        preview_profile_import(&conn, &serde_json::to_string(&profile).unwrap()).unwrap();

        assert!(repo::list_presets(&conn).unwrap().is_empty());
    }

    #[test]
    fn profile_preview_rejects_duplicate_preset_names() {
        let db = Db::open_in_memory().unwrap();
        let conn = db.conn.lock().unwrap();
        let repeated = ExportPreset {
            name: "duplicate".into(),
            description: None,
            direct_skill_refs: Vec::new(),
            included_preset_names: Vec::new(),
        };
        let profile = ExportProfile {
            version: PROFILE_VERSION.into(),
            export_date: "now".into(),
            skills: Vec::new(),
            presets: vec![repeated.clone(), repeated],
        };

        let error =
            preview_profile_import(&conn, &serde_json::to_string(&profile).unwrap()).unwrap_err();

        assert!(error.to_string().contains("duplicate preset: duplicate"));
    }

    #[test]
    fn profile_preview_rejects_preset_cycles() {
        let db = Db::open_in_memory().unwrap();
        let conn = db.conn.lock().unwrap();
        let profile = ExportProfile {
            version: PROFILE_VERSION.into(),
            export_date: "now".into(),
            skills: Vec::new(),
            presets: vec![
                ExportPreset {
                    name: "one".into(),
                    description: None,
                    direct_skill_refs: Vec::new(),
                    included_preset_names: vec!["two".into()],
                },
                ExportPreset {
                    name: "two".into(),
                    description: None,
                    direct_skill_refs: Vec::new(),
                    included_preset_names: vec!["one".into()],
                },
            ],
        };

        let error =
            preview_profile_import(&conn, &serde_json::to_string(&profile).unwrap()).unwrap_err();

        assert!(error.to_string().contains("composition contains a cycle"));
    }

    fn test_profile_skill(name: &str, dir_path: &str) -> Skill {
        Skill {
            id: 1,
            name: name.into(),
            source_type: "local".into(),
            install_source: Some("local_import".into()),
            owner: None,
            repo: None,
            dir_path: dir_path.into(),
            description: None,
            latest_sha: None,
            source_path: None,
            tree_sha: None,
            status: "ok".into(),
            updated_at: "now".into(),
            source_url: None,
            github_source: None,
        }
    }
}
