export type ThemeMode = "dark" | "light" | "system";

const THEME_KEY = "app_theme";

export function getStoredTheme(): ThemeMode {
  const val = localStorage.getItem(THEME_KEY);
  if (val === "dark" || val === "light" || val === "system") {
    return val;
  }
  return "system";
}

export function getSystemTheme(): "dark" | "light" {
  if (typeof window !== "undefined" && window.matchMedia) {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return "dark";
}

export function applyTheme(mode: ThemeMode) {
  localStorage.setItem(THEME_KEY, mode);
  
  const activeTheme = mode === "system" ? getSystemTheme() : mode;
  const root = document.documentElement;

  if (activeTheme === "dark") {
    root.classList.add("dark");
    root.classList.remove("light");
    root.style.colorScheme = "dark";
  } else {
    root.classList.add("light");
    root.classList.remove("dark");
    root.style.colorScheme = "light";
  }

  window.dispatchEvent(new CustomEvent("theme-change", { detail: mode }));
  window.dispatchEvent(new Event("storage"));
}

export function initTheme(): () => void {
  const initialMode = getStoredTheme();
  applyTheme(initialMode);

  const mediaQuery = typeof window !== "undefined" && window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
  const handleSystemChange = () => {
    if (getStoredTheme() === "system") {
      applyTheme("system");
    }
  };

  if (mediaQuery) {
    mediaQuery.addEventListener("change", handleSystemChange);
  }

  const handleStorageChange = (e: StorageEvent) => {
    if (e.key === THEME_KEY) {
      applyTheme(getStoredTheme());
    }
  };
  window.addEventListener("storage", handleStorageChange);

  return () => {
    if (mediaQuery) {
      mediaQuery.removeEventListener("change", handleSystemChange);
    }
    window.removeEventListener("storage", handleStorageChange);
  };
}
