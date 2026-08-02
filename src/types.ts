// TS mirrors of the Rust models (serde field names).
export interface Skill {
  id: number;
  name: string;
  source_type: "net" | "local";
  owner: string | null;
  repo: string | null;
  dir_path: string;
  description: string | null;
  latest_sha: string | null;  // Latest commit SHA for update detection
  source_path?: string | null; // Repository-relative skill directory
  tree_sha?: string | null;    // Installed skill directory Git tree SHA
  status: "ok" | "update_available" | "missing";
  updated_at: string;
  source_url?: string | null;   // skills.sh registry ID
  github_source?: string | null; // GitHub source
}

export interface ListedSkill extends Skill {
  reference_count: number;
}

export interface Preset {
  id: number;
  name: string;
  description: string | null;
  created_at: string;
  skill_ids: number[];
  direct_skill_ids: number[];
  included_preset_ids: number[];
  reference_count: number;
}

export interface PresetProjectReference {
  id: number;
  name: string;
  path: string;
}

export type PresetReuseMode = "copy" | "link";

export interface PresetReuseResult {
  added_direct_skill_count: number;
  added_include_count: number;
}

export interface ProjectGroup {
  id: number;
  name: string | null;
  is_system: boolean;
  hidden: boolean;
  sort_order: number;
}

export interface Project {
  id: number;
  name: string;
  path: string;
  created_at: string;
  path_exists: boolean;
  group_id: number;
  hidden: boolean;
  preset_ids: number[];
  skill_ids: number[];
  agent_ids: number[];
}

export interface Agent {
  id: number;
  name: string;
  target_dir: string;
  global_enabled: boolean;
  created_at: string;
}

export function getProjectSkillCount(project: Project, presets: Preset[] = []): number {
  const presetMap = new Map<number, number[]>(presets.map((p) => [p.id, p.skill_ids]));
  const skillIdsSet = new Set<number>(project.skill_ids);

  for (const presetId of project.preset_ids) {
    const sIds = presetMap.get(presetId);
    if (sIds) {
      for (const id of sIds) {
        skillIdsSet.add(id);
      }
    }
  }

  return skillIdsSet.size;
}

// Preview of a folder picked for local import (mirrors Rust LocalSkillPreview).
export interface LocalSkillPreview {
  dir_name: string;
  kind: "skill" | "collection";
  name: string;
  description: string | null;
  sub_skills: string[];
  conflict: boolean;
}

export interface RegistrySkill {
  id: string;
  name: string;
  source: string;
  installs: number;
  supported: boolean;
  installed: boolean;
}

export interface EffectiveSkill {
  skill_id: number;
  name: string;
  dir_path: string;
  via: string;
  conflicted: boolean;
}

export interface SyncReport {
  created: string[];
  removed: string[];
  conflicts: string[];
  project_path_missing: boolean;
}

export interface BrokenLink {
  project_id: number;
  project_name: string;
  link_path: string;
  target: string;
}

export interface GitCacheInfo {
  repository_count: number;
  total_bytes: number;
}

export interface StorageInfo {
  currentDir: string;
  configuredDir: string;
  isDefault: boolean;
  restartRequired: boolean;
}

export interface AppErrorPayload {
  code: string;
  message: string;
}

export type SkillOperationPhase =
  | "checking"
  | "downloading"
  | "retrying"
  | "extracting"
  | "installing"
  | "registering"
  | "syncing"
  | "completed"
  | "failed"
  | "cancelled";

export interface SkillUpdateProgressEvent {
  skillId: number;
  phase: SkillOperationPhase;
  progress: number;
  downloadedBytes: number | null;
  totalBytes: number | null;
  error: string | null;
}

export type SkillUpdateTaskStatus = "queued" | "updating" | "success" | "failed";

export interface SkillUpdateTask {
  skillId: number;
  name: string;
  status: SkillUpdateTaskStatus;
  phase: SkillOperationPhase | null;
  progress: number;
  downloadedBytes: number | null;
  totalBytes: number | null;
  error: string | null;
}

export interface SkillInstallProgressEvent {
  operationId: string;
  phase: SkillOperationPhase;
  progressPercent: number | null;
  downloadedBytes: number | null;
  totalBytes: number | null;
  error: string | null;
}

export type SkillInstallTaskStatus =
  | "queued"
  | "installing"
  | "cancelling"
  | "completed"
  | "failed"
  | "cancelled";

export interface SkillInstallRequest {
  installKey: string;
  sourceId: string;
  name: string;
  owner: string;
  repoName: string;
  skillId: string;
  origin: "explore" | "github";
  sourceUrl?: string;
  githubSource?: string;
}

export interface SkillInstallTask extends SkillInstallRequest {
  id: string;
  operationId: string;
  status: SkillInstallTaskStatus;
  phase: SkillOperationPhase | null;
  progressPercent: number | null;
  downloadedBytes: number | null;
  totalBytes: number | null;
  error: string | null;
}

/// Detailed reference information for a skill.
export interface ReferenceDetail {
  name: string;
  type_: string;
  path?: string | null;
}

/// Export profile structure for data transfer
export interface ExportProfile {
  version: string;
  export_date: string;
  skills: Skill[];
  presets: ExportPreset[];
}

export interface ExportPreset {
  name: string;
  description: string | null;
  direct_skill_refs: string[];
  included_preset_names: string[];
}

export interface ProfileImportSkill {
  name: string;
  dir_path: string;
}

export interface UnresolvedPresetSkill {
  preset_name: string;
  skill_ref: string;
}

export interface ProfileImportPreview {
  version: string;
  export_date: string;
  matched_skills: ProfileImportSkill[];
  missing_skills: ProfileImportSkill[];
  new_presets: string[];
  replaced_presets: string[];
  unresolved_preset_skills: UnresolvedPresetSkill[];
}

/// Result of importing a profile
export interface ImportResult {
  success: boolean;
  imported_skills: string[];
  skipped_skills: string[];
  installed_from_source: string[];
  created_presets: string[];
  unresolved_preset_skills: string[];
  error?: string | null;
}
