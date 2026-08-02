import type { PageKey } from "../components/Sidebar";

export type ProjectDetailTab = "operations" | "skills" | "agents";

interface StorageReader {
  getItem(key: string): string | null;
}

interface StorageWriter {
  setItem(key: string, value: string): void;
}

export interface NavigationState {
  page: PageKey;
  selectedProjectId: number | null;
}

const NAVIGATION_STORAGE_KEY = "longan:navigation";
const PROJECT_DETAIL_TAB_STORAGE_PREFIX = "longan:project-detail-tab";
const PAGE_KEYS: PageKey[] = [
  "market",
  "installed",
  "presets",
  "agents",
  "migration",
  "projects",
  "settings",
  "tools",
];
const PROJECT_DETAIL_TABS: ProjectDetailTab[] = ["operations", "skills", "agents"];
const DEFAULT_NAVIGATION: NavigationState = { page: "market", selectedProjectId: null };
const NAVIGATION_SHORTCUTS: Partial<Record<string, PageKey>> = {
  Digit1: "market",
  Digit2: "presets",
  Digit3: "installed",
  Comma: "settings",
};

type NavigationShortcutEvent = Pick<
  KeyboardEvent,
  | "altKey"
  | "code"
  | "ctrlKey"
  | "isComposing"
  | "metaKey"
  | "repeat"
  | "shiftKey"
>;

export function resolveNavigationShortcut(
  event: NavigationShortcutEvent,
  platform: string = navigator.platform,
): PageKey | null {
  const isMac = platform.startsWith("Mac");
  const hasPrimaryModifier = isMac
    ? event.metaKey && !event.ctrlKey
    : event.ctrlKey && !event.metaKey;

  if (
    !hasPrimaryModifier ||
    event.altKey ||
    event.shiftKey ||
    event.isComposing ||
    event.repeat
  ) {
    return null;
  }

  return NAVIGATION_SHORTCUTS[event.code] ?? null;
}

export function registerNavigationShortcuts(
  onNavigate: (page: PageKey) => void,
  target: Window = window,
  platform: string = navigator.platform,
) {
  const handleKeyDown = (event: KeyboardEvent) => {
    const nextPage = resolveNavigationShortcut(event, platform);
    if (!nextPage) return;

    event.preventDefault();
    onNavigate(nextPage);
  };

  target.addEventListener("keydown", handleKeyDown);
  return () => target.removeEventListener("keydown", handleKeyDown);
}

export function loadNavigationState(
  storage: StorageReader = window.sessionStorage,
): NavigationState {
  try {
    const raw = storage.getItem(NAVIGATION_STORAGE_KEY);
    if (!raw) return DEFAULT_NAVIGATION;

    const saved: unknown = JSON.parse(raw);
    if (!saved || typeof saved !== "object") return DEFAULT_NAVIGATION;

    const { page, selectedProjectId } = saved as Record<string, unknown>;
    if (typeof page !== "string" || !PAGE_KEYS.includes(page as PageKey)) {
      return DEFAULT_NAVIGATION;
    }

    const validProjectId =
      page === "projects" &&
      typeof selectedProjectId === "number" &&
      Number.isSafeInteger(selectedProjectId) &&
      selectedProjectId > 0
        ? selectedProjectId
        : null;

    return { page: page as PageKey, selectedProjectId: validProjectId };
  } catch {
    return DEFAULT_NAVIGATION;
  }
}

export function saveNavigationState(
  navigation: NavigationState,
  storage: StorageWriter = window.sessionStorage,
) {
  try {
    storage.setItem(NAVIGATION_STORAGE_KEY, JSON.stringify(navigation));
  } catch {
    // Navigation persistence is best effort; storage can be unavailable.
  }
}

function projectDetailTabStorageKey(projectId: number) {
  return `${PROJECT_DETAIL_TAB_STORAGE_PREFIX}:${projectId}`;
}

export function loadProjectDetailTab(
  projectId: number,
  storage: StorageReader = window.sessionStorage,
): ProjectDetailTab {
  try {
    const saved = storage.getItem(projectDetailTabStorageKey(projectId));
    return PROJECT_DETAIL_TABS.includes(saved as ProjectDetailTab)
      ? (saved as ProjectDetailTab)
      : "operations";
  } catch {
    return "operations";
  }
}

export function saveProjectDetailTab(
  projectId: number,
  tab: ProjectDetailTab,
  storage: StorageWriter = window.sessionStorage,
) {
  try {
    storage.setItem(projectDetailTabStorageKey(projectId), tab);
  } catch {
    // Tab persistence is best effort; storage can be unavailable.
  }
}
