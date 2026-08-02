import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  loadNavigationState,
  loadProjectDetailTab,
  registerNavigationShortcuts,
  resolveNavigationShortcut,
  saveNavigationState,
  saveProjectDetailTab,
} from "./navigation";

beforeEach(() => {
  sessionStorage.clear();
});

describe("navigation session state", () => {
  it("restores a project detail location after a document reload", () => {
    saveNavigationState({ page: "projects", selectedProjectId: 7 });

    expect(loadNavigationState()).toEqual({ page: "projects", selectedProjectId: 7 });
  });

  it("drops malformed and page-incompatible project ids", () => {
    sessionStorage.setItem(
      "longan:navigation",
      JSON.stringify({ page: "market", selectedProjectId: 7 }),
    );
    expect(loadNavigationState()).toEqual({ page: "market", selectedProjectId: null });

    sessionStorage.setItem("longan:navigation", "not-json");
    expect(loadNavigationState()).toEqual({ page: "market", selectedProjectId: null });
  });

  it("stores project detail tabs independently", () => {
    saveProjectDetailTab(7, "skills");
    saveProjectDetailTab(8, "agents");

    expect(loadProjectDetailTab(7)).toBe("skills");
    expect(loadProjectDetailTab(8)).toBe("agents");
    expect(loadProjectDetailTab(9)).toBe("operations");
  });
});

describe("navigation shortcuts", () => {
  it.each([
    ["Digit1", "market"],
    ["Digit2", "presets"],
    ["Digit3", "installed"],
    ["Comma", "settings"],
  ] as const)("maps macOS Command+%s to %s", (code, page) => {
    const event = new KeyboardEvent("keydown", { code, metaKey: true });

    expect(resolveNavigationShortcut(event, "MacIntel")).toBe(page);
  });

  it.each([
    ["Digit1", "market"],
    ["Digit2", "presets"],
    ["Digit3", "installed"],
    ["Comma", "settings"],
  ] as const)("maps Windows Ctrl+%s to %s", (code, page) => {
    const event = new KeyboardEvent("keydown", { code, ctrlKey: true });

    expect(resolveNavigationShortcut(event, "Win32")).toBe(page);
  });

  it.each([
    new KeyboardEvent("keydown", { code: "Digit1" }),
    new KeyboardEvent("keydown", { code: "Digit1", ctrlKey: true }),
    new KeyboardEvent("keydown", { code: "Digit1", metaKey: true, shiftKey: true }),
    new KeyboardEvent("keydown", { code: "Digit1", metaKey: true, altKey: true }),
    new KeyboardEvent("keydown", { code: "Digit1", metaKey: true, isComposing: true }),
    new KeyboardEvent("keydown", { code: "Digit1", metaKey: true, repeat: true }),
    new KeyboardEvent("keydown", { code: "KeyK", metaKey: true }),
  ])("ignores unsupported macOS key combinations", (event) => {
    expect(resolveNavigationShortcut(event, "MacIntel")).toBeNull();
  });

  it("prevents matched defaults and removes its listener during cleanup", () => {
    const onNavigate = vi.fn();
    const cleanup = registerNavigationShortcuts(onNavigate, window, "MacIntel");
    const matchedEvent = new KeyboardEvent("keydown", {
      code: "Digit2",
      metaKey: true,
      cancelable: true,
    });

    window.dispatchEvent(matchedEvent);

    expect(matchedEvent.defaultPrevented).toBe(true);
    expect(onNavigate).toHaveBeenCalledOnce();
    expect(onNavigate).toHaveBeenCalledWith("presets");

    cleanup();
    window.dispatchEvent(
      new KeyboardEvent("keydown", { code: "Digit3", metaKey: true }),
    );
    expect(onNavigate).toHaveBeenCalledOnce();
  });
});
