import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  FolderTree,
  Globe,
  HardDrive,
  LayoutList,
  Loader2,
  Search,
  Sparkles,
  X,
  XCircle,
} from "lucide-react";
import type { ListedSkill, Skill, SkillUpdateTask } from "../../types";
import Button from "../ui/Button";
import Input from "../ui/Input";
import EmptyState from "../ui/EmptyState";
import Alert from "../ui/Alert";
import Card from "../ui/Card";
import VirtualizedList from "../ui/VirtualizedList";
import SkillCard from "./components/SkillCard";
import RepoGroupCard from "./components/RepoGroupCard";
import { useDebounce } from "../../utils/debounce";
import { groupSkillsByRepo } from "../../utils/skillGrouping";

export type InstalledFilterKey = "all" | "net" | "local";
export type InstalledViewMode = "tree" | "flat";

interface InstalledTabProps {
  skills: ListedSkill[];
  searchQuery: string;
  setSearchQuery: (value: string) => void;
  filter: InstalledFilterKey;
  setFilter: (filter: InstalledFilterKey) => void;
  notice: string | null;
  error: string | null;
  onClearError: () => void;
  onActionError: (message: string) => void;
  updateTasks: Record<number, SkillUpdateTask>;
  updatesAtCapacity: boolean;
  onUpdate: (skill: Skill) => void;
  onUpdateGroup?: (skillIds: number[]) => void;
  onDelete: (skill: Skill) => void;
  onGoExplore: () => void;
  batchUpdating: boolean;
  batchSkillIds: number[];
  onDismissBatch: () => void;
  onViewReferences: (skill: Skill) => void;
}

/**
 * 已安装技能标签页 - 搜索/分类筛选/技能列表/树状与平铺视图
 */
export default function InstalledTab({
  skills,
  searchQuery,
  setSearchQuery,
  filter,
  setFilter,
  notice,
  error,
  onClearError,
  onActionError,
  updateTasks,
  updatesAtCapacity,
  onUpdate,
  onUpdateGroup,
  onDelete,
  onGoExplore,
  batchUpdating,
  batchSkillIds,
  onDismissBatch,
  onViewReferences,
}: InstalledTabProps) {
  const { t } = useTranslation();

  const [viewMode, setViewMode] = useState<InstalledViewMode>(() => {
    try {
      return localStorage.getItem("longan_installed_view_mode") === "flat" ? "flat" : "tree";
    } catch {
      return "tree";
    }
  });

  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  const toggleViewMode = useCallback((mode: InstalledViewMode) => {
    setViewMode(mode);
    try {
      localStorage.setItem("longan_installed_view_mode", mode);
    } catch {
      // Ignore localStorage errors
    }
  }, []);

  const updatableCount = useMemo(
    () => skills.filter((s) => s.status === "update_available").length,
    [skills]
  );
  const netCount = useMemo(
    () => skills.filter((s) => s.source_type === "net").length,
    [skills]
  );
  const localCount = useMemo(
    () => skills.filter((s) => s.source_type === "local").length,
    [skills]
  );
  const batchTasks = useMemo(
    () => batchSkillIds.map((skillId) => updateTasks[skillId]).filter(Boolean),
    [batchSkillIds, updateTasks]
  );
  const batchCompleted = batchTasks.filter((task) => task.status === "success").length;
  const batchFailed = batchTasks.filter((task) => task.status === "failed").length;
  const batchWaiting = batchSkillIds.length - batchCompleted - batchFailed;
  const batchProgress = batchSkillIds.length > 0
    ? Math.round(batchTasks.reduce((total, task) => total + task.progress, 0) / batchSkillIds.length)
    : 0;
  const batchProgressIndeterminate = batchTasks.some(
    (task) =>
      task.status === "updating" &&
      (task.phase === "retrying" ||
        (task.phase === "downloading" && task.totalBytes === null))
  );

  // 🔥 PERFORMANCE: 防抖搜索 + useMemo 缓存过滤与按组织分组排序结果
  const debouncedQuery = useDebounce(searchQuery, 300);

  const groupedSkills = useMemo(() => {
    return groupSkillsByRepo(skills, filter, debouncedQuery);
  }, [skills, filter, debouncedQuery]);

  // 平铺视图按组织排名：展平已按组织排序的分组数据，确保同组织 Skill 显示在一起（优先显示同组织）
  const filteredSkills = useMemo(() => {
    return groupedSkills.flatMap((group) => group.skills);
  }, [groupedSkills]);

  const allCollapsed = useMemo(
    () => groupedSkills.length > 0 && groupedSkills.every((g) => collapsedGroups.has(g.key)),
    [groupedSkills, collapsedGroups],
  );

  const handleToggleCollapse = useCallback((groupKey: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupKey)) {
        next.delete(groupKey);
      } else {
        next.add(groupKey);
      }
      return next;
    });
  }, []);

  const handleToggleExpandCollapseAll = useCallback(() => {
    if (allCollapsed) {
      setCollapsedGroups(new Set());
    } else {
      setCollapsedGroups(new Set(groupedSkills.map((g) => g.key)));
    }
  }, [allCollapsed, groupedSkills]);

  const isGroupCollapsed = useCallback(
    (groupKey: string) => {
      if (debouncedQuery.trim()) return false;
      return collapsedGroups.has(groupKey);
    },
    [debouncedQuery, collapsedGroups],
  );

  return (
    <div className="space-y-6">
      {/* Action & Filter Bar */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex-1 max-w-md">
            {skills.length > 0 && (
              <Input
                icon={<Search className="w-4 h-4" />}
                placeholder={t("library.searchPlaceholder")}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                rightElement={
                  searchQuery ? (
                    <button
                      type="button"
                      onClick={() => setSearchQuery("")}
                      className="text-slate-500 hover:text-slate-300 transition-colors focus:outline-none cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  ) : undefined
                }
              />
            )}
          </div>

          {skills.length > 0 && (
            <div className="flex items-center gap-2 self-start sm:self-auto">
              {/* Expand / Collapse All (only in Tree mode) */}
              {viewMode === "tree" && groupedSkills.length > 0 && (
                <button
                  type="button"
                  onClick={handleToggleExpandCollapseAll}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-slate-200 bg-slate-900/60 hover:bg-slate-800 border border-slate-800/80 transition-colors cursor-pointer"
                  title={allCollapsed ? t("library.expandAll") : t("library.collapseAll")}
                  aria-label={allCollapsed ? t("library.expandAll") : t("library.collapseAll")}
                >
                  {allCollapsed ? (
                    <ChevronDown className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronRight className="w-3.5 h-3.5" />
                  )}
                  <span>{allCollapsed ? t("library.expandAll") : t("library.collapseAll")}</span>
                </button>
              )}

              {/* View Mode Switcher */}
              <div
                role="group"
                aria-label="View Mode"
                className="inline-flex rounded-lg border border-slate-800/80 bg-slate-950/50 p-0.5"
              >
                <button
                  type="button"
                  onClick={() => toggleViewMode("tree")}
                  aria-pressed={viewMode === "tree"}
                  aria-label={t("library.viewModeTree")}
                  title={t("library.viewModeTree")}
                  className={`flex h-7 items-center gap-1.5 rounded-md px-2 text-xs font-medium transition-colors cursor-pointer ${
                    viewMode === "tree"
                      ? "bg-slate-800 text-emerald-400 shadow-sm"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <FolderTree className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{t("library.viewModeTree")}</span>
                </button>
                <button
                  type="button"
                  onClick={() => toggleViewMode("flat")}
                  aria-pressed={viewMode === "flat"}
                  aria-label={t("library.viewModeFlat")}
                  title={t("library.viewModeFlat")}
                  className={`flex h-7 items-center gap-1.5 rounded-md px-2 text-xs font-medium transition-colors cursor-pointer ${
                    viewMode === "flat"
                      ? "bg-slate-800 text-emerald-400 shadow-sm"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <LayoutList className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{t("library.viewModeFlat")}</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Filter Chips Bar */}
        {skills.length > 0 && (
          <>
            <div className="flex items-center gap-2 overflow-x-auto pb-1 pt-1">
              <button
                type="button"
                onClick={() => setFilter("all")}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 shrink-0 cursor-pointer ${
                  filter === "all"
                    ? "bg-emerald-600/20 text-emerald-300 border border-emerald-500/40 shadow-sm"
                    : "bg-slate-900/60 text-slate-400 hover:text-slate-200 border border-slate-800/80 hover:border-slate-700"
                }`}
              >
                <span>{t("library.filter.all")}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono ${
                    filter === "all"
                      ? "bg-emerald-500/30 text-emerald-200"
                      : "bg-slate-800 text-slate-500"
                  }`}
                >
                  {skills.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setFilter("net")}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 shrink-0 cursor-pointer ${
                  filter === "net"
                    ? "bg-emerald-600/20 text-emerald-300 border border-emerald-500/40 shadow-sm"
                    : "bg-slate-900/60 text-slate-400 hover:text-slate-200 border border-slate-800/80 hover:border-slate-700"
                }`}
              >
                <Globe className="w-3.5 h-3.5 text-emerald-400" />
                <span>{t("library.filter.net")}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono ${
                    filter === "net"
                      ? "bg-emerald-500/30 text-emerald-200"
                      : "bg-slate-800 text-slate-500"
                  }`}
                >
                  {netCount}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setFilter("local")}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 shrink-0 cursor-pointer ${
                  filter === "local"
                    ? "bg-emerald-600/20 text-emerald-300 border border-emerald-500/40 shadow-sm"
                    : "bg-slate-900/60 text-slate-400 hover:text-slate-200 border border-slate-800/80 hover:border-slate-700"
                }`}
              >
                <HardDrive className="w-3.5 h-3.5 text-slate-400" />
                <span>{t("library.filter.local")}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono ${
                    filter === "local"
                      ? "bg-emerald-500/30 text-emerald-200"
                      : "bg-slate-800 text-slate-500"
                  }`}
                >
                  {localCount}
                </span>
              </button>
            </div>
          </>
        )}

        {batchSkillIds.length > 0 && (
          <Card className="bg-slate-900/60 border-amber-500/40" aria-live="polite">
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <span className="font-semibold text-sm text-amber-300">
                  {t("library.batchProgress")}
                </span>
                <div className="flex gap-4 text-xs text-slate-400">
                  <span>{t("library.batchSuccess", { count: batchCompleted })}</span>
                  <span>{t("library.batchFailed", { count: batchFailed })}</span>
                  <span>{t("library.batchWaiting", { count: batchWaiting })}</span>
                </div>
              </div>
              <div
                className="h-2 overflow-hidden rounded-full bg-slate-800"
                role="progressbar"
                aria-label={t("library.batchProgress")}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={batchProgressIndeterminate ? undefined : batchProgress}
              >
                <div
                  className={`h-full rounded-full bg-amber-500 transition-[width] duration-300 ${
                    batchProgressIndeterminate ? "w-full animate-shimmer" : ""
                  }`}
                  style={batchProgressIndeterminate ? undefined : { width: `${batchProgress}%` }}
                />
              </div>
              <div className="max-h-48 space-y-1.5 overflow-y-auto pr-1 custom-scrollbar">
                {batchTasks.map((task) => (
                  <div key={task.skillId} className="flex items-center gap-2 rounded bg-slate-950/40 px-2.5 py-2 text-xs">
                    {task.status === "success" ? (
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                    ) : task.status === "failed" ? (
                      <XCircle className="h-3.5 w-3.5 shrink-0 text-rose-400" />
                    ) : task.status === "updating" ? (
                      <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-amber-400" />
                    ) : (
                      <span className="h-2 w-2 shrink-0 rounded-full bg-slate-600" />
                    )}
                    <span className="min-w-0 flex-1 truncate text-slate-300">{task.name}</span>
                    <span className="shrink-0 text-slate-500">
                      {task.status === "queued"
                        ? t("library.updateQueued")
                        : task.phase
                          ? t(`library.updatePhase.${task.phase}`)
                          : ""}
                    </span>
                    <span className="w-16 shrink-0 text-right font-mono text-slate-500">
                      {task.phase === "downloading" && task.totalBytes === null
                        ? task.downloadedBytes === null
                          ? ""
                          : formatBytes(task.downloadedBytes)
                        : task.phase === "retrying"
                          ? ""
                          : `${task.progress}%`}
                    </span>
                  </div>
                ))}
              </div>
              {!batchUpdating && (
                <div className="flex justify-end pt-1">
                  <Button variant="outline" size="sm" onClick={onDismissBatch}>
                    {t("common.close")}
                  </Button>
                </div>
              )}
            </div>
          </Card>
        )}

        {updatableCount > 0 && !batchUpdating && batchSkillIds.length === 0 && (
          <div className="flex items-center justify-between py-2 bg-amber-500/5 rounded-lg p-3">
            <div className="text-xs text-amber-400">
              {t('library.batchUpdatePrompt', { count: updatableCount })}
            </div>
          </div>
        )}
      </div>

      {/* Feedback Messages */}
      {notice && <Alert type="success" message={notice} duration={3000} />}
      {error && <Alert type="error" message={error} onClose={onClearError} />}

      {skills.length === 0 ? (
        <EmptyState
          icon={<BookOpen className="w-8 h-8 text-slate-500" />}
          title={t("library.noInstalledSkills")}
          description={t("library.localHint")}
          action={
            <Button
              variant="primary"
              size="sm"
              onClick={onGoExplore}
              icon={<Sparkles className="w-3.5 h-3.5" />}
            >
              {t("library.goToMarket")}
            </Button>
          }
        />
      ) : (viewMode === "tree" ? groupedSkills.length === 0 : filteredSkills.length === 0) ? (
        <EmptyState
          icon={<Search className="w-8 h-8 text-amber-400" />}
          title={t("library.noSearchResults")}
          description={t("library.noSearchResultsDesc")}
          action={
            filter !== "all" || searchQuery ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setFilter("all");
                  setSearchQuery("");
                }}
              >
                {t("library.resetFilters")}
              </Button>
            ) : undefined
          }
        />
      ) : viewMode === "tree" ? (
        <div className="space-y-4" role="list" aria-label={t("nav.installed")}>
          {groupedSkills.map((group) => (
            <RepoGroupCard
              key={group.key}
              group={group}
              isCollapsed={isGroupCollapsed(group.key)}
              onToggleCollapse={handleToggleCollapse}
              updateTasks={updateTasks}
              updatesAtCapacity={updatesAtCapacity}
              onUpdate={onUpdate}
              onUpdateGroup={onUpdateGroup}
              onDelete={onDelete}
              onViewReferences={onViewReferences}
              onActionError={onActionError}
              batchUpdating={batchUpdating}
            />
          ))}
        </div>
      ) : (
        <VirtualizedList
          items={filteredSkills}
          getItemKey={(skill) => skill.id}
          ariaLabel={t("nav.installed")}
          resetKey={`${filter}:${debouncedQuery}`}
          className="grid grid-cols-1 gap-3"
          renderItem={(skill) => (
            <SkillCard
              skill={skill}
              viewMode="flat"
              updateTask={updateTasks[skill.id]}
              updateDisabled={!updateTasks[skill.id] && updatesAtCapacity}
              onUpdate={onUpdate}
              onDelete={onDelete}
              onViewReferences={onViewReferences}
              onActionError={onActionError}
            />
          )}
        />
      )}
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
