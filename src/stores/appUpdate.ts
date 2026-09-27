import { defineStore } from "pinia";
import { ref, shallowRef } from "vue";
import {
  checkForPendingAppUpdate,
  fetchCurrentAppVersion,
  installPendingAppUpdate,
  type PendingAppUpdate,
} from "@/api/updater";
import { reportFrontendError, reportFrontendWarning } from "@/logging";

export type UpdateStatus =
  | "idle"
  | "checking"
  | "available"
  | "upToDate"
  | "installing"
  | "error";

const AUTOMATIC_CHECK_IDLE_TIMEOUT_MS = 2_000;

function scheduleIdleWork(callback: () => void): () => void {
  if (typeof window !== "undefined" && typeof window.requestIdleCallback === "function") {
    const callbackId = window.requestIdleCallback(callback, {
      timeout: AUTOMATIC_CHECK_IDLE_TIMEOUT_MS,
    });
    return () => window.cancelIdleCallback?.(callbackId);
  }

  const timeoutId = window.setTimeout(callback, AUTOMATIC_CHECK_IDLE_TIMEOUT_MS);
  return () => window.clearTimeout(timeoutId);
}

export const useAppUpdateStore = defineStore("appUpdate", () => {
  const currentVersion = ref<string | null>(null);
  const updateStatus = ref<UpdateStatus>("idle");
  const availableUpdate = shallowRef<PendingAppUpdate | null>(null);
  const updateErrorMessage = ref<string | null>(null);
  const isInstallingUpdate = ref<boolean>(false);
  const updateDownloadedBytes = ref<number>(0);
  const updateContentLength = ref<number | null>(null);
  const initialized = ref<boolean>(false);

  async function checkForUpdate(): Promise<PendingAppUpdate | null> {
    if (availableUpdate.value && (availableUpdate.value as { isMock?: boolean }).isMock) {
      return availableUpdate.value;
    }

    if (updateStatus.value === "checking" || isInstallingUpdate.value) {
      return availableUpdate.value;
    }

    updateStatus.value = "checking";
    updateErrorMessage.value = null;

    try {
      const update = await checkForPendingAppUpdate();
      availableUpdate.value = update;
      updateDownloadedBytes.value = 0;
      updateContentLength.value = null;
      updateStatus.value = update ? "available" : "upToDate";
      return update;
    } catch (error) {
      reportFrontendWarning("Application update check failed", error, "useAppUpdateStore");
      const message = error instanceof Error ? error.message : String(error);
      updateStatus.value = "error";
      updateErrorMessage.value = message;
      return null;
    }
  }

  async function installUpdate(): Promise<void> {
    const updateToInstall = availableUpdate.value;
    if (!updateToInstall || isInstallingUpdate.value) return;

    if ((updateToInstall as { isMock?: boolean }).isMock) {
      isInstallingUpdate.value = true;
      updateStatus.value = "installing";
      updateErrorMessage.value = null;
      const totalBytes = 35 * 1024 * 1024;
      updateContentLength.value = totalBytes;
      updateDownloadedBytes.value = 0;

      await new Promise<void>((resolve) => {
        const interval = setInterval(() => {
          if (updateDownloadedBytes.value < totalBytes) {
            updateDownloadedBytes.value = Math.min(
              totalBytes,
              updateDownloadedBytes.value + 3.5 * 1024 * 1024,
            );
          } else {
            clearInterval(interval);
            isInstallingUpdate.value = false;
            updateStatus.value = "upToDate";
            resolve();
          }
        }, 300);
      });
      return;
    }

    isInstallingUpdate.value = true;
    updateStatus.value = "installing";
    updateErrorMessage.value = null;
    updateDownloadedBytes.value = 0;
    updateContentLength.value = null;

    try {
      await installPendingAppUpdate(updateToInstall, (event) => {
        if (event.kind === "started") {
          updateContentLength.value = event.contentLength;
        } else if (event.kind === "progress") {
          updateDownloadedBytes.value += event.chunkLength;
        }
      });
    } catch (error) {
      reportFrontendError(
        "Application update installation failed",
        error,
        "useAppUpdateStore",
      );
      const message = error instanceof Error ? error.message : String(error);
      isInstallingUpdate.value = false;
      updateStatus.value = "error";
      updateErrorMessage.value = message;
    } finally {
      isInstallingUpdate.value = false;
    }
  }

  function triggerMockUpdate(
    mode: "available" | "downloading" | "clear" = "available",
  ): void {
    if (mode === "clear") {
      availableUpdate.value = null;
      isInstallingUpdate.value = false;
      updateDownloadedBytes.value = 0;
      updateContentLength.value = null;
      updateStatus.value = "idle";
      return;
    }

    const mockObj = {
      version: "2.1.0",
      currentVersion: currentVersion.value ?? "2.0.0",
      date: new Date().toISOString(),
      body: "Mock update for testing layout and progress bar",
      isMock: true,
    };

    availableUpdate.value = mockObj as unknown as PendingAppUpdate;

    if (mode === "downloading") {
      isInstallingUpdate.value = true;
      updateStatus.value = "installing";
      updateContentLength.value = 35 * 1024 * 1024;
      updateDownloadedBytes.value = 14.8 * 1024 * 1024;
    } else {
      isInstallingUpdate.value = false;
      updateStatus.value = "available";
      updateContentLength.value = null;
      updateDownloadedBytes.value = 0;
    }
  }

  function dismissBanner(): void {
    availableUpdate.value = null;
    isInstallingUpdate.value = false;
  }

  function init(): () => void {
    if (initialized.value) return () => {};
    initialized.value = true;

    if (import.meta.env.DEV && typeof window !== "undefined") {
      (window as unknown as { __mockAppUpdate?: typeof triggerMockUpdate }).__mockAppUpdate =
        triggerMockUpdate;
    }

    void fetchCurrentAppVersion()
      .then((ver) => {
        currentVersion.value = ver;
      })
      .catch(() => {
        currentVersion.value = "0.1.0";
      });

    const cancelIdle = scheduleIdleWork(() => {
      void checkForUpdate();
    });

    return cancelIdle;
  }

  return {
    // State
    currentVersion,
    updateStatus,
    availableUpdate,
    updateErrorMessage,
    isInstallingUpdate,
    updateDownloadedBytes,
    updateContentLength,
    initialized,
    // Actions
    checkForUpdate,
    installUpdate,
    triggerMockUpdate,
    dismissBanner,
    init,
  };
});
