import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { flushPromises } from "@vue/test-utils";
import type { PendingAppUpdate } from "@/api/updater";

const updaterMocks = vi.hoisted(() => ({
  checkForPendingAppUpdate: vi.fn(),
  fetchCurrentAppVersion: vi.fn(),
  installPendingAppUpdate: vi.fn(),
}));

const loggingMocks = vi.hoisted(() => ({
  reportFrontendError: vi.fn(),
  reportFrontendWarning: vi.fn(),
}));

vi.mock("@/api/updater", () => updaterMocks);
vi.mock("@/logging", () => loggingMocks);

import { useAppUpdateStore } from "./appUpdate";

const mockUpdate = {
  version: "1.3.0",
  currentVersion: "1.2.0",
  date: "2026-09-20",
  body: "New features and fixes",
} as unknown as PendingAppUpdate;

describe("useAppUpdateStore", () => {
  let idleCallbacks: Map<number, IdleRequestCallback>;
  let originalRequestIdleCallback: typeof window.requestIdleCallback;
  let originalCancelIdleCallback: typeof window.cancelIdleCallback;

  function runIdleCallbacks() {
    const callbacks = [...idleCallbacks.values()];
    idleCallbacks.clear();
    callbacks.forEach((cb) =>
      cb({
        didTimeout: false,
        timeRemaining: () => 50,
      }),
    );
  }

  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();

    idleCallbacks = new Map();
    let nextCallbackId = 1;
    originalRequestIdleCallback = window.requestIdleCallback;
    originalCancelIdleCallback = window.cancelIdleCallback;

    Object.defineProperty(window, "requestIdleCallback", {
      configurable: true,
      writable: true,
      value: vi.fn((callback: IdleRequestCallback) => {
        const id = nextCallbackId++;
        idleCallbacks.set(id, callback);
        return id;
      }),
    });

    Object.defineProperty(window, "cancelIdleCallback", {
      configurable: true,
      writable: true,
      value: vi.fn((id: number) => {
        idleCallbacks.delete(id);
      }),
    });

    updaterMocks.fetchCurrentAppVersion.mockResolvedValue("1.2.0");
    updaterMocks.checkForPendingAppUpdate.mockResolvedValue(null);
  });

  afterEach(() => {
    vi.useRealTimers();
    Object.defineProperty(window, "requestIdleCallback", {
      configurable: true,
      writable: true,
      value: originalRequestIdleCallback,
    });
    Object.defineProperty(window, "cancelIdleCallback", {
      configurable: true,
      writable: true,
      value: originalCancelIdleCallback,
    });
  });

  it("defers the automatic update check until the browser is idle", async () => {
    const store = useAppUpdateStore();
    store.init();

    expect(updaterMocks.checkForPendingAppUpdate).not.toHaveBeenCalled();

    runIdleCallbacks();
    await flushPromises();

    expect(updaterMocks.checkForPendingAppUpdate).toHaveBeenCalledTimes(1);
    expect(store.updateStatus).toBe("upToDate");
    expect(store.currentVersion).toBe("1.2.0");
  });

  it("sets available status when an update is found", async () => {
    updaterMocks.checkForPendingAppUpdate.mockResolvedValue(mockUpdate);
    const store = useAppUpdateStore();

    const result = await store.checkForUpdate();

    expect(result).toEqual(mockUpdate);
    expect(store.updateStatus).toBe("available");
    expect(store.availableUpdate).toEqual(mockUpdate);
  });

  it("reports a warning and sets error status when update check fails", async () => {
    const failure = new Error("network disconnected");
    updaterMocks.checkForPendingAppUpdate.mockRejectedValue(failure);
    const store = useAppUpdateStore();

    const result = await store.checkForUpdate();

    expect(result).toBeNull();
    expect(store.updateStatus).toBe("error");
    expect(store.updateErrorMessage).toBe("network disconnected");
    expect(loggingMocks.reportFrontendWarning).toHaveBeenCalledWith(
      "Application update check failed",
      failure,
      "useAppUpdateStore",
    );
  });

  it("installs an available update with progress tracking", async () => {
    updaterMocks.checkForPendingAppUpdate.mockResolvedValue(mockUpdate);
    updaterMocks.installPendingAppUpdate.mockImplementation(async (_update, onEvent) => {
      onEvent({ kind: "started", contentLength: 5000 });
      onEvent({ kind: "progress", chunkLength: 2000 });
      onEvent({ kind: "progress", chunkLength: 3000 });
    });

    const store = useAppUpdateStore();
    await store.checkForUpdate();

    expect(store.availableUpdate).not.toBeNull();
    const installPromise = store.installUpdate();

    await installPromise;

    expect(updaterMocks.installPendingAppUpdate).toHaveBeenCalledTimes(1);
    expect(store.updateContentLength).toBe(5000);
    expect(store.updateDownloadedBytes).toBe(5000);
    expect(store.isInstallingUpdate).toBe(false);
  });

  it("handles installation failure and reports error", async () => {
    updaterMocks.checkForPendingAppUpdate.mockResolvedValue(mockUpdate);
    const error = new Error("install write error");
    updaterMocks.installPendingAppUpdate.mockRejectedValue(error);

    const store = useAppUpdateStore();
    await store.checkForUpdate();

    await store.installUpdate();

    expect(store.updateStatus).toBe("error");
    expect(store.updateErrorMessage).toBe("install write error");
    expect(loggingMocks.reportFrontendError).toHaveBeenCalledWith(
      "Application update installation failed",
      error,
      "useAppUpdateStore",
    );
  });

  it("uses the setTimeout fallback when requestIdleCallback is unavailable", async () => {
    Object.defineProperty(window, "requestIdleCallback", {
      configurable: true,
      writable: true,
      value: undefined,
    });
    vi.useFakeTimers();

    const store = useAppUpdateStore();
    store.init();

    expect(updaterMocks.checkForPendingAppUpdate).not.toHaveBeenCalled();

    await vi.runAllTimersAsync();

    expect(updaterMocks.checkForPendingAppUpdate).toHaveBeenCalledTimes(1);
  });
});
