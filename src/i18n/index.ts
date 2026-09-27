import { createI18n } from "vue-i18n";
import zh from "../locales/zh.json";
import en from "../locales/en.json";
import { api } from "../api";

export type SupportedLanguage = "zh" | "en";

export function isSupportedLanguage(language: string | null): language is SupportedLanguage {
  return language === "zh" || language === "en";
}

export function getSavedLanguage(
  storage: Pick<Storage, "getItem"> = localStorage,
): SupportedLanguage | null {
  const saved = storage.getItem("app_language");
  return isSupportedLanguage(saved) ? saved : null;
}

function normalizePlaceholders<T>(obj: T): T {
  if (typeof obj === "string") {
    return obj.replace(/\{\{\s*(\w+)\s*\}\}/g, "{$1}") as unknown as T;
  }
  if (Array.isArray(obj)) {
    return obj.map(normalizePlaceholders) as unknown as T;
  }
  if (typeof obj === "object" && obj !== null) {
    const res: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      res[k] = normalizePlaceholders(v);
    }
    return res as unknown as T;
  }
  return obj;
}

const normalizedZh = normalizePlaceholders(zh);
const normalizedEn = normalizePlaceholders(en);

export const i18n = createI18n({
  legacy: false,
  locale: getSavedLanguage() || "zh",
  fallbackLocale: "en",
  messages: {
    zh: normalizedZh,
    en: normalizedEn,
  },
});

export async function setLanguage(
  language: SupportedLanguage,
  storage: Pick<Storage, "setItem"> = localStorage,
): Promise<void> {
  storage.setItem("app_language", language);
  (i18n.global.locale as any).value = language;
  await api.setSetting("language", language).catch(() => {
    // Non-critical persistence failure
  });
}

export async function initializeLanguage(): Promise<void> {
  const persisted = await api.getSetting("language").catch(() => null);
  if (isSupportedLanguage(persisted)) {
    localStorage.setItem("app_language", persisted);
    (i18n.global.locale as any).value = persisted;
    return;
  }
  if (getSavedLanguage()) return;

  const system = await api.getSystemLanguage().catch(() => "zh");
  const target: SupportedLanguage = isSupportedLanguage(system) ? system : "en";
  (i18n.global.locale as any).value = target;
}

export default i18n;
