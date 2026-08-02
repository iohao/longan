import type { Project, ProjectGroup } from "../types";

export const PROJECT_HIDDEN_PREVIEW_SETTING_KEY = "show_hidden_projects_in_sidebar";

export function parseProjectHiddenPreview(value: string | null): boolean {
  return value === "true";
}

export interface ProjectGroupSection {
  group: ProjectGroup;
  visibleProjects: Project[];
  hiddenProjects: Project[];
}

export function orderProjectGroups(groups: readonly ProjectGroup[]): ProjectGroup[] {
  return [...groups].sort((a, b) => {
    if (a.hidden !== b.hidden) return Number(a.hidden) - Number(b.hidden);
    if (a.hidden && a.is_system !== b.is_system) return a.is_system ? -1 : 1;
    if (!a.hidden && a.is_system !== b.is_system) return a.is_system ? -1 : 1;
    return a.sort_order - b.sort_order || a.id - b.id;
  });
}

export function buildProjectGroupSections(
  groups: readonly ProjectGroup[],
  projects: readonly Project[],
): ProjectGroupSection[] {
  const byGroup = new Map<number, { visibleProjects: Project[]; hiddenProjects: Project[] }>();
  for (const project of projects) {
    let section = byGroup.get(project.group_id);
    if (!section) {
      section = { visibleProjects: [], hiddenProjects: [] };
      byGroup.set(project.group_id, section);
    }
    (project.hidden ? section.hiddenProjects : section.visibleProjects).push(project);
  }

  return orderProjectGroups(groups).map((group) => ({
    group,
    visibleProjects: byGroup.get(group.id)?.visibleProjects ?? [],
    hiddenProjects: byGroup.get(group.id)?.hiddenProjects ?? [],
  }));
}
