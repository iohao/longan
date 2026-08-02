import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { api, errorMessage, listenForSkillInstallProgress } from "../api";
import { reportFrontendError } from "../logging";
import type {
  SkillInstallRequest,
  SkillInstallTask,
  SkillInstallTaskStatus,
} from "../types";

const MAX_CONCURRENT_INSTALLS = 2;
const ACTIVE_STATUSES = new Set<SkillInstallTaskStatus>(["installing", "cancelling"]);

interface SkillInstallContextValue {
  tasks: SkillInstallTask[];
  expanded: boolean;
  setExpanded: (expanded: boolean) => void;
  enqueue: (request: SkillInstallRequest) => void;
  cancel: (taskId: string) => void;
  retry: (taskId: string) => void;
  remove: (taskId: string) => void;
  clearFinished: () => void;
}

const SkillInstallContext = createContext<SkillInstallContextValue | null>(null);

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

export function SkillInstallProvider({ children }: { children: ReactNode }) {
  const [tasks, setTasks] = useState<SkillInstallTask[]>([]);
  const [expanded, setExpanded] = useState(false);
  const tasksRef = useRef(tasks);
  const runningOperationsRef = useRef(new Set<string>());

  const replaceTasks = useCallback((next: SkillInstallTask[]) => {
    tasksRef.current = next;
    setTasks(next);
  }, []);

  const updateTask = useCallback((
    taskId: string,
    update: (task: SkillInstallTask) => SkillInstallTask,
  ) => {
    replaceTasks(tasksRef.current.map((task) => task.id === taskId ? update(task) : task));
  }, [replaceTasks]);

  const retry = useCallback((taskId: string) => {
    const task = tasksRef.current.find((candidate) => candidate.id === taskId);
    if (!task || (task.status !== "failed" && task.status !== "cancelled")) return;
    const nextTask = queuedTask(task, task.id);
    replaceTasks([
      ...tasksRef.current.filter((candidate) => candidate.id !== taskId),
      nextTask,
    ]);
    setExpanded(true);
  }, [replaceTasks]);

  const enqueue = useCallback((request: SkillInstallRequest) => {
    const existing = tasksRef.current.find(
      (task) => task.installKey.toLowerCase() === request.installKey.toLowerCase(),
    );
    if (existing) {
      if (existing.status === "failed" || existing.status === "cancelled") {
        retry(existing.id);
      }
      setExpanded(true);
      return;
    }

    replaceTasks([...tasksRef.current, queuedTask(request)]);
    setExpanded(true);
  }, [replaceTasks, retry]);

  const runInstall = useCallback(async (task: SkillInstallTask) => {
    try {
      await api.installSkill(
        task.owner,
        task.repoName,
        task.skillId,
        task.operationId,
        task.sourceUrl,
        task.githubSource,
      );
      updateTask(task.id, (current) => current.operationId === task.operationId
        ? {
            ...current,
            status: "completed",
            phase: "completed",
            progressPercent: 100,
            downloadedBytes: null,
            totalBytes: null,
            error: null,
          }
        : current);
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
      runningOperationsRef.current.delete(task.operationId);
    }
  }, [updateTask]);

  useEffect(() => {
    const activeCount = tasks.filter((task) => ACTIVE_STATUSES.has(task.status)).length;
    const availableSlots = Math.max(0, MAX_CONCURRENT_INSTALLS - activeCount);
    if (availableSlots === 0) return;

    const ready = tasks
      .filter((task) => task.status === "queued")
      .slice(0, availableSlots);
    for (const task of ready) {
      if (runningOperationsRef.current.has(task.operationId)) continue;
      runningOperationsRef.current.add(task.operationId);
      updateTask(task.id, (current) => ({
        ...current,
        status: "installing",
        phase: "checking",
      }));
      void runInstall(task);
    }
  }, [runInstall, tasks, updateTask]);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;

    void listenForSkillInstallProgress((progress) => {
      if (disposed) return;
      const task = tasksRef.current.find(
        (candidate) => candidate.operationId === progress.operationId,
      );
      if (!task) return;
      updateTask(task.id, (current) => {
        if (current.operationId !== progress.operationId) return current;
        const status: SkillInstallTaskStatus = progress.phase === "completed"
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
    })
      .then((cleanup) => {
        if (disposed) cleanup();
        else unlisten = cleanup;
      })
      .catch((error) => {
        reportFrontendError(
          "Failed to listen for skill install progress",
          error,
          "SkillInstallProvider",
        );
      });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [updateTask]);

  const cancel = useCallback((taskId: string) => {
    const task = tasksRef.current.find((candidate) => candidate.id === taskId);
    if (!task || task.status !== "installing") return;
    if (task.phase === "registering" || task.phase === "syncing") return;

    updateTask(taskId, (current) => ({ ...current, status: "cancelling" }));
    void api.cancelSkillInstall(task.operationId)
      .then((accepted) => {
        if (!accepted) {
          updateTask(taskId, (current) => current.operationId === task.operationId
            ? { ...current, status: "installing" }
            : current);
        }
      })
      .catch((error) => {
        reportFrontendError(
          "Failed to cancel skill install",
          error,
          "SkillInstallProvider",
        );
        updateTask(taskId, (current) => current.operationId === task.operationId
          ? { ...current, status: "installing" }
          : current);
      });
  }, [updateTask]);

  const remove = useCallback((taskId: string) => {
    const task = tasksRef.current.find((candidate) => candidate.id === taskId);
    if (!task || ACTIVE_STATUSES.has(task.status)) return;
    replaceTasks(tasksRef.current.filter((candidate) => candidate.id !== taskId));
  }, [replaceTasks]);

  const clearFinished = useCallback(() => {
    const remaining = tasksRef.current.filter(
      (task) => task.status !== "completed"
        && task.status !== "failed"
        && task.status !== "cancelled",
    );
    replaceTasks(remaining);
    if (remaining.length === 0) setExpanded(false);
  }, [replaceTasks]);

  const value = useMemo<SkillInstallContextValue>(() => ({
    tasks,
    expanded,
    setExpanded,
    enqueue,
    cancel,
    retry,
    remove,
    clearFinished,
  }), [cancel, clearFinished, enqueue, expanded, remove, retry, tasks]);

  return (
    <SkillInstallContext.Provider value={value}>
      {children}
    </SkillInstallContext.Provider>
  );
}

export function useSkillInstallQueue() {
  const context = useContext(SkillInstallContext);
  if (!context) {
    throw new Error("useSkillInstallQueue must be used within a SkillInstallProvider");
  }
  return context;
}
