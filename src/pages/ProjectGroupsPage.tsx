import {
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import {
  AlertCircle,
  ArrowDownToLine,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  FolderInput,
  FolderTree,
  FolderX,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";

import { api, errorMessage } from "../api";
import type { Project, ProjectGroup } from "../types";
import Badge from "../components/ui/Badge";
import Button from "../components/ui/Button";
import Input from "../components/ui/Input";
import Modal from "../components/ui/Modal";

interface ProjectGroupsPageProps {
  projects: Project[];
  projectGroups: ProjectGroup[];
  onReloadProjects: () => Promise<void>;
}

type GroupModal =
  | { mode: "create" }
  | { mode: "edit"; group: ProjectGroup };

interface SelectionCheckboxProps {
  checked: boolean;
  indeterminate?: boolean;
  disabled?: boolean;
  label: string;
  onChange: () => void;
}

function SelectionCheckbox({
  checked,
  indeterminate = false,
  disabled = false,
  label,
  onChange,
}: SelectionCheckboxProps) {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);

  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      disabled={disabled}
      aria-label={label}
      onChange={onChange}
      className="h-4 w-4 shrink-0 cursor-pointer rounded border-slate-600 bg-slate-900 accent-emerald-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/70 disabled:cursor-not-allowed disabled:opacity-40"
    />
  );
}

interface ProjectSelectionRowProps {
  project: Project;
  checked: boolean;
  disabled: boolean;
  hiddenLabel: string;
  missingLabel: string;
  onToggle: () => void;
}

function ProjectSelectionRow({
  project,
  checked,
  disabled,
  hiddenLabel,
  missingLabel,
  onToggle,
}: ProjectSelectionRowProps) {
  return (
    <label
      className={`flex min-h-16 cursor-pointer items-center gap-3 border-b border-slate-800/70 px-3 py-2.5 transition-colors duration-150 last:border-b-0 hover:bg-slate-900/55 motion-reduce:transition-none [contain-intrinsic-size:4rem] [content-visibility:auto] ${
        checked ? "bg-emerald-500/[0.07]" : ""
      } ${disabled ? "cursor-not-allowed opacity-60" : ""}`}
    >
      <SelectionCheckbox
        checked={checked}
        disabled={disabled}
        label={project.name}
        onChange={onToggle}
      />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <span className="truncate text-sm font-medium text-slate-200">
            {project.name}
          </span>
          {project.hidden ? <Badge variant="neutral">{hiddenLabel}</Badge> : null}
          {!project.path_exists ? (
            <Badge variant="danger">
              <FolderX className="h-3 w-3" />
              <span>{missingLabel}</span>
            </Badge>
          ) : null}
        </div>
        <p className="mt-1 truncate font-mono text-xs text-slate-500" title={project.path}>
          {project.path}
        </p>
      </div>
    </label>
  );
}

const groupActionButtonClass =
  "flex h-6 w-6 cursor-pointer items-center justify-center rounded p-1 text-slate-400 transition-colors duration-150 hover:bg-slate-800/60 hover:text-emerald-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60 disabled:cursor-not-allowed disabled:opacity-25 motion-reduce:transition-none";

export default function ProjectGroupsPage({
  projects,
  projectGroups,
  onReloadProjects,
}: ProjectGroupsPageProps) {
  const { t } = useTranslation();
  const [activeGroupId, setActiveGroupId] = useState<number | null>(() =>
    projectGroups.find((group) => !group.is_system)?.id ?? null,
  );
  const [searchQuery, setSearchQuery] = useState("");
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const [selectedInsideIds, setSelectedInsideIds] = useState<Set<number>>(new Set());
  const [selectedUngroupedIds, setSelectedUngroupedIds] = useState<Set<number>>(new Set());
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [groupModal, setGroupModal] = useState<GroupModal | null>(null);
  const [groupName, setGroupName] = useState("");
  const [deleteGroupTarget, setDeleteGroupTarget] = useState<ProjectGroup | null>(null);

  const groupsById = useMemo(
    () => new Map(projectGroups.map((group) => [group.id, group])),
    [projectGroups],
  );
  const manageableGroups = useMemo(
    () => projectGroups.filter((group) => !group.is_system),
    [projectGroups],
  );
  const activeGroup =
    manageableGroups.find((group) => group.id === activeGroupId) ??
    manageableGroups[0] ??
    null;
  const resolvedActiveGroupId = activeGroup?.id ?? null;

  useEffect(() => {
    if (activeGroupId === resolvedActiveGroupId) return;
    setActiveGroupId(resolvedActiveGroupId);
    setSelectedInsideIds(new Set());
    setSelectedUngroupedIds(new Set());
    setError(null);
    setAnnouncement("");
  }, [activeGroupId, resolvedActiveGroupId]);

  const groupLabel = (group: ProjectGroup) =>
    group.is_system ? t("projectGroups.ungrouped") : group.name ?? "";

  const normalizedSearch = deferredSearchQuery.trim().toLocaleLowerCase();
  const filteredProjects = useMemo(() => {
    if (!normalizedSearch) return projects;
    return projects.filter((project) => {
      const group = groupsById.get(project.group_id);
      const groupName = group
        ? group.is_system
          ? t("projectGroups.ungrouped")
          : group.name ?? ""
        : "";
      return [project.name, project.path, groupName].some((value) =>
        value.toLocaleLowerCase().includes(normalizedSearch),
      );
    });
  }, [groupsById, normalizedSearch, projects, t]);

  const insideProjects = useMemo(
    () =>
      activeGroup
        ? filteredProjects.filter((project) => project.group_id === activeGroup.id)
        : [],
    [activeGroup, filteredProjects],
  );
  const ungroupedProjects = useMemo(
    () => filteredProjects.filter((project) => project.group_id === 0),
    [filteredProjects],
  );
  const projectCountByGroup = useMemo(() => {
    const counts = new Map<number, number>();
    for (const project of projects) {
      counts.set(project.group_id, (counts.get(project.group_id) ?? 0) + 1);
    }
    return counts;
  }, [projects]);

  const allInsideSelected =
    insideProjects.length > 0 && insideProjects.every(({ id }) => selectedInsideIds.has(id));
  const someInsideSelected = insideProjects.some(({ id }) => selectedInsideIds.has(id));
  const allUngroupedSelected =
    ungroupedProjects.length > 0 &&
    ungroupedProjects.every(({ id }) => selectedUngroupedIds.has(id));
  const someUngroupedSelected = ungroupedProjects.some(({ id }) =>
    selectedUngroupedIds.has(id),
  );

  function changeActiveGroup(groupId: number | null) {
    setActiveGroupId(groupId);
    setSelectedInsideIds(new Set());
    setSelectedUngroupedIds(new Set());
    setError(null);
    setAnnouncement("");
  }

  function toggleSelection(
    setter: React.Dispatch<React.SetStateAction<Set<number>>>,
    projectId: number,
  ) {
    setter((current) => {
      const next = new Set(current);
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      return next;
    });
  }

  function toggleAllFiltered(
    setter: React.Dispatch<React.SetStateAction<Set<number>>>,
    filtered: readonly Project[],
    allSelected: boolean,
  ) {
    setter((current) => {
      const next = new Set(current);
      for (const project of filtered) {
        if (allSelected) next.delete(project.id);
        else next.add(project.id);
      }
      return next;
    });
  }

  async function runAction(
    key: string,
    action: () => Promise<unknown>,
    refresh = true,
  ) {
    if (pendingAction !== null) return false;
    setError(null);
    setAnnouncement("");
    setPendingAction(key);
    try {
      await action();
      if (refresh) await onReloadProjects();
      return true;
    } catch (actionError) {
      setError(errorMessage(actionError));
      return false;
    } finally {
      setPendingAction(null);
    }
  }

  async function moveProjects(
    selectedIds: ReadonlySet<number>,
    targetGroupId: number,
    key: string,
  ) {
    const orderedIds = projects
      .filter(({ id }) => selectedIds.has(id))
      .map(({ id }) => id);
    if (orderedIds.length === 0) return;

    let moved = 0;
    const success = await runAction(key, async () => {
      moved = await api.setProjectsGroup(orderedIds, targetGroupId);
    });
    if (!success) return;

    setSelectedInsideIds(new Set());
    setSelectedUngroupedIds(new Set());
    setAnnouncement(t("projectGroups.movedAnnouncement", { count: moved }));
  }

  function openCreateGroup() {
    setGroupName("");
    setGroupModal({ mode: "create" });
  }

  function openEditGroup(group: ProjectGroup) {
    setGroupName(group.name ?? "");
    setGroupModal({ mode: "edit", group });
  }

  async function submitGroup() {
    if (!groupModal || !groupName.trim()) return;
    const success = await runAction("save-group", async () => {
      if (groupModal.mode === "create") {
        await api.createProjectGroup(groupName.trim());
      } else {
        await api.updateProjectGroup(groupModal.group.id, groupName.trim());
      }
    });
    if (!success) return;
    setGroupModal(null);
  }

  async function deleteGroup() {
    if (!deleteGroupTarget) return;
    const deletedId = deleteGroupTarget.id;
    const success = await runAction("delete-group", () =>
      api.deleteProjectGroup(deletedId),
    );
    if (!success) return;
    setDeleteGroupTarget(null);
    if (activeGroup?.id === deletedId) {
      const fallback = manageableGroups.find(({ id }) => id !== deletedId);
      changeActiveGroup(fallback?.id ?? null);
    }
  }

  function renderGroupActions(group: ProjectGroup) {
    if (group.is_system) return null;

    const sameStateGroups = manageableGroups.filter(
      (candidate) => candidate.hidden === group.hidden,
    );
    const movableIndex = sameStateGroups.findIndex(({ id }) => id === group.id);
    const name = groupLabel(group);
    return (
      <div
        role="group"
        aria-label={t("projectGroups.operations", { name })}
        className="mt-2 flex min-h-6 flex-wrap items-center gap-0.5 pl-1 opacity-0 transition-opacity group-hover/group-item:opacity-100 group-focus-within/group-item:opacity-100 [@media(hover:none)]:opacity-100 motion-reduce:transition-none"
      >
        <button
          type="button"
          title={t("projects.moveUp")}
          aria-label={t("projects.moveUp")}
          disabled={movableIndex <= 0 || pendingAction !== null}
          onClick={() => void runAction("move-group", () => api.moveProjectGroup(group.id, "up"))}
          className={groupActionButtonClass}
        >
          <ChevronUp className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          title={t("projects.moveDown")}
          aria-label={t("projects.moveDown")}
          disabled={movableIndex === sameStateGroups.length - 1 || pendingAction !== null}
          onClick={() => void runAction("move-group", () => api.moveProjectGroup(group.id, "down"))}
          className={groupActionButtonClass}
        >
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          title={t(group.hidden ? "projectGroups.showInSidebar" : "projectGroups.hideFromSidebar")}
          aria-label={t(group.hidden ? "projectGroups.showInSidebar" : "projectGroups.hideFromSidebar")}
          disabled={pendingAction !== null}
          onClick={() => void runAction("hide-group", () => api.setProjectGroupHidden(group.id, !group.hidden))}
          className={groupActionButtonClass}
        >
          {group.hidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
        </button>
        <button
          type="button"
          title={t("common.edit")}
          aria-label={t("common.edit")}
          onClick={() => openEditGroup(group)}
          className={groupActionButtonClass}
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          title={t("common.delete")}
          aria-label={t("common.delete")}
          onClick={() => setDeleteGroupTarget(group)}
          className={`${groupActionButtonClass} hover:bg-rose-500/10 hover:text-rose-300`}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  const activeGroupName = activeGroup ? groupLabel(activeGroup) : "";
  const busy = pendingAction !== null;

  return (
    <div className="space-y-4">
      {error ? (
        <div role="alert" className="flex items-center gap-2 border-y border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}
      <p aria-live="polite" className="sr-only">{announcement}</p>

      {activeGroup ? (
        <div className="grid min-h-[34rem] grid-cols-1 gap-4 lg:grid-cols-[296px_minmax(0,1fr)]">
          <aside aria-label={t("projectGroups.manageTab")} className="border border-slate-800/80 bg-slate-950/25">
          <div className="flex min-h-14 items-center justify-between border-b border-slate-800/80 px-3">
            <h2 className="text-sm font-semibold text-slate-200">{t("projectGroups.groupsTitle")}</h2>
            <Button
              variant="ghost"
              size="sm"
              onClick={openCreateGroup}
              aria-label={t("projectGroups.create")}
              title={t("projectGroups.create")}
              icon={<Plus className="h-4 w-4" />}
              className="h-9 w-9 p-0"
            />
          </div>
          <ul className="max-h-[38rem] space-y-2 overflow-y-auto py-3">
            {manageableGroups.map((group) => {
              const active = group.id === activeGroup.id;
              const name = groupLabel(group);
              return (
                <li
                  key={group.id}
                  className={`group/group-item relative h-[90px] w-full rounded-xl border p-3.5 transition-all duration-150 focus-within:border-emerald-500/40 motion-reduce:transition-none ${
                    active
                      ? "border-emerald-500/30 bg-slate-900/60 hover:border-emerald-500/40"
                      : "border-slate-800/80 bg-slate-950/40 hover:border-slate-700 hover:bg-slate-900/60"
                  }`}
                >
                  {active ? (
                    <div className="absolute bottom-2 left-0 top-2 w-1 rounded-r-full bg-emerald-500/60" />
                  ) : null}
                  <div className="absolute right-3.5 top-3.5">
                    <Badge
                      variant={active ? "info" : "neutral"}
                      className="px-1.5 py-0 text-[10px]"
                    >
                      {projectCountByGroup.get(group.id) ?? 0}
                    </Badge>
                  </div>
                  <button
                    type="button"
                    aria-label={name}
                    aria-pressed={active}
                    onClick={() => changeActiveGroup(group.id)}
                    className="flex min-h-7 w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1 pr-9 text-left transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60 motion-reduce:transition-none"
                  >
                    {group.hidden ? (
                      <EyeOff className="h-4 w-4 shrink-0 text-slate-500" />
                    ) : (
                      <FolderTree className={`h-4 w-4 shrink-0 ${active ? "text-emerald-400" : "text-slate-500"}`} />
                    )}
                    <span className={`min-w-0 flex-1 truncate text-sm ${active ? "font-semibold text-slate-100" : "text-slate-300"}`} title={name}>
                      {name}
                    </span>
                  </button>
                  {renderGroupActions(group)}
                </li>
              );
            })}
          </ul>
          </aside>

        <section aria-labelledby="active-project-group-heading" className="min-w-0 space-y-4">
          <div className="flex flex-col gap-3 border-y border-slate-800/80 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <h2 id="active-project-group-heading" className="truncate text-base font-semibold text-slate-100">
                {activeGroupName}
              </h2>
              <p className="mt-0.5 text-xs tabular-nums text-slate-500">
                {t("projectGroups.projectCount", { count: projectCountByGroup.get(activeGroup.id) ?? 0 })}
              </p>
            </div>
            <div className="w-full sm:max-w-sm">
              <Input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder={t("projectGroups.searchPlaceholder")}
                aria-label={t("projectGroups.searchPlaceholder")}
                icon={<Search className="h-4 w-4" />}
                rightElement={searchQuery ? (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="cursor-pointer text-xs text-slate-400 hover:text-slate-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60"
                  >
                    {t("common.clear")}
                  </button>
                ) : undefined}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <section aria-labelledby="inside-projects-heading" className="min-w-0 border border-slate-800/80 bg-slate-950/20">
              <div className="flex min-h-14 items-center gap-3 border-b border-slate-800/80 px-3">
                <SelectionCheckbox
                  checked={allInsideSelected}
                  indeterminate={!allInsideSelected && someInsideSelected}
                  disabled={insideProjects.length === 0 || busy}
                  label={t("projectGroups.selectAllInside")}
                  onChange={() => toggleAllFiltered(setSelectedInsideIds, insideProjects, allInsideSelected)}
                />
                <h3 id="inside-projects-heading" className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-200">
                  {t("projectGroups.insideTitle", { name: activeGroupName })}
                </h3>
                <span className="font-mono text-xs tabular-nums text-slate-500">
                  {insideProjects.length}
                </span>
              </div>
              <div className="h-[25rem] overflow-y-auto">
                {insideProjects.length === 0 ? (
                  <p className="px-4 py-10 text-center text-sm text-slate-500">
                    {normalizedSearch ? t("projectGroups.noSearchResults") : t("projectGroups.noInsideProjects")}
                  </p>
                ) : (
                  insideProjects.map((project) => (
                    <ProjectSelectionRow
                      key={project.id}
                      project={project}
                      checked={selectedInsideIds.has(project.id)}
                      disabled={busy}
                      hiddenLabel={t("projects.hiddenFromSidebar")}
                      missingLabel={t("projects.pathMissing")}
                      onToggle={() => toggleSelection(setSelectedInsideIds, project.id)}
                    />
                  ))
                )}
              </div>
              <div className="flex min-h-14 items-center justify-between gap-2 border-t border-slate-800/80 px-3 py-2">
                <span className="text-xs tabular-nums text-slate-500">
                  {t("projectGroups.selectedCount", { count: selectedInsideIds.size })}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  loading={pendingAction === "move-to-ungrouped"}
                  disabled={selectedInsideIds.size === 0 || busy}
                  onClick={() => void moveProjects(selectedInsideIds, 0, "move-to-ungrouped")}
                  icon={<ArrowDownToLine className="h-4 w-4" />}
                >
                  {t("projectGroups.moveToUngrouped", { count: selectedInsideIds.size })}
                </Button>
              </div>
            </section>

            <section aria-labelledby="ungrouped-projects-heading" className="min-w-0 border border-slate-800/80 bg-slate-950/20">
              <div className="flex min-h-14 items-center gap-3 border-b border-slate-800/80 px-3">
                <SelectionCheckbox
                  checked={allUngroupedSelected}
                  indeterminate={!allUngroupedSelected && someUngroupedSelected}
                  disabled={ungroupedProjects.length === 0 || busy}
                  label={t("projectGroups.selectAllUngrouped")}
                  onChange={() => toggleAllFiltered(setSelectedUngroupedIds, ungroupedProjects, allUngroupedSelected)}
                />
                <h3 id="ungrouped-projects-heading" className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-200">
                  {t("projectGroups.ungroupedProjectsTitle")}
                </h3>
                <span className="font-mono text-xs tabular-nums text-slate-500">
                  {ungroupedProjects.length}
                </span>
              </div>
              <div className="h-[25rem] overflow-y-auto">
                {ungroupedProjects.length === 0 ? (
                  <p className="px-4 py-10 text-center text-sm text-slate-500">
                    {normalizedSearch ? t("projectGroups.noSearchResults") : t("projectGroups.noUngroupedProjects")}
                  </p>
                ) : (
                  ungroupedProjects.map((project) => (
                    <ProjectSelectionRow
                      key={project.id}
                      project={project}
                      checked={selectedUngroupedIds.has(project.id)}
                      disabled={busy}
                      hiddenLabel={t("projects.hiddenFromSidebar")}
                      missingLabel={t("projects.pathMissing")}
                      onToggle={() => toggleSelection(setSelectedUngroupedIds, project.id)}
                    />
                  ))
                )}
              </div>
              <div className="flex min-h-14 items-center justify-between gap-2 border-t border-slate-800/80 px-3 py-2">
                <span className="text-xs tabular-nums text-slate-500">
                  {t("projectGroups.selectedCount", { count: selectedUngroupedIds.size })}
                </span>
                <Button
                  variant="primary"
                  size="sm"
                  loading={pendingAction === "move-into-group"}
                  disabled={selectedUngroupedIds.size === 0 || busy}
                  onClick={() => void moveProjects(selectedUngroupedIds, activeGroup.id, "move-into-group")}
                  icon={<FolderInput className="h-4 w-4" />}
                >
                  {t("projectGroups.moveIntoGroup", { count: selectedUngroupedIds.size, name: activeGroupName })}
                </Button>
              </div>
            </section>
          </div>
          </section>
        </div>
      ) : (
        <div className="flex min-h-[34rem] flex-col items-center justify-center gap-4 border-y border-slate-800/70 px-6 text-center">
          <FolderTree className="h-8 w-8 text-slate-500" />
          <p className="text-sm text-slate-400">{t("projectGroups.noGroups")}</p>
          <Button variant="primary" onClick={openCreateGroup} icon={<Plus className="h-4 w-4" />}>
            {t("projectGroups.create")}
          </Button>
        </div>
      )}

      <Modal
        isOpen={groupModal !== null}
        onClose={() => setGroupModal(null)}
        title={t(groupModal?.mode === "edit" ? "projectGroups.editTitle" : "projectGroups.createTitle")}
        footer={
          <>
            <Button variant="ghost" onClick={() => setGroupModal(null)}>{t("common.cancel")}</Button>
            <Button variant="primary" onClick={submitGroup} loading={pendingAction === "save-group"} disabled={!groupName.trim()}>
              {t(groupModal?.mode === "edit" ? "common.save" : "common.create")}
            </Button>
          </>
        }
      >
        <label htmlFor="managed-project-group-name" className="mb-1.5 block text-xs font-medium text-slate-400">
          {t("projectGroups.name")}
        </label>
        <Input
          id="managed-project-group-name"
          value={groupName}
          maxLength={50}
          autoFocus
          onChange={(event) => setGroupName(event.target.value)}
          onKeyDown={(event) => { if (event.key === "Enter") void submitGroup(); }}
          placeholder={t("projectGroups.namePlaceholder")}
        />
      </Modal>

      <Modal
        isOpen={deleteGroupTarget !== null}
        onClose={() => setDeleteGroupTarget(null)}
        title={t("projectGroups.deleteTitle")}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleteGroupTarget(null)}>{t("common.cancel")}</Button>
            <Button variant="danger" onClick={deleteGroup} loading={pendingAction === "delete-group"} icon={<Trash2 className="h-4 w-4" />}>
              {t("common.delete")}
            </Button>
          </>
        }
      >
        {deleteGroupTarget ? (
          <p className="text-sm leading-relaxed text-slate-300">
            {t("projectGroups.deleteConfirm", {
              name: groupLabel(deleteGroupTarget),
              count: projectCountByGroup.get(deleteGroupTarget.id) ?? 0,
            })}
          </p>
        ) : null}
      </Modal>
    </div>
  );
}
