import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import zh from "./locales/zh.json";
import en from "./locales/en.json";
import { api } from "./api";

export type SupportedLanguage = "zh" | "en";

function isSupportedLanguage(language: string | null): language is SupportedLanguage {
  return language === "zh" || language === "en";
}

export function getSavedLanguage(
  storage: Pick<Storage, "getItem"> = localStorage,
): SupportedLanguage | null {
  const savedLanguage = storage.getItem("app_language");
  return isSupportedLanguage(savedLanguage) ? savedLanguage : null;
}

i18n.use(initReactI18next).init({
  resources: {
    zh: { translation: zh },
    en: { translation: en },
  },
  lng: getSavedLanguage() ?? "en",
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

export async function initializeLanguage(): Promise<void> {
  const persistedLanguage = await api.getSetting("language").catch(() => null);
  if (isSupportedLanguage(persistedLanguage)) {
    localStorage.setItem("app_language", persistedLanguage);
    await i18n.changeLanguage(persistedLanguage);
    return;
  }

  if (getSavedLanguage()) return;

  const systemLanguage = await api.getSystemLanguage().catch(() => "en");
  await i18n.changeLanguage(
    isSupportedLanguage(systemLanguage) ? systemLanguage : "en",
  );
}

export default i18n;
