import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import {
  checkForPendingAppUpdate,
  fetchCurrentAppVersion,
  installPendingAppUpdate,
  type PendingAppUpdate,
} from "../api/updater";
import { reportFrontendError, reportFrontendWarning } from "../logging";

export type UpdateStatus = "idle" | "checking" | "available" | "upToDate" | "installing" | "error";

export interface UpdateContextType {
  currentVersion: string | null;
  updateStatus: UpdateStatus;
  availableUpdate: PendingAppUpdate | null;
  updateErrorMessage: string | null;
  isInstallingUpdate: boolean;
  updateDownloadedBytes: number;
  updateContentLength: number | null;
  installUpdate: () => Promise<void>;
}

const UpdateContext = createContext<UpdateContextType | null>(null);
const AUTOMATIC_CHECK_IDLE_TIMEOUT_MS = 2_000;

type AutomaticCheckResult =
  | { status: "success"; update: PendingAppUpdate | null }
  | { status: "error" };

let automaticCheckPromise: Promise<AutomaticCheckResult> | null = null;

function getAutomaticCheck(): Promise<AutomaticCheckResult> {
  automaticCheckPromise ??= checkForPendingAppUpdate()
    .then((update) => ({ status: "success" as const, update }))
    .catch((error) => {
      reportFrontendWarning("Application update check failed", error, "UpdateProvider");
      return { status: "error" as const };
    });

  return automaticCheckPromise;
}

function scheduleIdleWork(callback: () => void): () => void {
  if (typeof window.requestIdleCallback === "function") {
    const callbackId = window.requestIdleCallback(callback, {
      timeout: AUTOMATIC_CHECK_IDLE_TIMEOUT_MS,
    });
    return () => window.cancelIdleCallback?.(callbackId);
  }

  const timeoutId = window.setTimeout(callback, AUTOMATIC_CHECK_IDLE_TIMEOUT_MS);
  return () => window.clearTimeout(timeoutId);
}

export function UpdateProvider({ children }: { children: React.ReactNode }) {
  const [currentVersion, setCurrentVersion] = useState<string | null>(null);
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>("idle");
  const [availableUpdate, setAvailableUpdate] = useState<PendingAppUpdate | null>(null);
  const [updateErrorMessage, setUpdateErrorMessage] = useState<string | null>(null);
  const [isInstallingUpdate, setIsInstallingUpdate] = useState(false);
  const [updateDownloadedBytes, setUpdateDownloadedBytes] = useState(0);
  const [updateContentLength, setUpdateContentLength] = useState<number | null>(null);

  const isCheckingRef = useRef(false);
  const isInstallingRef = useRef(false);
  const availableUpdateRef = useRef<PendingAppUpdate | null>(null);
  availableUpdateRef.current = availableUpdate;

  useEffect(() => {
    fetchCurrentAppVersion()
      .then((v) => setCurrentVersion(v))
      .catch(() => setCurrentVersion("0.1.0"));
  }, []);

  const installUpdate = useCallback(async () => {
    const updateToInstall = availableUpdateRef.current;
    if (!updateToInstall || isInstallingRef.current || isCheckingRef.current) return;

    isInstallingRef.current = true;
    setIsInstallingUpdate(true);
    setUpdateStatus("installing");
    setUpdateErrorMessage(null);
    setUpdateDownloadedBytes(0);
    setUpdateContentLength(null);

    try {
      await installPendingAppUpdate(updateToInstall, (event) => {
        if (event.kind === "started") {
          setUpdateContentLength(event.contentLength);
        } else if (event.kind === "progress") {
          setUpdateDownloadedBytes((prev) => prev + event.chunkLength);
        }
      });
    } catch (error) {
      reportFrontendError("Application update installation failed", error, "UpdateProvider");
      const message = error instanceof Error ? error.message : String(error);
      setIsInstallingUpdate(false);
      setUpdateStatus("error");
      setUpdateErrorMessage(message);
    } finally {
      isInstallingRef.current = false;
    }
  }, []);

  useEffect(() => {
    let disposed = false;

    const cancelIdleWork = scheduleIdleWork(() => {
      isCheckingRef.current = true;
      setUpdateStatus("checking");
      setUpdateErrorMessage(null);

      void getAutomaticCheck().then((result) => {
        if (disposed) return;

        if (result.status === "success") {
          setAvailableUpdate(result.update);
          setUpdateDownloadedBytes(0);
          setUpdateContentLength(null);
          setUpdateStatus(result.update ? "available" : "upToDate");
        } else {
          setUpdateStatus("idle");
        }
        isCheckingRef.current = false;
      });
    });

    return () => {
      disposed = true;
      cancelIdleWork();
    };
  }, []);

  return (
    <UpdateContext.Provider
      value={{
        currentVersion,
        updateStatus,
        availableUpdate,
        updateErrorMessage,
        isInstallingUpdate,
        updateDownloadedBytes,
        updateContentLength,
        installUpdate,
      }}
    >
      {children}
    </UpdateContext.Provider>
  );
}

export function useAppUpdate() {
  const ctx = useContext(UpdateContext);
  if (!ctx) {
    throw new Error("useAppUpdate must be used within an UpdateProvider");
  }
  return ctx;
}
