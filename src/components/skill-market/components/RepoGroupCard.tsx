import { memo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  ChevronDown,
  ChevronRight,
  FolderOpen,
  Globe,
  HardDrive,
  Loader2,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { api, errorMessage } from "../../../api";
import GithubIcon from "../../icons/GithubIcon";
import HoverActionGroup from "../../ui/HoverActionGroup";
import type { Skill, SkillUpdateTask } from "../../../types";
import type { SkillRepoGroup } from "../../../utils/skillGrouping";
import SkillCard from "./SkillCard";

interface RepoGroupCardProps {
  group: SkillRepoGroup;
  isCollapsed: boolean;
  onToggleCollapse: (groupKey: string) => void;
  updateTasks: Record<number, SkillUpdateTask>;
  updatesAtCapacity: boolean;
  onUpdate: (skill: Skill) => void;
  onUpdateGroup?: (skillIds: number[]) => void;
  onDelete: (skill: Skill) => void;
  onViewReferences: (skill: Skill) => void;
  onActionError: (message: string) => void;
  batchUpdating?: boolean;
}

const RepoGroupCard = memo(function RepoGroupCard({
  group,
  isCollapsed,
  onToggleCollapse,
  updateTasks,
  updatesAtCapacity,
  onUpdate,
  onUpdateGroup,
  onDelete,
  onViewReferences,
  onActionError,
  batchUpdating = false,
}: RepoGroupCardProps) {
  const { t } = useTranslation();

  const isGroupUpdating = group.skills.some(
    (s) => updateTasks[s.id]?.status === "queued" || updateTasks[s.id]?.status === "updating",
  );

  const handleOpenGithub = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!group.githubUrl) return;
      try {
        await openUrl(group.githubUrl);
      } catch {
        window.open(group.githubUrl, "_blank", "noopener,noreferrer");
      }
    },
    [group.githubUrl],
  );

  const handleOpenDir = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      try {
        await api.openSkillGroupDir(group.sourceType, group.owner, group.repo);
      } catch (error) {
        onActionError(errorMessage(error));
      }
    },
    [group.owner, group.repo, group.sourceType, onActionError],
  );

  const handleUpdateGroup = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!onUpdateGroup) return;
      const updatableSkillIds = group.skills
        .filter((s) => s.status === "update_available" && s.source_type === "net")
        .map((s) => s.id);
      if (updatableSkillIds.length > 0) {
        onUpdateGroup(updatableSkillIds);
      }
    },
    [group.skills, onUpdateGroup],
  );

  const displayName =
    group.sourceType === "local" ? t("library.localGroup") : group.title;

  return (
    <div className="space-y-1">
      {/* Group Header Card */}
      <div
        role="button"
        tabIndex={0}
        aria-expanded={!isCollapsed}
        aria-label={`${displayName} (${group.skills.length})`}
        onClick={() => onToggleCollapse(group.key)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggleCollapse(group.key);
          }
        }}
        className="group group/repo flex w-full cursor-pointer items-center justify-between rounded-xl border border-slate-800/90 bg-slate-900/50 px-3.5 py-2.5 transition-colors hover:border-slate-700 hover:bg-slate-900/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50"
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-slate-400 transition-colors group-hover/repo:text-slate-200">
            {isCollapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </span>

          <span className="shrink-0 text-slate-400">
            {group.sourceType === "net" ? (
              <Globe className="h-4 w-4 text-emerald-400" />
            ) : (
              <HardDrive className="h-4 w-4 text-slate-400" />
            )}
          </span>

          <span className="truncate font-mono text-xs sm:text-sm font-medium text-slate-200">
            {displayName}
          </span>

          <span className="shrink-0 rounded-full border border-slate-700/60 bg-slate-800/80 px-2 py-0.5 font-mono text-[11px] text-slate-400">
            {t("library.repoSkillCount", { count: group.skills.length })}
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <HoverActionGroup>
            {group.githubUrl && (
              <button
                type="button"
                onClick={handleOpenGithub}
                title={t("library.openGithub")}
                aria-label={t("library.openGithub")}
                className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-slate-700/60 bg-slate-800/80 text-slate-400 transition-colors hover:border-slate-600 hover:text-slate-100 hover:bg-slate-700/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50"
              >
                <GithubIcon className="h-3.5 w-3.5 text-slate-300" />
              </button>
            )}

            <button
              type="button"
              onClick={handleOpenDir}
              title={t("library.openLocalDir")}
              aria-label={t("library.openLocalDir")}
              className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-slate-700/60 bg-slate-800/80 text-slate-400 transition-colors hover:border-slate-600 hover:text-slate-100 hover:bg-slate-700/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50"
            >
              <FolderOpen className="h-3.5 w-3.5 text-slate-300" />
            </button>
          </HoverActionGroup>

          {group.updatableCount > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-300">
              <Sparkles className="h-3 w-3 text-amber-400" />
              <span>{t("library.updatableCount", { count: group.updatableCount })}</span>
            </span>
          )}

          {group.updatableCount > 0 && onUpdateGroup && group.sourceType === "net" && (
            <button
              type="button"
              onClick={handleUpdateGroup}
              disabled={isGroupUpdating || batchUpdating || updatesAtCapacity}
              title={t("library.updateRepo")}
              aria-label={t("library.updateRepo")}
              className="flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-300 transition-colors hover:border-amber-500/60 hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isGroupUpdating ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              <span className="hidden sm:inline">{t("library.updateRepo")}</span>
            </button>
          )}
        </div>
      </div>

      {/* Group Children (Skills Tree) */}
      {!isCollapsed && (
        <div
          className="relative ml-4 space-y-2 border-l-2 border-slate-800/80 pl-4 pt-1 pb-1 sm:ml-5 sm:pl-5"
          role="region"
          aria-label={displayName}
        >
          {group.skills.map((skill) => (
            <div key={skill.id} className="relative">
              {/* Tree horizontal connector */}
              <div
                className="absolute -left-4 top-5 h-px w-3 bg-slate-800 sm:-left-5 sm:w-4"
                aria-hidden="true"
              />
              <SkillCard
                skill={skill}
                viewMode="tree"
                updateTask={updateTasks[skill.id]}
                updateDisabled={!updateTasks[skill.id] && updatesAtCapacity}
                onUpdate={onUpdate}
                onDelete={onDelete}
                onViewReferences={onViewReferences}
                onActionError={onActionError}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
});

export default RepoGroupCard;
