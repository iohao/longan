import { memo, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ChevronDown,
  ChevronRight,
  FolderOpen,
  FolderTree,
  Globe,
  HardDrive,
  Layers,
} from "lucide-react";
import { api, errorMessage } from "../../../api";
import type { ListedSkill, Skill, SkillUpdateTask } from "../../../types";
import Badge from "../../ui/Badge";
import SkillActions from "./SkillActions";

interface SkillCardProps {
  skill: ListedSkill;
  updateTask?: SkillUpdateTask;
  updateDisabled: boolean;
  viewMode?: "tree" | "flat";
  onUpdate: (skill: Skill) => void;
  onDelete: (skill: Skill) => void;
  onViewReferences: (skill: Skill) => void;
  onActionError: (message: string) => void;
  searchQuery?: string;
}

const SkillCard = memo(function SkillCard({
  skill,
  updateTask,
  updateDisabled,
  viewMode = "flat",
  onUpdate,
  onDelete,
  onViewReferences,
  onActionError,
  searchQuery = "",
}: SkillCardProps) {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(() => viewMode === "tree");

  const updateInProgress = updateTask?.status === "queued" || updateTask?.status === "updating";
  const indeterminateDownload =
    updateTask?.phase === "retrying" ||
    (updateTask?.phase === "downloading" && updateTask.totalBytes === null);

  const subSkills = skill.sub_skills;
  const isCollection = Boolean(subSkills && subSkills.length > 0);

  const q = searchQuery.toLowerCase().trim();
  const hasSearch = Boolean(q);

  const displayedSubSkills = useMemo(() => {
    if (!subSkills || subSkills.length === 0) return [];
    if (!hasSearch) return subSkills;
    const matched = subSkills.filter(
      (sub) =>
        sub.name.toLowerCase().includes(q) ||
        Boolean(sub.description && sub.description.toLowerCase().includes(q)) ||
        sub.dir_path.toLowerCase().includes(q)
    );
    return matched.length > 0 ? matched : subSkills;
  }, [subSkills, hasSearch, q]);

  const shouldShowSubSkills = isCollection && (hasSearch || isExpanded);

  return (
    <div className="glass-card skill-list-row group flex flex-col gap-2 rounded-xl border border-slate-800/80 p-4 transition-colors duration-200 hover:border-emerald-500/40">
      <div className="flex min-w-0 items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <span className="shrink-0">
            <Badge variant={skill.source_type === "net" ? "info" : "neutral"}>
              {skill.source_type === "net" ? (
                <Globe className="w-3 h-3" />
              ) : (
                <HardDrive className="w-3 h-3" />
              )}
              <span>{t(`library.source.${skill.source_type}`)}</span>
            </Badge>
          </span>
          {isCollection && (
            <span className="shrink-0">
              <Badge variant="neutral" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-300">
                <Layers className="w-3 h-3 text-emerald-400" />
                <span>{t("library.collectionBadge", { count: subSkills!.length })}</span>
              </Badge>
            </span>
          )}
          <h3 className="min-w-0 truncate text-sm font-semibold text-slate-100">
            {skill.name}
          </h3>
          {isCollection && (
            <button
              type="button"
              onClick={() => setIsExpanded((prev) => !prev)}
              aria-expanded={shouldShowSubSkills}
              title={
                shouldShowSubSkills
                  ? t("library.collapseSubSkills")
                  : t("library.expandSubSkills", { count: subSkills!.length })
              }
              className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-emerald-400/90 hover:text-emerald-300 hover:bg-emerald-500/10 transition-colors cursor-pointer"
            >
              {shouldShowSubSkills ? (
                <ChevronDown className="w-3.5 h-3.5" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5" />
              )}
              <span className="hidden sm:inline">
                {shouldShowSubSkills
                  ? t("library.collapseSubSkills")
                  : t("library.expandSubSkills", { count: subSkills!.length })}
              </span>
            </button>
          )}
        </div>
        <SkillActions
          skill={skill}
          updateTask={updateTask}
          updateDisabled={updateDisabled}
          hideRepoActions={viewMode === "tree"}
          onUpdate={onUpdate}
          onDelete={onDelete}
          onViewReferences={onViewReferences}
          onActionError={onActionError}
        />
      </div>

      {viewMode === "tree" ? (
        skill.description ? (
          <p className="w-full truncate font-mono text-xs text-slate-400">
            {skill.description}
          </p>
        ) : null
      ) : (
        <p className="w-full truncate font-mono text-xs text-slate-400">
          {skill.source_type === "net" ? `${skill.owner}/${skill.repo}` : skill.dir_path}
          {skill.description ? ` • ${skill.description}` : ""}
        </p>
      )}

      {shouldShowSubSkills && displayedSubSkills.length > 0 && (
        <div className="mt-2 space-y-1.5 pt-2 border-t border-slate-800/60">
          <div className="flex items-center justify-between text-xs text-slate-400 px-1 font-medium">
            <span className="flex items-center gap-1.5">
              <FolderTree className="w-3.5 h-3.5 text-emerald-400" />
              <span>{t("library.subSkillsHeading")}</span>
              <span className="text-[11px] text-slate-500">
                ({displayedSubSkills.length})
              </span>
            </span>
          </div>

          <div className="relative ml-2 space-y-1.5 border-l-2 border-slate-800/80 pl-3.5 pt-1 pb-1">
            {displayedSubSkills.map((sub) => (
              <div
                key={sub.name}
                className="relative group/sub flex items-start justify-between gap-3 rounded-lg border border-slate-800/60 bg-slate-900/50 p-2.5 transition-colors hover:border-slate-700 hover:bg-slate-900/80"
              >
                {/* Tree horizontal connector */}
                <div
                  className="absolute -left-3.5 top-4 h-px w-2.5 bg-slate-800"
                  aria-hidden="true"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-semibold text-slate-200 group-hover/sub:text-emerald-300 transition-colors">
                      {sub.name}
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono">
                      {sub.dir_path}
                    </span>
                  </div>
                  {sub.description && (
                    <p className="mt-1 text-xs text-slate-400 line-clamp-2 leading-relaxed">
                      {sub.description}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={async (e) => {
                    e.stopPropagation();
                    try {
                      await api.openSkillSubDir(skill.id, sub.name);
                    } catch (error) {
                      onActionError(errorMessage(error));
                    }
                  }}
                  title={t("library.openLocalDir")}
                  aria-label={t("library.openLocalDir")}
                  className="flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-md border border-slate-700/60 bg-slate-800/80 text-slate-400 transition-colors hover:border-slate-600 hover:text-slate-100 opacity-0 group-hover/sub:opacity-100 focus:opacity-100"
                >
                  <FolderOpen className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {updateInProgress && updateTask && (
        <div className="space-y-1.5 pt-2" aria-live="polite">
          <div className="flex items-center justify-between gap-3 text-xs">
            <span className="truncate text-amber-300">
              {updateTask.status === "queued"
                ? t("library.updateQueued")
                : updateTask.phase
                  ? t(`library.updatePhase.${updateTask.phase}`)
                  : t("library.updating")}
            </span>
            <span className="min-w-16 shrink-0 text-right font-mono text-slate-500">
              {updateTask.phase === "downloading" && updateTask.downloadedBytes !== null
                ? t("library.downloadProgress", {
                    downloaded: formatBytes(updateTask.downloadedBytes),
                    total: updateTask.totalBytes === null ? "?" : formatBytes(updateTask.totalBytes),
                  })
                : updateTask.phase === "retrying"
                  ? ""
                  : `${updateTask.progress}%`}
            </span>
          </div>
          <div
            className="h-1.5 overflow-hidden rounded-full bg-slate-800"
            role="progressbar"
            aria-label={t("library.skillUpdateProgress", { name: skill.name })}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={indeterminateDownload ? undefined : updateTask.progress}
          >
            <div
              className={`h-full rounded-full bg-amber-500 transition-[width] duration-300 ${
                indeterminateDownload ? "w-full animate-shimmer" : ""
              }`}
              style={indeterminateDownload ? undefined : { width: `${updateTask.progress}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
});

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default SkillCard;
