import { getVersion } from "@tauri-apps/api/app";
import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";

export type PendingAppUpdate = Update;

export type AppUpdateProgressEvent =
  | { kind: "started"; contentLength: number | null }
  | { kind: "progress"; chunkLength: number }
  | { kind: "finished" };

export function isTauriEnvironment(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export async function fetchCurrentAppVersion(): Promise<string> {
  if (!isTauriEnvironment()) {
    return "0.1.0 (dev)";
  }
  try {
    return await getVersion();
  } catch {
    return "0.1.0";
  }
}

export async function checkForPendingAppUpdate(): Promise<PendingAppUpdate | null> {
  if (!isTauriEnvironment()) {
    return null;
  }
  return await check();
}

export async function installPendingAppUpdate(
  update: PendingAppUpdate,
  onProgress?: (event: AppUpdateProgressEvent) => void
): Promise<void> {
  if (!isTauriEnvironment()) {
    return;
  }

  await update.downloadAndInstall((event) => {
    switch (event.event) {
      case "Started":
        onProgress?.({
          kind: "started",
          contentLength: event.data.contentLength ?? null,
        });
        break;
      case "Progress":
        onProgress?.({
          kind: "progress",
          chunkLength: event.data.chunkLength,
        });
        break;
      case "Finished":
        onProgress?.({ kind: "finished" });
        break;
    }
  });

  await relaunch();
}
