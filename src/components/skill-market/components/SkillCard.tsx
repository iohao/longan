import { memo } from "react";
import { useTranslation } from "react-i18next";
import { Globe, HardDrive } from "lucide-react";
import type { ListedSkill, Skill, SkillUpdateTask } from "../../../types";
import Badge from "../../ui/Badge";
import SkillActions from "./SkillActions";

interface SkillCardProps {
  skill: ListedSkill;
  updateTask?: SkillUpdateTask;
  updateDisabled: boolean;
  onUpdate: (skill: Skill) => void;
  onDelete: (skill: Skill) => void;
  onViewReferences: (skill: Skill) => void;
  onActionError: (message: string) => void;
}

const SkillCard = memo(function SkillCard({
  skill,
  updateTask,
  updateDisabled,
  onUpdate,
  onDelete,
  onViewReferences,
  onActionError,
}: SkillCardProps) {
  const { t } = useTranslation();
  const updateInProgress = updateTask?.status === "queued" || updateTask?.status === "updating";
  const indeterminateDownload =
    updateTask?.phase === "retrying" ||
    (updateTask?.phase === "downloading" && updateTask.totalBytes === null);

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
          <h3 className="min-w-0 truncate text-sm font-semibold text-slate-100">
            {skill.name}
          </h3>
        </div>
        <SkillActions
          skill={skill}
          updateTask={updateTask}
          updateDisabled={updateDisabled}
          onUpdate={onUpdate}
          onDelete={onDelete}
          onViewReferences={onViewReferences}
          onActionError={onActionError}
        />
      </div>

      <p className="w-full truncate font-mono text-xs text-slate-400">
        {skill.source_type === "net" ? `${skill.owner}/${skill.repo}` : skill.dir_path}
        {skill.description ? ` • ${skill.description}` : ""}
      </p>

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
