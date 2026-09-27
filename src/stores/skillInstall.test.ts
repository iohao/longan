import { beforeEach, describe, expect, it, vi } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { flushPromises } from "@vue/test-utils";
import type { Skill, SkillInstallProgressEvent, SkillInstallRequest } from "@/types";

const mocks = vi.hoisted(() => ({
  installSkill: vi.fn(),
  cancelSkillInstall: vi.fn(),
  cancelSkillInstalls: vi.fn(),
  progressListener: null as ((progress: SkillInstallProgressEvent) => void) | null,
}));

vi.mock("@/api", () => ({
  api: {
    installSkill: mocks.installSkill,
    cancelSkillInstall: mocks.cancelSkillInstall,
    cancelSkillInstalls: mocks.cancelSkillInstalls,
  },
  errorMessage: (error: unknown) => (error instanceof Error ? error.message : String(error)),
  listenForSkillInstallProgress: vi.fn(
    async (listener: (progress: SkillInstallProgressEvent) => void) => {
      mocks.progressListener = listener;
      return vi.fn();
    },
  ),
}));

import { useSkillInstallStore } from "./skillInstall";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function request(name: string): SkillInstallRequest {
  return {
    installKey: `owner/repo/${name}`,
    sourceId: `owner/repo/${name}`,
    name,
    owner: "owner",
    repoName: "repo",
    skillId: name,
    origin: "explore",
    sourceUrl: `owner/repo/${name}`,
    githubSource: "owner/repo",
  };
}

describe("useSkillInstallStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    mocks.cancelSkillInstall.mockResolvedValue(true);
    mocks.progressListener = null;
    let uuid = 0;
    vi.stubGlobal("crypto", {
      randomUUID: vi.fn(() => `00000000-0000-4000-8000-${String(++uuid).padStart(12, "0")}`),
    });
  });

  it("runs two installs concurrently and starts queued work in FIFO order", async () => {
    const store = useSkillInstallStore();
    const one = deferred<Skill>();
    const two = deferred<Skill>();
    const three = deferred<Skill>();
    const requests = new Map([
      ["one", one.promise],
      ["two", two.promise],
      ["three", three.promise],
    ]);

    mocks.installSkill.mockImplementation((_: string, __: string, skillId: string) =>
      requests.get(skillId),
    );

    store.enqueue(request("one"));
    store.enqueue(request("two"));
    store.enqueue(request("three"));

    expect(mocks.installSkill).toHaveBeenCalledTimes(2);
    expect(mocks.installSkill.mock.calls.map((call) => call[2])).toEqual(["one", "two"]);
    expect(store.activeCount).toBe(2);
    expect(store.queuedCount).toBe(1);
    expect(store.hasActiveTasks).toBe(true);

    one.resolve({ id: 1, name: "one" } as Skill);
    await flushPromises();

    expect(mocks.installSkill).toHaveBeenCalledTimes(3);
    expect(mocks.installSkill.mock.calls[2][2]).toBe("three");

    two.resolve({ id: 2, name: "two" } as Skill);
    three.resolve({ id: 3, name: "three" } as Skill);
    await flushPromises();

    expect(store.completedCount).toBe(3);
    expect(store.activeCount).toBe(0);
    expect(store.queuedCount).toBe(0);
  });

  it("cancels an active task, releases its slot, and retries with a new operation", async () => {
    const store = useSkillInstallStore();
    const firstAttempt = deferred<Skill>();
    const secondAttempt = deferred<Skill>();
    const three = deferred<Skill>();

    mocks.installSkill
      .mockReturnValueOnce(firstAttempt.promise)
      .mockResolvedValueOnce({ id: 2, name: "two" } as Skill)
      .mockReturnValueOnce(three.promise)
      .mockReturnValueOnce(secondAttempt.promise);

    store.enqueue(request("one"));
    store.enqueue(request("two"));
    store.enqueue(request("three"));

    await flushPromises();
    expect(mocks.installSkill).toHaveBeenCalledTimes(3);

    const firstTaskId = store.tasks[0].id;
    const firstOperationId = store.tasks[0].operationId;

    store.cancel(firstTaskId);
    expect(mocks.cancelSkillInstall).toHaveBeenCalledWith(firstOperationId);

    firstAttempt.reject({ code: "cancelled", message: "cancelled" });
    await flushPromises();

    expect(store.tasks.find((t) => t.id === firstTaskId)?.status).toBe("cancelled");

    store.retry(firstTaskId);
    expect(mocks.installSkill).toHaveBeenCalledTimes(4);
    const retryCall = mocks.installSkill.mock.calls[3];
    expect(retryCall[2]).toBe("one");
    expect(retryCall[3]).not.toBe(firstOperationId);

    three.resolve({ id: 3, name: "three" } as Skill);
    secondAttempt.resolve({ id: 1, name: "one" } as Skill);
    await flushPromises();

    expect(store.completedCount).toBe(3);
  });

  it("updates task progress when receiving progress events", async () => {
    const store = useSkillInstallStore();
    const installDef = deferred<Skill>();
    mocks.installSkill.mockReturnValue(installDef.promise);

    store.enqueue(request("one"));
    const task = store.tasks[0];

    mocks.progressListener?.({
      operationId: task.operationId,
      phase: "downloading",
      progressPercent: 45,
      downloadedBytes: 1024,
      totalBytes: 2048,
      error: null,
    });

    const updatedTask = store.tasks[0];
    expect(updatedTask.phase).toBe("downloading");
    expect(updatedTask.progressPercent).toBe(45);
    expect(updatedTask.downloadedBytes).toBe(1024);
    expect(updatedTask.totalBytes).toBe(2048);

    installDef.resolve({ id: 1, name: "one" } as Skill);
    await flushPromises();

    expect(store.tasks[0].status).toBe("completed");
    expect(store.tasks[0].progressPercent).toBe(100);
  });

  it("clears finished tasks and collapses queue when empty", () => {
    const store = useSkillInstallStore();
    store.tasks = [
      { ...request("one"), id: "1", operationId: "op-1", status: "completed", phase: "completed", progressPercent: 100, downloadedBytes: null, totalBytes: null, error: null },
      { ...request("two"), id: "2", operationId: "op-2", status: "failed", phase: "failed", progressPercent: null, downloadedBytes: null, totalBytes: null, error: "err" },
    ];
    store.expanded = true;

    store.clearFinished();
    expect(store.tasks).toHaveLength(0);
    expect(store.expanded).toBe(false);
  });
});
