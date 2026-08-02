import { StrictMode } from "react";
import { act, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const updaterMocks = vi.hoisted(() => ({
  checkForPendingAppUpdate: vi.fn(),
  fetchCurrentAppVersion: vi.fn(),
  installPendingAppUpdate: vi.fn(),
}));

const loggingMocks = vi.hoisted(() => ({
  reportFrontendError: vi.fn(),
  reportFrontendWarning: vi.fn(),
}));

vi.mock("../api/updater", () => updaterMocks);
vi.mock("../logging", () => loggingMocks);

const idleDeadline: IdleDeadline = {
  didTimeout: false,
  timeRemaining: () => 50,
};

describe("UpdateProvider", () => {
  let UpdateProvider: typeof import("./UpdateContext").UpdateProvider;
  let idleCallbacks: Map<number, IdleRequestCallback>;
  let originalRequestIdleCallback: typeof window.requestIdleCallback;
  let originalCancelIdleCallback: typeof window.cancelIdleCallback;

  async function runIdleCallbacks() {
    const callbacks = [...idleCallbacks.values()];
    idleCallbacks.clear();
    await act(async () => {
      callbacks.forEach((callback) => callback(idleDeadline));
    });
  }

  beforeEach(async () => {
    vi.resetModules();

    idleCallbacks = new Map();
    let nextCallbackId = 1;
    originalRequestIdleCallback = window.requestIdleCallback;
    originalCancelIdleCallback = window.cancelIdleCallback;
    Object.defineProperty(window, "requestIdleCallback", {
      configurable: true,
      writable: true,
      value: vi.fn((callback: IdleRequestCallback) => {
        const callbackId = nextCallbackId++;
        idleCallbacks.set(callbackId, callback);
        return callbackId;
      }),
    });
    Object.defineProperty(window, "cancelIdleCallback", {
      configurable: true,
      writable: true,
      value: vi.fn((callbackId: number) => {
        idleCallbacks.delete(callbackId);
      }),
    });

    updaterMocks.fetchCurrentAppVersion.mockResolvedValue("0.1.0");
    updaterMocks.checkForPendingAppUpdate.mockResolvedValue(null);
    ({ UpdateProvider } = await import("./UpdateContext"));
    vi.clearAllMocks();
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
    render(
      <UpdateProvider>
        <div>content</div>
      </UpdateProvider>,
    );

    expect(updaterMocks.checkForPendingAppUpdate).not.toHaveBeenCalled();

    await runIdleCallbacks();

    await waitFor(() => {
      expect(updaterMocks.checkForPendingAppUpdate).toHaveBeenCalledTimes(1);
    });
  });

  it("checks only once in StrictMode", async () => {
    render(
      <StrictMode>
        <UpdateProvider>
          <div>content</div>
        </UpdateProvider>
      </StrictMode>,
    );

    await runIdleCallbacks();

    await waitFor(() => {
      expect(updaterMocks.checkForPendingAppUpdate).toHaveBeenCalledTimes(1);
    });
  });

  it("reuses the automatic check after the provider remounts", async () => {
    const firstRender = render(
      <UpdateProvider>
        <div>first</div>
      </UpdateProvider>,
    );
    await runIdleCallbacks();
    await waitFor(() => {
      expect(updaterMocks.checkForPendingAppUpdate).toHaveBeenCalledTimes(1);
    });

    firstRender.unmount();
    render(
      <UpdateProvider>
        <div>second</div>
      </UpdateProvider>,
    );
    await runIdleCallbacks();

    expect(updaterMocks.checkForPendingAppUpdate).toHaveBeenCalledTimes(1);
  });

  it("reports one warning when the automatic check fails", async () => {
    const failure = new Error("all update endpoints failed");
    updaterMocks.checkForPendingAppUpdate.mockRejectedValue(failure);

    render(
      <StrictMode>
        <UpdateProvider>
          <div>content</div>
        </UpdateProvider>
      </StrictMode>,
    );
    await runIdleCallbacks();

    await waitFor(() => {
      expect(loggingMocks.reportFrontendWarning).toHaveBeenCalledTimes(1);
    });
    expect(loggingMocks.reportFrontendWarning).toHaveBeenCalledWith(
      "Application update check failed",
      failure,
      "UpdateProvider",
    );
  });

  it("uses the timeout fallback when idle callbacks are unavailable", async () => {
    Object.defineProperty(window, "requestIdleCallback", {
      configurable: true,
      writable: true,
      value: undefined,
    });
    vi.useFakeTimers();

    render(
      <UpdateProvider>
        <div>content</div>
      </UpdateProvider>,
    );

    expect(updaterMocks.checkForPendingAppUpdate).not.toHaveBeenCalled();

    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });
    expect(updaterMocks.checkForPendingAppUpdate).toHaveBeenCalledTimes(1);
  });
});
