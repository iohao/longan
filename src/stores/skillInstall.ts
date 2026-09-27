import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { api, errorMessage, listenForSkillInstallProgress } from "@/api";
import { reportFrontendError } from "@/logging";
import type {
  SkillInstallProgressEvent,
  SkillInstallRequest,
  SkillInstallTask,
  SkillInstallTaskStatus,
} from "@/types";

const MAX_CONCURRENT_INSTALLS = 2;
const ACTIVE_STATUSES = new Set<SkillInstallTaskStatus>(["installing", "cancelling"]);

function queuedTask(
  request: SkillInstallRequest,
  id: string = crypto.randomUUID(),
): SkillInstallTask {
  return {
    ...request,
    id,
    operationId: crypto.randomUUID(),
    status: "queued",
    phase: null,
    progressPercent: null,
    downloadedBytes: null,
    totalBytes: null,
    error: null,
  };
}

export const useSkillInstallStore = defineStore("skillInstall", () => {
  const tasks = ref<SkillInstallTask[]>([]);
  const expanded = ref<boolean>(false);
  const runningOperationIds = ref<string[]>([]);
  const listenerInitialized = ref<boolean>(false);

  const activeCount = computed(
    () => tasks.value.filter((task) => ACTIVE_STATUSES.has(task.status)).length,
  );

  const queuedCount = computed(
    () => tasks.value.filter((task) => task.status === "queued").length,
  );

  const completedCount = computed(
    () => tasks.value.filter((task) => task.status === "completed").length,
  );

  const failedCount = computed(
    () =>
      tasks.value.filter(
        (task) => task.status === "failed" || task.status === "cancelled",
      ).length,
  );

  const hasActiveTasks = computed(() => activeCount.value > 0);

  function setExpanded(value: boolean): void {
    expanded.value = value;
  }

  function updateTask(
    taskId: string,
    updater: (task: SkillInstallTask) => SkillInstallTask,
  ): void {
    tasks.value = tasks.value.map((task) => (task.id === taskId ? updater(task) : task));
  }

  async function runInstall(task: SkillInstallTask): Promise<void> {
    try {
      await api.installSkill(
        task.owner,
        task.repoName,
        task.skillId,
        task.operationId,
        task.sourceUrl,
        task.githubSource,
        task.sourcePath,
      );
      updateTask(task.id, (current) =>
        current.operationId === task.operationId
          ? {
              ...current,
              status: "completed",
              phase: "completed",
              progressPercent: 100,
              downloadedBytes: null,
              totalBytes: null,
              error: null,
            }
          : current,
      );
    } catch (error) {
      updateTask(task.id, (current) => {
        if (current.operationId !== task.operationId) return current;
        const cancelled = current.status === "cancelling" || current.phase === "cancelled";
        return {
          ...current,
          status: cancelled ? "cancelled" : "failed",
          phase: cancelled ? "cancelled" : "failed",
          error: cancelled ? null : errorMessage(error),
        };
      });
    } finally {
      runningOperationIds.value = runningOperationIds.value.filter(
        (id) => id !== task.operationId,
      );
      pumpQueue();
    }
  }

  function pumpQueue(): void {
    const currentActive = tasks.value.filter((task) =>
      ACTIVE_STATUSES.has(task.status),
    ).length;
    const availableSlots = Math.max(0, MAX_CONCURRENT_INSTALLS - currentActive);
    if (availableSlots === 0) return;

    const readyTasks = tasks.value
      .filter((task) => task.status === "queued")
      .slice(0, availableSlots);

    for (const task of readyTasks) {
      if (runningOperationIds.value.includes(task.operationId)) continue;
      runningOperationIds.value.push(task.operationId);
      updateTask(task.id, (current) => ({
        ...current,
        status: "installing",
        phase: "checking",
      }));
      void runInstall(task);
    }
  }

  function retry(taskId: string): void {
    const task = tasks.value.find((candidate) => candidate.id === taskId);
    if (!task || (task.status !== "failed" && task.status !== "cancelled")) return;

    const nextTask = queuedTask(task, task.id);
    tasks.value = [...tasks.value.filter((candidate) => candidate.id !== taskId), nextTask];
    expanded.value = true;
    pumpQueue();
  }

  function enqueue(request: SkillInstallRequest): void {
    initEventListener();

    const existing = tasks.value.find(
      (task) => task.installKey.toLowerCase() === request.installKey.toLowerCase(),
    );
    if (existing) {
      if (existing.status === "failed" || existing.status === "cancelled") {
        retry(existing.id);
      }
      expanded.value = true;
      return;
    }

    tasks.value.push(queuedTask(request));
    expanded.value = true;
    pumpQueue();
  }

  function cancel(taskId: string): void {
    const task = tasks.value.find((candidate) => candidate.id === taskId);
    if (!task || task.status !== "installing") return;
    if (task.phase === "registering" || task.phase === "syncing") return;

    updateTask(taskId, (current) => ({ ...current, status: "cancelling" }));
    void api
      .cancelSkillInstall(task.operationId)
      .then((accepted) => {
        if (!accepted) {
          updateTask(taskId, (current) =>
            current.operationId === task.operationId
              ? { ...current, status: "installing" }
              : current,
          );
        }
      })
      .catch((error) => {
        reportFrontendError(
          "Failed to cancel skill install",
          error,
          "useSkillInstallStore",
        );
        updateTask(taskId, (current) =>
          current.operationId === task.operationId
            ? { ...current, status: "installing" }
            : current,
        );
      });
  }

  function remove(taskId: string): void {
    const task = tasks.value.find((candidate) => candidate.id === taskId);
    if (!task || ACTIVE_STATUSES.has(task.status)) return;
    tasks.value = tasks.value.filter((candidate) => candidate.id !== taskId);
  }

  function clearFinished(): void {
    const remaining = tasks.value.filter(
      (task) =>
        task.status !== "completed" &&
        task.status !== "failed" &&
        task.status !== "cancelled",
    );
    tasks.value = remaining;
    if (remaining.length === 0) {
      expanded.value = false;
    }
  }

  function handleProgressEvent(progress: SkillInstallProgressEvent): void {
    const task = tasks.value.find(
      (candidate) => candidate.operationId === progress.operationId,
    );
    if (!task) return;

    updateTask(task.id, (current) => {
      if (current.operationId !== progress.operationId) return current;
      const status: SkillInstallTaskStatus =
        progress.phase === "completed"
          ? "completed"
          : progress.phase === "failed"
            ? "failed"
            : progress.phase === "cancelled"
              ? "cancelled"
              : current.status === "cancelling"
                ? "cancelling"
                : "installing";
      return { ...current, ...progress, status };
    });
  }

  function initEventListener(): void {
    if (listenerInitialized.value) return;
    listenerInitialized.value = true;

    void listenForSkillInstallProgress(handleProgressEvent).catch((error) => {
      reportFrontendError(
        "Failed to listen for skill install progress",
        error,
        "useSkillInstallStore",
      );
    });
  }

  return {
    // State
    tasks,
    expanded,
    runningOperationIds,
    listenerInitialized,
    // Getters
    activeCount,
    queuedCount,
    completedCount,
    failedCount,
    hasActiveTasks,
    // Actions
    setExpanded,
    enqueue,
    cancel,
    retry,
    remove,
    clearFinished,
    initEventListener,
    pumpQueue,
  };
});
