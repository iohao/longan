import { invoke } from "@tauri-apps/api/core";

type FrontendLogLevel = "debug" | "info" | "warn" | "error";

interface FrontendLogEvent {
  level: FrontendLogLevel;
  message: string;
  stack?: string;
  source?: string;
}

function describeError(error: unknown): { message: string; stack?: string } {
  if (error instanceof Error) {
    return { message: error.message, stack: error.stack };
  }
  if (typeof error === "string") {
    return { message: error };
  }
  try {
    return { message: JSON.stringify(error) };
  } catch {
    return { message: String(error) };
  }
}

export function sendFrontendLog(event: FrontendLogEvent): void {
  if (!("__TAURI_INTERNALS__" in window)) return;
  void invoke("log_frontend_event", { event }).catch(() => {
    // Logging must never trigger another user-facing error.
  });
}

export function reportFrontendError(
  message: string,
  error: unknown,
  source?: string,
): void {
  console.error(message, error);
  const detail = describeError(error);
  sendFrontendLog({
    level: "error",
    message: `${message}: ${detail.message}`,
    stack: detail.stack,
    source,
  });
}

export function reportFrontendWarning(
  message: string,
  error: unknown,
  source?: string,
): void {
  console.warn(message, error);
  const detail = describeError(error);
  sendFrontendLog({
    level: "warn",
    message: `${message}: ${detail.message}`,
    stack: detail.stack,
    source,
  });
}

export function installGlobalErrorLogging(): () => void {
  const handleError = (event: ErrorEvent) => {
    sendFrontendLog({
      level: "error",
      message: event.message || "Unhandled window error",
      stack: event.error instanceof Error ? event.error.stack : undefined,
      source: event.filename || "window.error",
    });
  };
  const handleRejection = (event: PromiseRejectionEvent) => {
    const detail = describeError(event.reason);
    sendFrontendLog({
      level: "error",
      message: `Unhandled promise rejection: ${detail.message}`,
      stack: detail.stack,
      source: "window.unhandledrejection",
    });
  };

  window.addEventListener("error", handleError);
  window.addEventListener("unhandledrejection", handleRejection);
  return () => {
    window.removeEventListener("error", handleError);
    window.removeEventListener("unhandledrejection", handleRejection);
  };
}
