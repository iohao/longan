import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSetting: vi.fn<() => Promise<string | null>>(async () => null),
  setSetting: vi.fn<() => Promise<void>>(async () => undefined),
  getSystemLanguage: vi.fn<() => Promise<string>>(async () => "en"),
}));

vi.mock("@/api", () => ({
  api: mocks,
}));

import i18n, {
  getSavedLanguage,
  initializeLanguage,
  isSupportedLanguage,
  setLanguage,
} from "./i18n";
import zh from "./locales/zh.json";
import en from "./locales/en.json";

function getDeepKeys(obj: Record<string, unknown>, prefix = ""): string[] {
  let keys: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      keys = keys.concat(getDeepKeys(v as Record<string, unknown>, fullKey));
    } else {
      keys.push(fullKey);
    }
  }
  return keys;
}

describe("i18n helpers and language initialization", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    localStorage.clear();
    mocks.getSetting.mockResolvedValue(null);
    mocks.getSystemLanguage.mockResolvedValue("en");
    (i18n.global.locale as any).value = "en";
  });

  it("identifies supported languages correctly", () => {
    expect(isSupportedLanguage("zh")).toBe(true);
    expect(isSupportedLanguage("en")).toBe(true);
    expect(isSupportedLanguage("ja")).toBe(false);
    expect(isSupportedLanguage(null)).toBe(false);
    expect(isSupportedLanguage(undefined as unknown as string)).toBe(false);
  });

  it("uses the language returned by Rust on first use", async () => {
    mocks.getSystemLanguage.mockResolvedValue("zh");

    await initializeLanguage();

    expect((i18n.global.locale as any).value).toBe("zh");
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

    expect((i18n.global.locale as any).value).toBe("zh");
    expect(localStorage.getItem("app_language")).toBe("zh");
    expect(mocks.getSystemLanguage).not.toHaveBeenCalled();
  });

  it("updates locale, storage, and backend when setLanguage is called", async () => {
    await setLanguage("zh");

    expect((i18n.global.locale as any).value).toBe("zh");
    expect(localStorage.getItem("app_language")).toBe("zh");
    expect(mocks.setSetting).toHaveBeenCalledWith("language", "zh");
  });

  it("ensures zh and en locale files have identical key structures", () => {
    const zhKeys = getDeepKeys(zh).sort();
    const enKeys = getDeepKeys(en).sort();

    const missingInEn = zhKeys.filter((k) => !enKeys.includes(k));
    const missingInZh = enKeys.filter((k) => !zhKeys.includes(k));

    expect(missingInEn).toEqual([]);
    expect(missingInZh).toEqual([]);
    expect(zhKeys.length).toBeGreaterThan(100);
  });
});
