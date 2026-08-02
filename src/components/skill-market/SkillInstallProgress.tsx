import { useTranslation } from "react-i18next";
import type { SkillInstallTask } from "../../types";

interface SkillInstallProgressProps {
  task: SkillInstallTask;
}

export default function SkillInstallProgress({ task }: SkillInstallProgressProps) {
  const { t } = useTranslation();
  if (task.status === "queued") {
    return (
      <div className="space-y-1.5 pt-2">
        <div className="text-xs text-amber-300">{t("install.queue.queued")}</div>
        <div className="h-1.5 overflow-hidden rounded-full bg-slate-800" />
      </div>
    );
  }

  if (task.status === "cancelling") {
    return (
      <div className="space-y-1.5 pt-2" aria-live="polite">
        <div className="text-xs text-slate-400">{t("install.queue.cancelling")}</div>
        <div className="h-1.5 overflow-hidden rounded-full bg-slate-800">
          <div className="h-full w-full animate-shimmer rounded-full bg-slate-500 motion-reduce:animate-none" />
        </div>
      </div>
    );
  }

  if (!task.phase) return null;

  const hasDownloadTotal =
    task.phase === "downloading" &&
    task.downloadedBytes !== null &&
    task.totalBytes !== null &&
    task.totalBytes > 0;
  const downloadPercent =
    task.phase === "downloading"
      ? task.progressPercent ??
        (hasDownloadTotal
          ? Math.min(100, Math.round((task.downloadedBytes! * 100) / task.totalBytes!))
          : null)
      : null;
  const completed = task.phase === "completed";
  const terminal = completed || task.phase === "failed" || task.phase === "cancelled";
  const indeterminate = downloadPercent === null && !terminal;

  return (
    <div className="space-y-1.5 pt-2" aria-live="polite">
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className={`truncate ${
          task.phase === "failed"
            ? "text-rose-300"
            : task.phase === "completed"
              ? "text-emerald-300"
              : task.phase === "cancelled"
                ? "text-slate-500"
                : "text-amber-300"
        }`}>
          {t(`install.progressPhase.${task.phase}`)}
        </span>
        {task.phase === "downloading" &&
          (downloadPercent !== null || (task.downloadedBytes ?? 0) > 0) && (
          <span className="shrink-0 text-right font-mono text-slate-500">
            {hasDownloadTotal
              ? t("install.downloadProgress", {
                  downloaded: formatBytes(task.downloadedBytes!),
                  total: formatBytes(task.totalBytes!),
                  percent: downloadPercent,
                })
              : downloadPercent !== null && (task.downloadedBytes ?? 0) > 0
                ? t("install.downloadProgressPercent", {
                    downloaded: formatBytes(task.downloadedBytes!),
                    percent: downloadPercent,
                  })
                : downloadPercent !== null
                  ? `${downloadPercent}%`
                  : t("install.downloadProgressUnknown", {
                      downloaded: formatBytes(task.downloadedBytes!),
                    })}
          </span>
        )}
      </div>
      <div
        className="h-1.5 overflow-hidden rounded-full bg-slate-800"
        role="progressbar"
        aria-label={t("install.skillInstallProgress", { name: task.name })}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={indeterminate || (!completed && downloadPercent === null)
          ? undefined
          : completed
            ? 100
            : downloadPercent!}
      >
        <div
          className={`h-full rounded-full bg-amber-500 transition-[width] duration-300 ${
            indeterminate ? "w-full animate-shimmer" : ""
          }`}
          style={indeterminate
            ? undefined
            : { width: `${completed ? 100 : downloadPercent ?? 0}%` }}
        />
      </div>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
