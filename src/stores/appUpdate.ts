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

  function init(): () => void {
    if (initialized.value) return () => {};
    initialized.value = true;

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
    init,
  };
});
