use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Skill {
    pub id: i64,
    pub name: String,
    /// "net" | "local"
    pub source_type: String,
    /// "skills_sh" | "github" | "local_import"
    pub install_source: Option<String>,
    pub owner: Option<String>,
    pub repo: Option<String>,
    /// Path relative to `~/.longan/skills/`, e.g. `net/owner/repo/name` or `local/name`.
    pub dir_path: String,
    pub description: Option<String>,
    /// Latest known commit SHA (used for update detection)
    pub latest_sha: Option<String>,
    /// Repository-relative path for network skills, e.g. `skills/brainstorming`.
    pub source_path: Option<String>,
    /// Git tree SHA of the installed skill directory.
    pub tree_sha: Option<String>,
    /// "ok" | "update_available" | "missing"
    pub status: String,
    pub updated_at: String,
    /// skills.sh registry ID (e.g., "obra/superpowers/brainstorming")
    pub source_url: Option<String>,
    /// GitHub source (e.g., "obra/superpowers")
    pub github_source: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ListedSkill {
    #[serde(flatten)]
    pub skill: Skill,
    pub reference_count: u32,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Preset {
    pub id: i64,
    pub name: String,
    pub description: Option<String>,
    pub created_at: String,
    /// Effective skill ids, including recursively composed presets.
    pub skill_ids: Vec<i64>,
    /// Skills owned directly by this preset.
    pub direct_skill_ids: Vec<i64>,
    /// Presets directly composed into this preset.
    pub included_preset_ids: Vec<i64>,
    /// Distinct projects that use this preset directly or through composition.
    pub reference_count: u32,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct PresetProjectReference {
    pub id: i64,
    pub name: String,
    pub path: String,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum PresetReuseMode {
    Copy,
    Link,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct PresetReuseResult {
    pub added_direct_skill_count: usize,
    pub added_include_count: usize,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ProjectGroup {
    pub id: i64,
    pub name: Option<String>,
    pub is_system: bool,
    pub hidden: bool,
    pub sort_order: i64,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum MoveDirection {
    Up,
    Down,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Project {
    pub id: i64,
    pub name: String,
    pub path: String,
    pub created_at: String,
    /// Whether `path` currently exists on disk.
    pub path_exists: bool,
    pub group_id: i64,
    pub hidden: bool,
    pub preset_ids: Vec<i64>,
    pub skill_ids: Vec<i64>,
    pub agent_ids: Vec<i64>,
}

/// A tool that reads skills from its own project-relative directory (e.g.
/// "claude" -> ".claude/skills"). Links are mirrored there when the agent is
/// globally enabled or linked to the project.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Agent {
    pub id: i64,
    pub name: String,
    /// Normalized project-relative dir, '/'-separated (e.g. ".claude/skills").
    pub target_dir: String,
    pub global_enabled: bool,
    pub created_at: String,
}

/// Preview of a user-picked folder for local import, before anything is copied.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct LocalSkillPreview {
    /// Folder name; becomes the dir name under `local/`.
    pub dir_name: String,
    /// "skill" | "collection"
    pub kind: String,
    pub name: String,
    pub description: Option<String>,
    /// Sub-skill dir names when `kind` is "collection".
    pub sub_skills: Vec<String>,
    /// True when `local/<dir_name>` already exists.
    pub conflict: bool,
}

/// One search hit from skills.sh.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct RegistrySkill {
    /// Full id, e.g. `vercel-labs/skills/find-skills` or `site/open.feishu.cn/lark-doc`.
    pub id: String,
    pub name: String,
    /// `owner/repo` or `site/<domain>`.
    pub source: String,
    pub installs: i64,
    /// GitHub-backed skills are installable in v1.
    pub supported: bool,
    /// Set when the same owner/repo/name is already in the library.
    pub installed: bool,
}

/// Effective skill entry for a project detail view.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct EffectiveSkill {
    pub skill_id: i64,
    pub name: String,
    pub dir_path: String,
    /// "direct" or the preset name it came from.
    pub via: String,
    /// True when this entry lost a name conflict and was not linked.
    pub conflicted: bool,
}

/// Result of syncing one project.
#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct SyncReport {
    pub created: Vec<String>,
    pub removed: Vec<String>,
    pub conflicts: Vec<String>,
    pub project_path_missing: bool,
}

/// A broken link found by the doctor scan.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct BrokenLink {
    pub project_id: i64,
    pub project_name: String,
    pub link_path: String,
    pub target: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct GitCacheInfo {
    pub repository_count: usize,
    pub total_bytes: u64,
}

/// Detailed reference information for a skill.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ReferenceDetail {
    /// Name of the preset or project
    pub name: String,
    /// "preset" or "project"
    pub type_: String,
    /// Project path if type is "project", None otherwise
    pub path: String,  // Changed to String, will handle null case
}

/// Export profile structure for data transfer
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ExportProfile {
    pub version: String,
    pub export_date: String,
    pub skills: Vec<Skill>,
    pub presets: Vec<ExportPreset>,
}

/// Portable preset representation. Database ids never cross installations.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ExportPreset {
    pub name: String,
    pub description: Option<String>,
    pub direct_skill_refs: Vec<String>,
    pub included_preset_names: Vec<String>,
}

/// One exported skill classified against the destination library.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct ProfileImportSkill {
    pub name: String,
    pub dir_path: String,
}

/// A preset-to-skill relationship that cannot be restored on import.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct UnresolvedPresetSkill {
    pub preset_name: String,
    pub skill_ref: String,
}

/// Read-only impact summary for a profile import.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ProfileImportPreview {
    pub version: String,
    pub export_date: String,
    pub matched_skills: Vec<ProfileImportSkill>,
    pub missing_skills: Vec<ProfileImportSkill>,
    pub new_presets: Vec<String>,
    pub replaced_presets: Vec<String>,
    pub unresolved_preset_skills: Vec<UnresolvedPresetSkill>,
}

/// Result of importing a profile
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ImportResult {
    pub success: bool,
    pub imported_skills: Vec<String>,
    pub skipped_skills: Vec<String>,
    pub installed_from_source: Vec<String>,
    pub created_presets: Vec<String>,
    pub unresolved_preset_skills: Vec<String>,
    pub error: Option<String>,
}
