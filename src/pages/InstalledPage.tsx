import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { HardDrive, Loader2, MoreHorizontal, RefreshCw, Sparkles, Store } from "lucide-react";
import {
  api,
  errorMessage,
  listenForSkillsChanged,
  listenForSkillUpdateProgress,
} from "../api";
import type { ListedSkill, Skill, SkillUpdateTask } from "../types";
import InstalledTab from "../components/skill-market/InstalledTab";
import DeleteConfirmModal from "../components/skill-market/components/DeleteConfirmModal";
import type { InstalledFilterKey } from "../components/skill-market/InstalledTab";
import { useUpdateNotification } from "../context/UpdateNotificationContext";
import SkillReferenceModal from "../components/skill-market/components/SkillReferenceModal";
import { reportFrontendError } from "../logging";

interface InstalledPageProps {
  onSkillsChanged?: () => void;
  onGoExplore?: () => void;
}

const MAX_CONCURRENT_UPDATES = 2;

function queuedTask(skill: Skill): SkillUpdateTask {
  return {
    skillId: skill.id,
    name: skill.name,
    status: "queued",
    phase: null,
    progress: 0,
    downloadedBytes: null,
    totalBytes: null,
    error: null,
  };
}

export default function InstalledPage({ onSkillsChanged, onGoExplore }: InstalledPageProps) {
  const { t } = useTranslation();
  const { setUpdatableCount } = useUpdateNotification();

  const [skills, setSkills] = useState<ListedSkill[]>([]);
  const [installedSearchQuery, setInstalledSearchQuery] = useState("");
  const [installedFilter, setInstalledFilter] = useState<InstalledFilterKey>("all");
  const [notice, setNotice] = useState<string | null>(null);
  const [installedError, setInstalledError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Skill | null>(null);
  const [deleteRefs, setDeleteRefs] = useState<[string[], string[]] | null>(null);
  const [viewingReferences, setViewingReferences] = useState<Skill | null>(null);
  const [updateTasks, setUpdateTasks] = useState<Record<number, SkillUpdateTask>>({});
  const [batchSkillIds, setBatchSkillIds] = useState<number[]>([]);
  const [batchUpdating, setBatchUpdating] = useState(false);
  const [runningUpdateCount, setRunningUpdateCount] = useState(0);
  const [checkingUpdates, setCheckingUpdates] = useState(false);
  const [rescanningLocal, setRescanningLocal] = useState(false);
  const [actionsMenuOpen, setActionsMenuOpen] = useState(false);

  const lockedUpdateIds = useRef(new Set<number>());
  const runningUpdateIds = useRef(new Set<number>());
  const batchUpdatingRef = useRef(false);
  const checkingUpdatesRef = useRef(false);
  const rescanningLocalRef = useRef(false);
  const actionsMenuRef = useRef<HTMLDivElement>(null);
  const actionsMenuButtonRef = useRef<HTMLButtonElement>(null);
  const reloadGenerationRef = useRef(0);

  const reloadSkills = useCallback(async () => {
    const generation = ++reloadGenerationRef.current;
    try {
      const loadedSkills = await api.listSkills();
      if (generation !== reloadGenerationRef.current) return;
      setSkills(loadedSkills);
    } catch (error) {
      if (generation === reloadGenerationRef.current) {
        setInstalledError(errorMessage(error));
      }
    }
  }, []);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;

    void listenForSkillsChanged(() => {
      if (!disposed) void reloadSkills();
    })
      .then((cleanup) => {
        if (disposed) {
          cleanup();
          return;
        }
        unlisten = cleanup;
        void reloadSkills();
      })
      .catch((error) => {
        reportFrontendError(
          "Failed to listen for skill changes",
          error,
          "InstalledPage",
        );
        if (!disposed) void reloadSkills();
      });

    return () => {
      disposed = true;
      reloadGenerationRef.current += 1;
      unlisten?.();
    };
  }, [reloadSkills]);

  useEffect(() => {
    if (!actionsMenuOpen) return;

    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!actionsMenuRef.current?.contains(event.target as Node)) {
        setActionsMenuOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setActionsMenuOpen(false);
        actionsMenuButtonRef.current?.focus();
      }
    };

    window.addEventListener("pointerdown", closeOnOutsideClick);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("pointerdown", closeOnOutsideClick);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [actionsMenuOpen]);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;

    void listenForSkillUpdateProgress((progress) => {
      setUpdateTasks((current) => {
        const task = current[progress.skillId];
        if (!task) return current;
        if (task.status === "success") return current;
        if (task.status === "failed" && progress.phase !== "failed") return current;
        return {
          ...current,
          [progress.skillId]: {
            ...task,
            status:
              progress.phase === "completed"
                ? "success"
                : progress.phase === "failed"
                  ? "failed"
                  : "updating",
            phase: progress.phase,
            progress: progress.progress,
            downloadedBytes: progress.downloadedBytes,
            totalBytes: progress.totalBytes,
            error: progress.error,
          },
        };
      });
    }).then((cleanup) => {
      if (disposed) cleanup();
      else unlisten = cleanup;
    });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    const count = skills.filter((skill) => skill.status === "update_available").length;
    setUpdatableCount(count);
  }, [skills, setUpdatableCount]);

  const maintenanceBlocked = useCallback(() => (
    checkingUpdatesRef.current ||
    rescanningLocalRef.current ||
    batchUpdatingRef.current ||
    lockedUpdateIds.current.size > 0 ||
    runningUpdateIds.current.size > 0
  ), []);

  const checkForUpdates = useCallback(async () => {
    if (maintenanceBlocked()) return;

    checkingUpdatesRef.current = true;
    setCheckingUpdates(true);
    setInstalledError(null);
    setNotice(null);
    try {
      const count = await api.checkUpdates();
      await reloadSkills();
      setNotice(
        count > 0
          ? t("installed.updatesFound", { count })
          : t("installed.noUpdates")
      );
      onSkillsChanged?.();
    } catch (error) {
      setInstalledError(errorMessage(error));
    } finally {
      checkingUpdatesRef.current = false;
      setCheckingUpdates(false);
    }
  }, [maintenanceBlocked, onSkillsChanged, reloadSkills, t]);

  const rescanLocalSkills = useCallback(async () => {
    if (maintenanceBlocked()) return;

    rescanningLocalRef.current = true;
    setRescanningLocal(true);
    setActionsMenuOpen(false);
    actionsMenuButtonRef.current?.focus();
    setInstalledError(null);
    setNotice(null);
    try {
      await api.rescanLocal();
      await reloadSkills();
      setNotice(t("installed.localRescanned"));
      onSkillsChanged?.();
    } catch (error) {
      setInstalledError(errorMessage(error));
    } finally {
      rescanningLocalRef.current = false;
      setRescanningLocal(false);
    }
  }, [maintenanceBlocked, onSkillsChanged, reloadSkills, t]);

  const setTaskRunning = useCallback((skill: Skill) => {
    runningUpdateIds.current.add(skill.id);
    setRunningUpdateCount(runningUpdateIds.current.size);
    setUpdateTasks((current) => ({
      ...current,
      [skill.id]: { ...queuedTask(skill), status: "updating", phase: "checking" },
    }));
  }, []);

  const runUpdateRequest = useCallback(async (
    skill: Skill
  ): Promise<"updated" | "unchanged" | "failed"> => {
    setTaskRunning(skill);
    try {
      const updatedSkill = await api.updateSkill(skill.id);
      setSkills((current) =>
        current.map((existing) =>
          existing.id === updatedSkill.id
            ? { ...updatedSkill, reference_count: existing.reference_count }
            : existing
        )
      );
      setUpdateTasks((current) => ({
        ...current,
        [skill.id]: {
          ...current[skill.id],
          status: "success",
          phase: "completed",
          progress: 100,
          error: null,
        },
      }));
      return updatedSkill.latest_sha === skill.latest_sha && updatedSkill.tree_sha === skill.tree_sha
        ? "unchanged"
        : "updated";
    } catch (error) {
      const message = errorMessage(error);
      setInstalledError(message);
      setUpdateTasks((current) => ({
        ...current,
        [skill.id]: {
          ...current[skill.id],
          status: "failed",
          phase: "failed",
          error: message,
        },
      }));
      return "failed";
    } finally {
      runningUpdateIds.current.delete(skill.id);
      setRunningUpdateCount(runningUpdateIds.current.size);
    }
  }, [setTaskRunning]);

  const update = useCallback(async (skill: Skill) => {
    if (
      batchUpdatingRef.current ||
      lockedUpdateIds.current.has(skill.id) ||
      runningUpdateIds.current.size >= MAX_CONCURRENT_UPDATES
    ) {
      return;
    }

    lockedUpdateIds.current.add(skill.id);
    setInstalledError(null);
    setNotice(null);
    setUpdateTasks((current) => ({ ...current, [skill.id]: queuedTask(skill) }));

    const outcome = await runUpdateRequest(skill);
    lockedUpdateIds.current.delete(skill.id);
    if (outcome !== "failed") {
      setNotice(
        outcome === "unchanged"
          ? t("library.updateSkipped", { name: skill.name })
          : t("library.updateSuccess", { name: skill.name })
      );
      onSkillsChanged?.();
    }
  }, [onSkillsChanged, runUpdateRequest, t]);

  const updateAllUpdatableSkills = useCallback(async () => {
    if (batchUpdatingRef.current || lockedUpdateIds.current.size > 0) return;

    const updatableSkills = skills.filter(
      (skill) => skill.status === "update_available" && skill.source_type === "net"
    );
    if (updatableSkills.length === 0) return;

    batchUpdatingRef.current = true;
    setBatchUpdating(true);
    setBatchSkillIds(updatableSkills.map((skill) => skill.id));
    setInstalledError(null);
    setNotice(null);
    for (const skill of updatableSkills) lockedUpdateIds.current.add(skill.id);
    setUpdateTasks((current) => {
      const next = { ...current };
      for (const skill of updatableSkills) next[skill.id] = queuedTask(skill);
      return next;
    });

    try {
      const updatedSkills = await api.updateSkills(updatableSkills.map((skill) => skill.id));
      const updatedById = new Map(updatedSkills.map((skill) => [skill.id, skill]));
      setSkills((current) =>
        current.map((skill) => {
          const updated = updatedById.get(skill.id);
          return updated ? { ...updated, reference_count: skill.reference_count } : skill;
        })
      );
      setUpdateTasks((current) => {
        const next = { ...current };
        for (const skill of updatableSkills) {
          const task = current[skill.id] ?? queuedTask(skill);
          next[skill.id] = updatedById.has(skill.id)
            ? {
                ...task,
                status: "success",
                phase: "completed",
                progress: 100,
                error: null,
              }
            : task.status === "failed"
              ? task
              : {
                  ...task,
                  status: "failed",
                  phase: "failed",
                  error: task.error ?? t("library.updatePhase.failed"),
                };
        }
        return next;
      });
    } catch (error) {
      const message = errorMessage(error);
      setInstalledError(message);
      setUpdateTasks((current) => {
        const next = { ...current };
        for (const skill of updatableSkills) {
          const task = current[skill.id] ?? queuedTask(skill);
          next[skill.id] = task.status === "success" || task.status === "failed"
            ? task
            : {
                ...task,
                status: "failed",
                phase: "failed",
                error: message,
              };
        }
        return next;
      });
    }

    for (const skill of updatableSkills) lockedUpdateIds.current.delete(skill.id);
    batchUpdatingRef.current = false;
    setBatchUpdating(false);
    await reloadSkills();
    onSkillsChanged?.();
  }, [onSkillsChanged, reloadSkills, skills, t]);

  const askDelete = useCallback(async (skill: Skill) => {
    setDeleting(skill);
    setDeleteRefs(null);
    try {
      setDeleteRefs(await api.skillReferences(skill.id));
    } catch (error) {
      setInstalledError(errorMessage(error));
    }
  }, []);

  async function confirmDelete() {
    if (!deleting) return;
    setInstalledError(null);
    try {
      await api.deleteSkill(deleting.id);
      setDeleting(null);
      await reloadSkills();
      onSkillsChanged?.();
    } catch (error) {
      setInstalledError(errorMessage(error));
    }
  }

  const updatableCount = useMemo(
    () => skills.filter(
      (skill) => skill.status === "update_available" && skill.source_type === "net"
    ).length,
    [skills]
  );
  const updatesAtCapacity = runningUpdateCount >= MAX_CONCURRENT_UPDATES;
  const batchBlocked = batchUpdating || lockedUpdateIds.current.size > 0;
  const maintenanceActionBlocked =
    checkingUpdates || rescanningLocal || batchBlocked || runningUpdateCount > 0;
  const checkUpdatesLabel = checkingUpdates
    ? t("installed.checkingUpdates")
    : t("installed.checkUpdates");
  const moreActionsLabel = rescanningLocal
    ? t("installed.rescanningLocal")
    : t("installed.moreActions");

  return (
    <div className="max-w-7xl space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-emerald-400 text-xs font-semibold uppercase tracking-wider mb-1">
            <Store className="w-3.5 h-3.5" />
            <span>{t("installed.header")}</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-100 tracking-tight">
            {t("nav.installed")}
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => void checkForUpdates()}
            disabled={maintenanceActionBlocked}
            aria-label={checkUpdatesLabel}
            aria-busy={checkingUpdates}
            title={checkUpdatesLabel}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-700 bg-slate-900/70 text-slate-300 transition-colors hover:border-emerald-500/50 hover:text-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${checkingUpdates ? "animate-spin" : ""}`} />
          </button>

          <div ref={actionsMenuRef} className="relative">
            <button
              ref={actionsMenuButtonRef}
              type="button"
              onClick={() => setActionsMenuOpen((open) => !open)}
              disabled={maintenanceActionBlocked}
              aria-label={moreActionsLabel}
              aria-haspopup="menu"
              aria-expanded={actionsMenuOpen}
              aria-busy={rescanningLocal}
              title={moreActionsLabel}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-700 bg-slate-900/70 text-slate-300 transition-colors hover:border-slate-600 hover:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {rescanningLocal ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <MoreHorizontal className="h-4 w-4" />
              )}
            </button>

            {actionsMenuOpen ? (
              <div
                role="menu"
                className="absolute right-0 top-full z-30 mt-2 w-56 overflow-hidden rounded-lg border border-slate-700 bg-slate-900 p-1 shadow-xl shadow-slate-950/50"
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => void rescanLocalSkills()}
                  className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm text-slate-300 transition-colors hover:bg-slate-800 hover:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-500/60"
                >
                  <HardDrive className="h-4 w-4 shrink-0 text-slate-400" />
                  <span>{t("installed.rescanLocal")}</span>
                </button>
              </div>
            ) : null}
          </div>

          {updatableCount > 0 ? (
            <button
              type="button"
              onClick={() => void updateAllUpdatableSkills()}
              disabled={batchBlocked || checkingUpdates || rescanningLocal}
              title={t("installed.updatesFound", { count: updatableCount })}
              className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white text-sm font-medium rounded-lg transition-all duration-200 cursor-pointer shadow-lg shadow-amber-600/20 flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:bg-amber-600"
            >
              {batchUpdating ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4" />
              )}
              {batchUpdating ? t("library.updating") : t("installed.batchUpdateNow")}
              <span className="shrink-0 flex items-center justify-center min-w-[20px] h-[20px] px-1.5 bg-white/20 text-white text-xs font-bold rounded-full">
                {updatableCount > 99 ? "99+" : updatableCount}
              </span>
            </button>
          ) : null}
        </div>
      </div>

      <InstalledTab
        skills={skills}
        searchQuery={installedSearchQuery}
        setSearchQuery={setInstalledSearchQuery}
        filter={installedFilter}
        setFilter={setInstalledFilter}
        notice={notice}
        error={installedError}
        onClearError={() => setInstalledError(null)}
        onActionError={setInstalledError}
        updateTasks={updateTasks}
        updatesAtCapacity={updatesAtCapacity}
        onUpdate={(skill) => void update(skill)}
        onDelete={askDelete}
        onViewReferences={setViewingReferences}
        onGoExplore={() => onGoExplore?.()}
        batchUpdating={batchUpdating}
        batchSkillIds={batchSkillIds}
        onDismissBatch={() => setBatchSkillIds([])}
      />

      <DeleteConfirmModal
        skill={deleting}
        deleteRefs={deleteRefs}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
      />

      <SkillReferenceModal
        skill={viewingReferences}
        isOpen={!!viewingReferences}
        onClose={() => setViewingReferences(null)}
      />
    </div>
  );
}
