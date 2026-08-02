import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { open, save, type SaveDialogOptions } from "@tauri-apps/plugin-dialog";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import type {
  Agent,
  BrokenLink,
  EffectiveSkill,
  GitCacheInfo,
  ImportResult,
  ListedSkill,
  LocalSkillPreview,
  Preset,
  PresetProjectReference,
  ProfileImportPreview,
  Project,
  ProjectGroup,
  RegistrySkill,
  Skill,
  SkillInstallProgressEvent,
  SkillUpdateProgressEvent,
  StorageInfo,
  SyncReport,
} from "./types";

const SKILL_INSTALL_PROGRESS_EVENT = "skill-install-progress";
const SKILL_UPDATE_PROGRESS_EVENT = "skill-update-progress";
const SKILLS_CHANGED_EVENT = "skills-changed";

// Thin typed wrappers over the Tauri commands.

export const api = {
  // registry
  searchRegistry: (query: string) => invoke<RegistrySkill[]>("search_registry", { query }),
  installSkill: (owner: string, repoName: string, skillId: string, operationId: string, sourceUrl?: string, githubSource?: string) =>
    invoke<Skill>("install_skill", {
      owner,
      repoName,
      skillId,
      operationId,
      sourceUrl,
      githubSource,
    }),
  cancelSkillInstall: (operationId: string) =>
    invoke<boolean>("cancel_skill_install", { operationId }),
  cancelSkillInstalls: () => invoke<number>("cancel_skill_installs"),

  // skills
  listSkills: () => invoke<ListedSkill[]>("list_skills"),
  rescanLocal: () => invoke<Skill[]>("rescan_local"),
  previewLocalSkill: (path: string) => invoke<LocalSkillPreview>("preview_local_skill", { path }),
  importLocalSkill: (path: string) => invoke<Skill>("import_local_skill", { path }),
  checkUpdates: () => invoke<number>("check_updates"),
  updateSkill: (skillId: number) => invoke<Skill>("update_skill", { skillId }),
  updateSkills: (skillIds: number[]) => invoke<Skill[]>("update_skills", { skillIds }),
  cancelSkillUpdates: () => invoke<number>("cancel_skill_updates"),
  skillReferences: (skillId: number) =>
    invoke<[string[], string[]]>("skill_references", { skillId }),
  skillReferenceDetails: (skillId: number) =>
    invoke<import("./types").ReferenceDetail[]>("skill_reference_details", { skillId }),
  deleteSkill: (skillId: number) => invoke<void>("delete_skill", { skillId }),

  // presets
  listPresets: () => invoke<Preset[]>("list_presets"),
  presetProjectReferences: (presetId: number) =>
    invoke<PresetProjectReference[]>("preset_project_references", { presetId }),
  createPreset: (
    name: string,
    description?: string,
    sourcePresetIds: number[] = [],
    reuseMode?: import("./types").PresetReuseMode,
  ) => invoke<number>("create_preset", { name, description, sourcePresetIds, reuseMode }),
  updatePreset: (presetId: number, name: string, description?: string) =>
    invoke<void>("update_preset", { presetId, name, description }),
  deletePreset: (presetId: number) => invoke<void>("delete_preset", { presetId }),
  setPresetSkills: (presetId: number, skillIds: number[]) =>
    invoke<void>("set_preset_skills", { presetId, skillIds }),
  reusePreset: (
    presetId: number,
    sourcePresetIds: number[],
    mode: import("./types").PresetReuseMode,
  ) => invoke<import("./types").PresetReuseResult>("reuse_preset", {
    presetId,
    sourcePresetIds,
    mode,
  }),
  setPresetIncludes: (presetId: number, includedPresetIds: number[]) =>
    invoke<void>("set_preset_includes", { presetId, includedPresetIds }),

  // projects
  listProjectGroups: () => invoke<ProjectGroup[]>("list_project_groups"),
  createProjectGroup: (name: string) =>
    invoke<number>("create_project_group", { name }),
  updateProjectGroup: (groupId: number, name: string) =>
    invoke<void>("update_project_group", { groupId, name }),
  deleteProjectGroup: (groupId: number) =>
    invoke<number>("delete_project_group", { groupId }),
  moveProjectGroup: (groupId: number, direction: "up" | "down") =>
    invoke<void>("move_project_group", { groupId, direction }),
  setProjectGroupHidden: (groupId: number, hidden: boolean) =>
    invoke<void>("set_project_group_hidden", { groupId, hidden }),
  listProjects: () => invoke<Project[]>("list_projects"),
  getProject: (projectId: number) => invoke<Project>("get_project", { projectId }),
  addProject: (path: string) => invoke<number>("add_project", { path }),
  deleteProject: (projectId: number) => invoke<void>("delete_project", { projectId }),
  setProjectGroup: (projectId: number, groupId: number) =>
    invoke<void>("set_project_group", { projectId, groupId }),
  setProjectsGroup: (projectIds: number[], groupId: number) =>
    invoke<number>("set_projects_group", { projectIds, groupId }),
  moveProject: (projectId: number, direction: "up" | "down") =>
    invoke<void>("move_project", { projectId, direction }),
  setProjectHidden: (projectId: number, hidden: boolean) =>
    invoke<void>("set_project_hidden", { projectId, hidden }),
  setProjectPreset: (projectId: number, presetId: number, linked: boolean) =>
    invoke<SyncReport>("set_project_preset", { projectId, presetId, linked }),
  setProjectSkill: (projectId: number, skillId: number, linked: boolean) =>
    invoke<SyncReport>("set_project_skill", { projectId, skillId, linked }),
  effectiveSkills: (projectId: number) =>
    invoke<EffectiveSkill[]>("effective_skills", { projectId }),
  syncProject: (projectId: number) => invoke<SyncReport>("sync_project", { projectId }),
  gitignoreLinks: (projectId: number) => invoke<void>("gitignore_links", { projectId }),

  // agents
  listAgents: () => invoke<Agent[]>("list_agents"),
  createAgent: (name: string, targetDir: string, globalEnabled: boolean) =>
    invoke<number>("create_agent", { name, targetDir, globalEnabled }),
  updateAgent: (agentId: number, name: string, targetDir: string, globalEnabled: boolean) =>
    invoke<void>("update_agent", { agentId, name, targetDir, globalEnabled }),
  deleteAgent: (agentId: number) => invoke<void>("delete_agent", { agentId }),
  setProjectAgent: (projectId: number, agentId: number, linked: boolean) =>
    invoke<SyncReport>("set_project_agent", { projectId, agentId, linked }),

  // doctor & settings
  doctorScan: () => invoke<BrokenLink[]>("doctor_scan"),
  doctorFix: () => invoke<number>("doctor_fix"),
  getGitCacheInfo: () => invoke<GitCacheInfo>("get_git_cache_info"),
  clearGitCache: () => invoke<void>("clear_git_cache"),
  verifyGithubToken: (token: string) =>
    invoke<boolean>("verify_github_token", { token }),
  getSetting: (key: string) => invoke<string | null>("get_setting", { key }),
  getSystemLanguage: () => invoke<string>("get_system_language"),
  setSetting: (key: string, value: string) => invoke<void>("set_setting", { key, value }),
  getStorageDir: () => invoke<StorageInfo>("get_storage_dir"),
  setStorageDir: (dirPath: string) =>
    invoke<StorageInfo>("set_storage_dir", { dirPath }),
  selectDirectory: async (): Promise<string> => {
    const path = await open({ directory: true }) as string | null;
    if (!path) {
      throw new Error("No directory selected");
    }
    return path;
  },
  openConsoleDir: () => invoke<void>("open_console_dir"),
  openLogsDir: () => invoke<void>("open_logs_dir"),
  exportDiagnostics: () => invoke<string>("export_diagnostics"),
  openSkillDir: (skillId: number) => invoke<void>("open_skill_dir", { skillId }),
  openPath: (path: string) => invoke<void>("open_path", { path }),

  // Profile transfer
  exportProfile: () => invoke<string>("export_profile"),
  saveProfileFile: (path: string, profileJson: string) =>
    invoke<void>("save_profile_file", { path, profileJson }),
  saveFileDialog: (options: SaveDialogOptions) => save(options),
  revealFile: (path: string) => revealItemInDir(path),
  previewProfileImport: (profileJson: string) =>
    invoke<ProfileImportPreview>("preview_profile_import", { profileJson }),
  importProfile: (profileJson: string) => invoke<ImportResult>("import_profile", { profileJson }),
  
  // File dialog helpers
  openFileDialog: async (filters?: Array<{ name: string; extensions: string[] }>): Promise<string | null> => {
    const path = await open({ filters });
    return (typeof path === "string" ? path : null);
  },
};

export function listenForSkillInstallProgress(
  onProgress: (progress: SkillInstallProgressEvent) => void
): Promise<UnlistenFn> {
  return listen<SkillInstallProgressEvent>(SKILL_INSTALL_PROGRESS_EVENT, (event) => {
    onProgress(event.payload);
  });
}

export function listenForSkillUpdateProgress(
  onProgress: (progress: SkillUpdateProgressEvent) => void
): Promise<UnlistenFn> {
  return listen<SkillUpdateProgressEvent>(SKILL_UPDATE_PROGRESS_EVENT, (event) => {
    onProgress(event.payload);
  });
}

export function listenForSkillsChanged(onChanged: () => void): Promise<UnlistenFn> {
  return listen(SKILLS_CHANGED_EVENT, onChanged);
}

/** Human-readable message from a command rejection. */
export function errorMessage(e: unknown): string {
  if (e && typeof e === "object" && "message" in e) {
    return String((e as { message: unknown }).message);
  }
  return String(e);
}
