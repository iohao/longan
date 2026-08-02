import {
  AlertCircle,
  Ban,
  CheckCircle2,
  Clock3,
  Download,
  Loader2,
  RotateCcw,
  Square,
  Trash2,
  X,
  XCircle,
} from "lucide-react";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useSkillInstallQueue } from "../context/SkillInstallContext";
import type { SkillInstallTask } from "../types";
import SkillInstallProgress from "./skill-market/SkillInstallProgress";

function TaskStatusIcon({ task }: { task: SkillInstallTask }) {
  if (task.status === "queued") return <Clock3 className="h-4 w-4 text-amber-400" />;
  if (task.status === "completed") return <CheckCircle2 className="h-4 w-4 text-emerald-400" />;
  if (task.status === "failed") return <XCircle className="h-4 w-4 text-rose-400" />;
  if (task.status === "cancelled") return <Ban className="h-4 w-4 text-slate-500" />;
  return <Loader2 className="h-4 w-4 animate-spin text-cyan-400 motion-reduce:animate-none" />;
}

export default function SkillInstallQueue() {
  const { t } = useTranslation();
  const {
    tasks,
    expanded,
    setExpanded,
    cancel,
    retry,
    remove,
    clearFinished,
  } = useSkillInstallQueue();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!expanded) return;

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setExpanded(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setExpanded(false);
      requestAnimationFrame(() => triggerRef.current?.focus());
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [expanded, setExpanded]);

  if (tasks.length === 0) return null;

  const activeCount = tasks.filter(
    (task) => task.status === "installing" || task.status === "cancelling",
  ).length;
  const queuedCount = tasks.filter((task) => task.status === "queued").length;
  const clearable = tasks.some(
    (task) => task.status === "completed" || task.status === "failed" || task.status === "cancelled",
  );
  const busyCount = activeCount + queuedCount;
  const failedCount = tasks.filter((task) => task.status === "failed").length;
  const finishedCount = tasks.filter(
    (task) => task.status === "completed" || task.status === "failed" || task.status === "cancelled",
  ).length;
  const summary = busyCount > 0
    ? t("install.queue.summary", { active: activeCount, queued: queuedCount })
    : failedCount > 0
      ? t("install.queue.summaryFailed", { failed: failedCount, finished: finishedCount })
      : t("install.queue.summaryFinished", { finished: finishedCount });
  const triggerLabel = expanded
    ? t("install.queue.title")
    : t("install.queue.open");

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setExpanded(!expanded)}
        className={`relative flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-150 group ${
          expanded
            ? "border border-emerald-500/30 bg-emerald-600/15 text-emerald-400 shadow-sm"
            : "text-slate-400 hover:bg-slate-900/80 hover:text-slate-200"
        }`}
        aria-label={triggerLabel}
        aria-controls="skill-install-queue-panel"
        aria-expanded={expanded}
        title={summary}
      >
        <span className="flex min-w-0 items-center gap-3">
          <span className={`relative shrink-0 transition-colors ${expanded ? "text-emerald-400" : "text-slate-400 group-hover:text-slate-300"}`}>
            <Download className="h-4 w-4" />
            {failedCount > 0 ? <span className="absolute -right-1 -top-1 h-1.5 w-1.5 rounded-full bg-rose-400" /> : null}
          </span>
          <span className="truncate">{t("install.queue.title")}</span>
        </span>
        <span className="flex shrink-0 items-center gap-1.5" aria-hidden="true">
          {busyCount > 0 ? (
            <span className="flex items-center gap-1 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-300">
              <Loader2 className="h-3 w-3 animate-spin motion-reduce:animate-none" />
              {busyCount > 99 ? "99+" : busyCount}
            </span>
          ) : null}
          {failedCount > 0 ? (
            <span className="flex items-center gap-1 rounded-full bg-rose-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-rose-300">
              <AlertCircle className="h-3 w-3" />
              {failedCount > 99 ? "99+" : failedCount}
            </span>
          ) : null}
          {busyCount === 0 && failedCount === 0 ? (
            <span className="flex items-center gap-1 rounded-full bg-slate-800 px-1.5 py-0.5 text-[10px] font-semibold text-slate-400">
              <CheckCircle2 className="h-3 w-3 text-emerald-400" />
              {finishedCount > 99 ? "99+" : finishedCount}
            </span>
          ) : null}
        </span>
      </button>

      {expanded ? (
        <section
          ref={panelRef}
          id="skill-install-queue-panel"
          className="absolute bottom-3 left-[calc(100%+0.5rem)] z-50 flex max-h-[calc(100vh-1.5rem)] w-[380px] max-w-[calc(100vw-17rem)] min-w-[320px] flex-col overflow-hidden rounded-lg border border-slate-700 bg-slate-900 shadow-2xl shadow-black/55"
          aria-label={t("install.queue.title")}
        >
          <header className="flex min-h-14 items-center gap-3 border-b border-slate-800 px-4 py-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-emerald-500/10 text-emerald-400">
              <Download className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-semibold text-slate-100">{t("install.queue.title")}</h2>
              <p className="truncate text-xs text-slate-500">{summary}</p>
            </div>
            {clearable ? (
              <button
                type="button"
                onClick={clearFinished}
                className="flex h-8 w-8 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60"
                aria-label={t("install.queue.clearFinished")}
                title={t("install.queue.clearFinished")}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => setExpanded(false)}
              className="flex h-8 w-8 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60"
              aria-label={t("install.queue.collapse")}
              title={t("install.queue.collapse")}
            >
              <X className="h-4 w-4" />
            </button>
          </header>

          <div className="min-h-0 overflow-y-auto overscroll-contain" aria-live="polite">
            {tasks.map((task) => {
              const canCancel = task.status === "installing"
                && task.phase !== "registering"
                && task.phase !== "syncing";
              const canRemove = task.status === "queued"
                || task.status === "failed"
                || task.status === "cancelled"
                || task.status === "completed";
              return (
                <div key={task.id} className="border-b border-slate-800/80 px-4 py-3 last:border-b-0">
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-slate-800/80">
                      <TaskStatusIcon task={task} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="truncate text-sm font-medium text-slate-100">{task.name}</h3>
                          <p className="truncate font-mono text-[11px] text-slate-500">{task.sourceId}</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          {task.status === "failed" || task.status === "cancelled" ? (
                            <button
                              type="button"
                              onClick={() => retry(task.id)}
                              className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-800 hover:text-emerald-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60"
                              aria-label={t("install.queue.retry", { name: task.name })}
                              title={t("install.queue.retry", { name: task.name })}
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                            </button>
                          ) : null}
                          {canCancel ? (
                            <button
                              type="button"
                              onClick={() => cancel(task.id)}
                              className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-800 hover:text-rose-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/60"
                              aria-label={t("install.queue.cancel", { name: task.name })}
                              title={t("install.queue.cancel", { name: task.name })}
                            >
                              <Square className="h-3.5 w-3.5 fill-current" />
                            </button>
                          ) : null}
                          {canRemove ? (
                            <button
                              type="button"
                              onClick={() => remove(task.id)}
                              className="flex h-7 w-7 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-800 hover:text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500/60"
                              aria-label={t("install.queue.remove", { name: task.name })}
                              title={t("install.queue.remove", { name: task.name })}
                            >
                              <X className="h-4 w-4" />
                            </button>
                          ) : null}
                        </div>
                      </div>
                      <SkillInstallProgress task={task} />
                      {task.error ? (
                        <p className="mt-2 break-words text-xs leading-relaxed text-rose-300">
                          {task.error}
                        </p>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}
    </>
  );
}
