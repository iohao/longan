import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { open } from "@tauri-apps/plugin-dialog";
import {
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  FolderGit2,
  FolderInput,
  FolderOpen,
  FolderTree,
  FolderX,
  LayoutList,
  ListTree,
  Plus,
  Trash2,
} from "lucide-react";

import { api, errorMessage } from "../api";
import Badge from "../components/ui/Badge";
import Button from "../components/ui/Button";
import Modal from "../components/ui/Modal";
import ProjectGroupsPage from "./ProjectGroupsPage";
import type { Preset, Project, ProjectGroup } from "../types";
import { getProjectSkillCount } from "../types";
import {
  buildProjectGroupSections,
  parseProjectHiddenPreview,
  PROJECT_HIDDEN_PREVIEW_SETTING_KEY,
} from "../utils/projectOrder";

const actionButtonClass =
  "flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-md text-slate-400 transition-colors duration-150 hover:bg-slate-800/80 hover:text-emerald-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-500/60 disabled:cursor-not-allowed disabled:opacity-20 disabled:hover:bg-transparent disabled:hover:text-slate-400 motion-reduce:transition-none md:h-8 md:w-8";

const dangerActionButtonClass =
  "flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-md text-rose-400 transition-colors duration-150 hover:bg-rose-500/10 hover:text-rose-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-rose-500/60 motion-reduce:transition-none md:h-8 md:w-8";

interface ProjectsPageProps {
  projects?: Project[];
  projectGroups?: ProjectGroup[];
  presets?: Preset[];
  showHiddenProjectsInSidebar?: boolean;
  onSelectProject?: (id: number | null) => void;
  onReloadProjects?: () => Promise<void>;
  onAddProject?: () => Promise<void>;
  onSetHiddenProjectsPreview?: (show: boolean) => Promise<void>;
}

type ProjectsView = "overview" | "groups";

export default function ProjectsPage({
  projects: propProjects,
  projectGroups: propProjectGroups,
  presets: propPresets,
  showHiddenProjectsInSidebar: propShowHiddenProjectsInSidebar,
  onSelectProject,
  onReloadProjects,
  onAddProject,
  onSetHiddenProjectsPreview,
}: ProjectsPageProps = {}) {
  const { t } = useTranslation();
  const [localProjects, setLocalProjects] = useState<Project[]>([]);
  const [localProjectGroups, setLocalProjectGroups] = useState<ProjectGroup[]>([]);
  const [localPresets, setLocalPresets] = useState<Preset[]>([]);
  const [localShowHiddenPreview, setLocalShowHiddenPreview] = useState(false);
  const [activeView, setActiveView] = useState<ProjectsView>("overview");
  const [error, setError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [assignmentTarget, setAssignmentTarget] = useState<Project | null>(null);
  const [assignmentGroupId, setAssignmentGroupId] = useState(0);
  const [deleteProjectTarget, setDeleteProjectTarget] = useState<Project | null>(null);

  const projects = propProjects ?? localProjects;
  const projectGroups = propProjectGroups ?? localProjectGroups;
  const presets = propPresets ?? localPresets;
  const showHiddenPreview = propShowHiddenProjectsInSidebar ?? localShowHiddenPreview;

  const reload = useCallback(async () => {
    try {
      if (
        propProjects === undefined ||
        propProjectGroups === undefined ||
        propPresets === undefined
      ) {
        const [projectList, groupList, presetList, savedPreview] = await Promise.all([
          api.listProjects(),
          api.listProjectGroups(),
          api.listPresets(),
          api.getSetting(PROJECT_HIDDEN_PREVIEW_SETTING_KEY),
        ]);
        setLocalProjects(projectList);
        setLocalProjectGroups(groupList);
        setLocalPresets(presetList);
        setLocalShowHiddenPreview(parseProjectHiddenPreview(savedPreview));
      }
      await onReloadProjects?.();
    } catch (reloadError) {
      setError(errorMessage(reloadError));
    }
  }, [onReloadProjects, propProjectGroups, propProjects, propPresets]);

  useEffect(() => {
    if (
      propProjects === undefined ||
      propProjectGroups === undefined ||
      propPresets === undefined
    ) {
      void reload();
    }
  }, [propProjectGroups, propProjects, propPresets, reload]);

  const sections = useMemo(
    () => buildProjectGroupSections(projectGroups, projects),
    [projectGroups, projects],
  );
  const firstHiddenGroupIndex = sections.findIndex(({ group }) => group.hidden);
  const hasHiddenItems = sections.some(
    ({ group, hiddenProjects }) => group.hidden || hiddenProjects.length > 0,
  );

  const groupLabel = useCallback(
    (group: ProjectGroup) =>
      group.is_system ? t("projectGroups.ungrouped") : group.name ?? "",
    [t],
  );

  async function runAction(
    key: string,
    action: () => Promise<unknown>,
    refresh = true,
  ) {
    if (pendingAction !== null) return false;
    setError(null);
    setPendingAction(key);
    try {
      await action();
      if (refresh) await reload();
      return true;
    } catch (actionError) {
      setError(errorMessage(actionError));
      return false;
    } finally {
      setPendingAction(null);
    }
  }

  async function assignProject() {
    if (!assignmentTarget) return;
    const success = await runAction("assign-project", () =>
      api.setProjectGroup(assignmentTarget.id, assignmentGroupId),
    );
    if (success) setAssignmentTarget(null);
  }

  async function deleteProject() {
    if (!deleteProjectTarget) return;
    const success = await runAction("delete-project", () =>
      api.deleteProject(deleteProjectTarget.id),
    );
    if (success) setDeleteProjectTarget(null);
  }

  async function toggleHiddenPreview() {
    const next = !showHiddenPreview;
    await runAction("hidden-preview", async () => {
      if (onSetHiddenProjectsPreview) {
        await onSetHiddenProjectsPreview(next);
      } else {
        await api.setSetting(PROJECT_HIDDEN_PREVIEW_SETTING_KEY, String(next));
        setLocalShowHiddenPreview(next);
      }
    }, false);
  }

  async function openProjectDirectory(path: string) {
    await runAction("open-project", () => api.openPath(path), false);
  }

  async function addProject() {
    if (onAddProject) {
      await runAction("add-project", onAddProject, false);
      return;
    }
    try {
      const path = await open({ directory: true, multiple: false });
      if (typeof path !== "string") return;
      let projectId: number | null = null;
      const success = await runAction("add-project", async () => {
        projectId = await api.addProject(path);
      });
      if (success && projectId !== null) onSelectProject?.(projectId);
    } catch (openError) {
      setError(errorMessage(openError));
    }
  }

  function renderProjectRow(
    project: Project,
    partition: readonly Project[],
  ) {
    const index = partition.findIndex(({ id }) => id === project.id);
    const totalSkills = getProjectSkillCount(project, presets);
    return (
      <li
        key={project.id}
        className={`group/project relative border-b border-slate-800/70 transition-colors duration-150 last:border-b-0 hover:bg-slate-900/55 focus-within:bg-slate-900/55 motion-reduce:transition-none ${
          project.hidden ? "bg-slate-950/20" : ""
        }`}
      >
        <button
          type="button"
          aria-label={project.name}
          onClick={() => onSelectProject?.(project.id)}
          className="absolute inset-0 z-0 cursor-pointer rounded-r-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-500/60"
        />

        <div className="pointer-events-none relative z-10 flex min-w-0 flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center sm:gap-4 sm:px-4">
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              <h3 className="min-w-0 truncate text-sm font-semibold text-slate-100">
                {project.name}
              </h3>
              {project.hidden ? (
                <Badge variant="neutral">{t("projects.hiddenFromSidebar")}</Badge>
              ) : null}
              {!project.path_exists ? (
                <Badge variant="danger">
                  <FolderX className="h-3 w-3" />
                  <span>{t("projects.pathMissing")}</span>
                </Badge>
              ) : null}
            </div>
            <p className="mt-1 truncate font-mono text-xs text-slate-500" title={project.path}>
              {project.path}
            </p>
          </div>

          <div
            className="relative flex min-h-9 w-full shrink-0 items-center justify-end sm:w-72 md:min-h-8"
          >
            <div
              className="flex flex-wrap items-center justify-end gap-x-2 text-xs tabular-nums text-slate-500 transition-opacity duration-150 group-hover/project:opacity-0 group-focus-within/project:opacity-0 motion-reduce:transition-none [@media(hover:none)]:opacity-0"
            >
              <span>{t("projects.skillsCount", { count: totalSkills })}</span>
              <span aria-hidden="true">·</span>
              <span>
                {t("projects.assignmentSummary", {
                  presets: project.preset_ids.length,
                  direct: project.skill_ids.length,
                })}
              </span>
            </div>

            <div
              role="group"
              aria-label={t("projects.operations")}
              className="pointer-events-none absolute inset-y-0 right-0 flex items-center gap-0.5 opacity-0 transition-opacity duration-150 group-hover/project:pointer-events-auto group-hover/project:opacity-100 group-focus-within/project:pointer-events-auto group-focus-within/project:opacity-100 motion-reduce:transition-none [@media(hover:none)]:pointer-events-auto [@media(hover:none)]:opacity-100"
            >
              <button
                type="button"
                title={t("projects.moveUp")}
                aria-label={t("projects.moveUp")}
                disabled={index <= 0 || pendingAction !== null}
                onClick={() => void runAction("move-project", () => api.moveProject(project.id, "up"))}
                className={actionButtonClass}
              >
                <ChevronUp className="h-4 w-4" />
              </button>
              <button
                type="button"
                title={t("projects.moveDown")}
                aria-label={t("projects.moveDown")}
                disabled={index === partition.length - 1 || pendingAction !== null}
                onClick={() => void runAction("move-project", () => api.moveProject(project.id, "down"))}
                className={actionButtonClass}
              >
                <ChevronDown className="h-4 w-4" />
              </button>
              <button
                type="button"
                title={t("projectGroups.changeGroup")}
                aria-label={t("projectGroups.changeGroup")}
                onClick={() => {
                  setAssignmentGroupId(project.group_id);
                  setAssignmentTarget(project);
                }}
                className={actionButtonClass}
              >
                <FolderInput className="h-4 w-4" />
              </button>
              <button
                type="button"
                title={t("projects.openDir")}
                aria-label={t("projects.openDir")}
                onClick={() => void openProjectDirectory(project.path)}
                className={actionButtonClass}
              >
                <FolderOpen className="h-4 w-4" />
              </button>
              <button
                type="button"
                title={t(project.hidden ? "projects.showInSidebar" : "projects.hideFromSidebar")}
                aria-label={t(project.hidden ? "projects.showInSidebar" : "projects.hideFromSidebar")}
                disabled={pendingAction !== null}
                onClick={() => void runAction("hide-project", () => api.setProjectHidden(project.id, !project.hidden))}
                className={actionButtonClass}
              >
                {project.hidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
              <button
                type="button"
                title={t("common.delete")}
                aria-label={t("common.delete")}
                onClick={() => setDeleteProjectTarget(project)}
                className={dangerActionButtonClass}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </li>
    );
  }

  return (
    <div className="w-full max-w-7xl space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-emerald-400">
            <FolderGit2 className="h-3.5 w-3.5" />
            <span>Workspace Sync</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-100">{t("nav.projects")}</h1>
          <p className="mt-1 text-sm text-slate-400">{t("projects.pageDescription")}</p>
        </div>
        {activeView === "overview" ? (
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            {hasHiddenItems || showHiddenPreview ? (
              <Button
                variant="outline"
                size="sm"
                onClick={toggleHiddenPreview}
                loading={pendingAction === "hidden-preview"}
                aria-pressed={showHiddenPreview}
                aria-label={t(showHiddenPreview ? "projects.endHiddenProjectsPreview" : "projectGroups.showHiddenItems")}
                title={t(showHiddenPreview ? "projects.endHiddenProjectsPreview" : "projectGroups.showHiddenItems")}
                icon={showHiddenPreview ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                className="h-9 w-9 p-0"
              />
            ) : null}
            <Button variant="primary" onClick={addProject} loading={pendingAction === "add-project"} icon={<Plus className="h-4 w-4" />}>
              {t("projects.add")}
            </Button>
          </div>
        ) : null}
      </div>

      <div role="tablist" aria-label={t("projectGroups.viewLabel")} className="inline-flex border border-slate-800/80 bg-slate-950/35 p-1">
        <button
          type="button"
          role="tab"
          aria-selected={activeView === "overview"}
          onClick={() => setActiveView("overview")}
          className={`flex min-h-9 cursor-pointer items-center gap-2 px-3 text-sm font-medium transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-500/60 motion-reduce:transition-none ${
            activeView === "overview"
              ? "bg-slate-800 text-slate-100"
              : "text-slate-400 hover:bg-slate-900/70 hover:text-slate-200"
          }`}
        >
          <LayoutList className="h-4 w-4" />
          <span>{t("projectGroups.overviewTab")}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeView === "groups"}
          onClick={() => setActiveView("groups")}
          className={`flex min-h-9 cursor-pointer items-center gap-2 px-3 text-sm font-medium transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-500/60 motion-reduce:transition-none ${
            activeView === "groups"
              ? "bg-slate-800 text-slate-100"
              : "text-slate-400 hover:bg-slate-900/70 hover:text-slate-200"
          }`}
        >
          <ListTree className="h-4 w-4" />
          <span>{t("projectGroups.manageTab")}</span>
        </button>
      </div>

      {activeView === "groups" ? (
        <ProjectGroupsPage
          projects={projects}
          projectGroups={projectGroups}
          onReloadProjects={reload}
        />
      ) : (
        <>
          {error ? (
            <div role="alert" className="flex items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-400">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          ) : null}

          <div className="space-y-5">
            {sections.map(({ group, visibleProjects, hiddenProjects }, sectionIndex) => {
              const total = visibleProjects.length + hiddenProjects.length;
              const startsHiddenGroups = sectionIndex === firstHiddenGroupIndex && group.hidden;
              const name = groupLabel(group);
              return (
                <Fragment key={group.id}>
                  {startsHiddenGroups ? (
                    <div role="separator" aria-label={t("projectGroups.hiddenGroups")} className="flex items-center gap-2 py-1 text-xs font-medium text-slate-500 after:h-px after:flex-1 after:bg-slate-800/80">
                      <EyeOff className="h-3.5 w-3.5" />
                      <span>{t("projectGroups.hiddenGroups")}</span>
                    </div>
                  ) : null}
                  <section
                    aria-labelledby={`project-group-${group.id}`}
                    className={`group/project-group overflow-hidden border-y border-r border-slate-800/70 border-l-2 ${
                      group.hidden ? "border-l-slate-700" : "border-l-emerald-600/60"
                    }`}
                  >
                    <div className="flex min-h-12 items-center justify-between gap-3 border-b border-slate-800/70 bg-slate-900/25 px-3 sm:px-4">
                      <div className="flex min-w-0 items-center gap-2">
                        {group.hidden ? <EyeOff className="h-4 w-4 shrink-0 text-slate-500" /> : <FolderTree className="h-4 w-4 shrink-0 text-emerald-400" />}
                        <h2 id={`project-group-${group.id}`} className="truncate text-sm font-semibold text-slate-200">{name}</h2>
                        {group.hidden ? <Badge variant="neutral">{t("projectGroups.hiddenFromSidebar")}</Badge> : null}
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        {!group.is_system ? (
                          <button
                            type="button"
                            title={t(group.hidden ? "projectGroups.showInSidebar" : "projectGroups.hideFromSidebar")}
                            aria-label={t(group.hidden ? "projectGroups.showInSidebar" : "projectGroups.hideFromSidebar")}
                            disabled={pendingAction !== null}
                            onClick={() => void runAction("hide-group", () => api.setProjectGroupHidden(group.id, !group.hidden))}
                            className={`${actionButtonClass} opacity-0 transition-opacity group-hover/project-group:opacity-100 group-focus-within/project-group:opacity-100`}
                          >
                            {group.hidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        ) : null}
                        <span className="text-xs tabular-nums text-slate-500">
                          {t("projectGroups.projectCount", { count: total })}
                        </span>
                      </div>
                    </div>

                    {total === 0 ? (
                      <p className="px-4 py-4 text-xs text-slate-500">{t("projectGroups.empty")}</p>
                    ) : (
                      <ul>
                        {visibleProjects.map((project) => renderProjectRow(project, visibleProjects))}
                        {hiddenProjects.map((project) => renderProjectRow(project, hiddenProjects))}
                      </ul>
                    )}
                  </section>
                </Fragment>
              );
            })}
          </div>

          <Modal isOpen={assignmentTarget !== null} onClose={() => setAssignmentTarget(null)} title={t("projectGroups.changeGroupTitle")} footer={<><Button variant="ghost" onClick={() => setAssignmentTarget(null)}>{t("common.cancel")}</Button><Button variant="primary" onClick={assignProject} loading={pendingAction === "assign-project"} disabled={assignmentTarget?.group_id === assignmentGroupId}>{t("common.save")}</Button></>}>
            <label htmlFor="project-group-assignment" className="mb-1.5 block text-xs font-medium text-slate-400">{t("projectGroups.groupForProject", { name: assignmentTarget?.name ?? "" })}</label>
            <select id="project-group-assignment" value={assignmentGroupId} onChange={(event) => setAssignmentGroupId(Number(event.target.value))} className="w-full rounded-lg border border-slate-700/80 bg-slate-900 px-3.5 py-2 text-sm text-slate-100 focus:border-emerald-500/80 focus:outline-none focus:ring-2 focus:ring-emerald-500/60">
              {sections.map(({ group }) => <option key={group.id} value={group.id}>{groupLabel(group)}</option>)}
            </select>
          </Modal>

          <Modal isOpen={deleteProjectTarget !== null} onClose={() => setDeleteProjectTarget(null)} title={t("projects.deleteTitle")} footer={<><Button variant="ghost" size="sm" onClick={() => setDeleteProjectTarget(null)}>{t("common.cancel")}</Button><Button variant="danger" size="sm" onClick={deleteProject} loading={pendingAction === "delete-project"} icon={<Trash2 className="h-4 w-4" />}>{t("common.delete")}</Button></>}>
            {deleteProjectTarget ? <p className="text-sm leading-relaxed text-slate-300">{t("projects.deleteConfirm", { name: deleteProjectTarget.name })}</p> : null}
          </Modal>
        </>
      )}
    </div>
  );
}
