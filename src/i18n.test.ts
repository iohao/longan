import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSetting: vi.fn<() => Promise<string | null>>(async () => null),
  getSystemLanguage: vi.fn<() => Promise<string>>(async () => "en"),
}));

vi.mock("./api", () => ({
  api: mocks,
}));

import i18n, { getSavedLanguage, initializeLanguage } from "./i18n";

describe("language initialization", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    localStorage.clear();
    mocks.getSetting.mockResolvedValue(null);
    mocks.getSystemLanguage.mockResolvedValue("en");
    await i18n.changeLanguage("en");
  });

  it("uses the language returned by Rust on first use", async () => {
    mocks.getSystemLanguage.mockResolvedValue("zh");

    await initializeLanguage();

    expect(i18n.language).toBe("zh");
    expect(mocks.getSystemLanguage).toHaveBeenCalledOnce();
  });

  it("keeps a saved language when no backend language exists", async () => {
    localStorage.setItem("app_language", "zh");

    await initializeLanguage();

    expect(getSavedLanguage()).toBe("zh");
    expect(mocks.getSystemLanguage).not.toHaveBeenCalled();
  });

  it("uses the persisted backend language before the system language", async () => {
    mocks.getSetting.mockResolvedValue("zh");

    await initializeLanguage();

    expect(i18n.language).toBe("zh");
    expect(localStorage.getItem("app_language")).toBe("zh");
    expect(mocks.getSystemLanguage).not.toHaveBeenCalled();
  });
});
