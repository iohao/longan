import { describe, it, expect, beforeEach } from "vitest";
import { applyTheme, getStoredTheme } from "./theme";

describe("theme", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.className = "";
  });

  it("applyTheme('dark') sets the dark class and color scheme", () => {
    applyTheme("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.classList.contains("light")).toBe(false);
    expect(document.documentElement.style.colorScheme).toBe("dark");
    expect(localStorage.getItem("app_theme")).toBe("dark");
  });

  it("applyTheme('light') replaces dark with light", () => {
    applyTheme("dark");
    applyTheme("light");
    expect(document.documentElement.classList.contains("light")).toBe(true);
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(document.documentElement.style.colorScheme).toBe("light");
  });

  it("getStoredTheme falls back to system on missing or garbage values", () => {
    expect(getStoredTheme()).toBe("system");
    localStorage.setItem("app_theme", "neon");
    expect(getStoredTheme()).toBe("system");
    localStorage.setItem("app_theme", "light");
    expect(getStoredTheme()).toBe("light");
  });
});
