import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { api, selectFolder } from "@/api";
import { reportFrontendError } from "@/logging";
import type { Project, ProjectGroup, Preset } from "@/types";
import {
  parseProjectHiddenPreview,
  PROJECT_HIDDEN_PREVIEW_SETTING_KEY,
  orderProjectGroups,
  buildProjectGroupSections,
} from "@/utils/projectOrder";

export const useProjectStore = defineStore("project", () => {
  const projects = ref<Project[]>([]);
  const projectGroups = ref<ProjectGroup[]>([]);
  const presets = ref<Preset[]>([]);
  const showHiddenProjectsInSidebar = ref<boolean>(false);
  const projectsLoaded = ref<boolean>(false);
  const selectedProjectId = ref<number | null>(null);

  const selectedProject = computed(() =>
    projects.value.find((project) => project.id === selectedProjectId.value) ?? null,
  );

  const orderedGroups = computed(() => orderProjectGroups(projectGroups.value));

  const groupSections = computed(() =>
    buildProjectGroupSections(projectGroups.value, projects.value),
  );

  async function reloadProjects(): Promise<void> {
    try {
      const [projs, groups, presetList, hiddenSetting] = await Promise.all([
        api.listProjects(),
        api.listProjectGroups(),
        api.listPresets(),
        api.getSetting(PROJECT_HIDDEN_PREVIEW_SETTING_KEY),
      ]);
      projects.value = projs;
      projectGroups.value = groups;
      presets.value = presetList;
      showHiddenProjectsInSidebar.value = parseProjectHiddenPreview(hiddenSetting);
      projectsLoaded.value = true;
    } catch (err) {
      reportFrontendError("Failed to reload projects", err, "useProjectStore");
    }
  }

  function selectProject(projectId: number | null): void {
    selectedProjectId.value = projectId;
  }

  async function addProject(): Promise<number | null> {
    try {
      const path = await selectFolder();
      if (!path) return null;
      const id = await api.addProject(path);
      await reloadProjects();
      selectedProjectId.value = id;
      return id;
    } catch (err) {
      reportFrontendError("Failed to add project", err, "useProjectStore");
      return null;
    }
  }

  async function deleteProject(projectId: number): Promise<void> {
    try {
      await api.deleteProject(projectId);
      if (selectedProjectId.value === projectId) {
        selectedProjectId.value = null;
      }
      await reloadProjects();
    } catch (err) {
      reportFrontendError("Failed to delete project", err, "useProjectStore");
    }
  }

  async function setHiddenProjectsPreview(show: boolean): Promise<void> {
    try {
      await api.setSetting(PROJECT_HIDDEN_PREVIEW_SETTING_KEY, String(show));
      showHiddenProjectsInSidebar.value = show;
    } catch (err) {
      reportFrontendError("Failed to set hidden projects preview", err, "useProjectStore");
    }
  }

  async function setProjectGroup(projectId: number, groupId: number): Promise<void> {
    try {
      await api.setProjectGroup(projectId, groupId);
      await reloadProjects();
    } catch (err) {
      reportFrontendError("Failed to set project group", err, "useProjectStore");
    }
  }

  async function setProjectsGroup(projectIds: number[], groupId: number): Promise<void> {
    try {
      await api.setProjectsGroup(projectIds, groupId);
      await reloadProjects();
    } catch (err) {
      reportFrontendError("Failed to set projects group", err, "useProjectStore");
    }
  }

  async function setProjectHidden(projectId: number, hidden: boolean): Promise<void> {
    try {
      await api.setProjectHidden(projectId, hidden);
      await reloadProjects();
    } catch (err) {
      reportFrontendError("Failed to set project hidden", err, "useProjectStore");
    }
  }

  async function setProjectGroupHidden(groupId: number, hidden: boolean): Promise<void> {
    try {
      await api.setProjectGroupHidden(groupId, hidden);
      await reloadProjects();
    } catch (err) {
      reportFrontendError("Failed to set project group hidden", err, "useProjectStore");
    }
  }

  async function createProjectGroup(name: string): Promise<number | null> {
    try {
      const id = await api.createProjectGroup(name);
      await reloadProjects();
      return id;
    } catch (err) {
      reportFrontendError("Failed to create project group", err, "useProjectStore");
      return null;
    }
  }

  async function updateProjectGroup(groupId: number, name: string): Promise<void> {
    try {
      await api.updateProjectGroup(groupId, name);
      await reloadProjects();
    } catch (err) {
      reportFrontendError("Failed to update project group", err, "useProjectStore");
    }
  }

  async function deleteProjectGroup(groupId: number): Promise<void> {
    try {
      await api.deleteProjectGroup(groupId);
      await reloadProjects();
    } catch (err) {
      reportFrontendError("Failed to delete project group", err, "useProjectStore");
    }
  }

  async function moveProjectGroup(
    groupId: number,
    direction: "up" | "down",
  ): Promise<void> {
    try {
      await api.moveProjectGroup(groupId, direction);
      await reloadProjects();
    } catch (err) {
      reportFrontendError("Failed to move project group", err, "useProjectStore");
    }
  }

  async function moveProject(projectId: number, direction: "up" | "down"): Promise<void> {
    try {
      await api.moveProject(projectId, direction);
      await reloadProjects();
    } catch (err) {
      reportFrontendError("Failed to move project", err, "useProjectStore");
    }
  }

  return {
    // State
    projects,
    projectGroups,
    presets,
    showHiddenProjectsInSidebar,
    projectsLoaded,
    selectedProjectId,
    // Getters
    selectedProject,
    orderedGroups,
    groupSections,
    // Actions
    reloadProjects,
    selectProject,
    addProject,
    deleteProject,
    setHiddenProjectsPreview,
    setProjectGroup,
    setProjectsGroup,
    setProjectHidden,
    setProjectGroupHidden,
    createProjectGroup,
    updateProjectGroup,
    deleteProjectGroup,
    moveProjectGroup,
    moveProject,
  };
});
