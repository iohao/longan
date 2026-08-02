import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { exit } from "@tauri-apps/plugin-process";
import PageIdBadge from "./components/PageIdBadge";
import Sidebar, { PageKey } from "./components/Sidebar";
import { api } from "./api";
import type { Preset, Project, ProjectGroup } from "./types";
import { initTheme } from "./utils/theme";
import {
  loadNavigationState,
  registerNavigationShortcuts,
  saveNavigationState,
} from "./utils/navigation";
import {
  parseProjectHiddenPreview,
  PROJECT_HIDDEN_PREVIEW_SETTING_KEY,
} from "./utils/projectOrder";
import { UpdateProvider } from "./context/UpdateContext";
import { UpdateNotificationProvider } from "./context/UpdateNotificationContext";
import { DebugModeProvider, useDebugMode } from "./context/DebugModeContext";
import { SkillInstallProvider } from "./context/SkillInstallContext";
import { AppScrollProvider } from "./context/AppScrollContext";
import UpdateBanner from "./components/UpdateBanner";
import { reportFrontendError } from "./logging";

// Non-default pages are loaded on demand to keep the first paint light.
const PresetsPage = lazy(() => import("./pages/PresetsPage"));
const ProjectsPage = lazy(() => import("./pages/ProjectsPage"));
const ProjectDetailPage = lazy(() => import("./pages/ProjectDetailPage"));
const AgentsPage = lazy(() => import("./pages/AgentsPage"));
const MigrationPage = lazy(() => import("./pages/MigrationPage"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const InstalledPage = lazy(() => import("./pages/InstalledPage"));
const SkillMarketPage = lazy(() => import("./pages/SkillMarketPage"));

const PAGE_FILE_MAP: Record<PageKey, string> = {
  market: "src/pages/SkillMarketPage.tsx",
  installed: "src/pages/InstalledPage.tsx",
  presets: "src/pages/PresetsPage.tsx",
  agents: "src/pages/AgentsPage.tsx",
  migration: "src/pages/MigrationPage.tsx",
  projects: "src/pages/ProjectsPage.tsx",
  settings: "src/pages/SettingsPage.tsx",
  tools: "src/pages/AgentsPage.tsx", // tools acts as a wrapper
};

const PROJECT_DETAIL_FILE = "src/pages/ProjectDetailPage.tsx";

// Internal component that uses debug mode
function AppContent() {
  const [navigation, setNavigation] = useState(loadNavigationState);
  const { page, selectedProjectId } = navigation;
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectGroups, setProjectGroups] = useState<ProjectGroup[]>([]);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [showHiddenProjectsInSidebar, setShowHiddenProjectsInSidebar] = useState(false);
  const [projectsLoaded, setProjectsLoaded] = useState(false);
  // Get debugMode from context
  const { debugMode } = useDebugMode();
  const closingRef = useRef(false);
  const scrollContainerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!("__TAURI_INTERNALS__" in window)) return;

    let disposed = false;
    let unlisten: (() => void) | undefined;
    const appWindow = getCurrentWindow();
    void appWindow.onCloseRequested(async (event) => {
      if (closingRef.current) return;
      event.preventDefault();
      closingRef.current = true;
      try {
        await appWindow.hide();
      } catch (error) {
        reportFrontendError("Failed to hide window before closing", error, "App");
      }
      try {
        await Promise.all([
          api.cancelSkillInstalls(),
          api.cancelSkillUpdates(),
        ]);
      } catch (error) {
        reportFrontendError("Failed to cancel skill operations before closing", error, "App");
      } finally {
        try {
          await exit(0);
        } catch {
          await appWindow.destroy();
        }
      }
    }).then((cleanup) => {
      if (disposed) cleanup();
      else unlisten = cleanup;
    });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  // Listen for navigation events from child components (e.g., AgentsPage → ProjectDetail)
  useEffect(() => {
    const handleNavigateToProject = (event: CustomEvent<number>) => {
      const projectId = event.detail;
      setNavigation({ page: "projects", selectedProjectId: projectId });
    };

    const handleNavigateToAgents = () => {
      setNavigation({ page: "agents", selectedProjectId: null });
    };

    window.addEventListener('navigateToProject' as any, handleNavigateToProject as any);
    window.addEventListener("navigateToAgents", handleNavigateToAgents);

    return () => {
      window.removeEventListener('navigateToProject' as any, handleNavigateToProject as any);
      window.removeEventListener("navigateToAgents", handleNavigateToAgents);
    };
  }, []);

  useEffect(() => {
    return initTheme();
  }, []);

  const reloadProjects = useCallback(async () => {
    try {
      const [
        projList,
        groupList,
        presetList,
        savedHiddenPreview,
      ] = await Promise.all([
        api.listProjects(),
        api.listProjectGroups(),
        api.listPresets(),
        api.getSetting(PROJECT_HIDDEN_PREVIEW_SETTING_KEY),
      ]);
      setShowHiddenProjectsInSidebar(parseProjectHiddenPreview(savedHiddenPreview));
      setProjects(projList);
      setProjectGroups(groupList);
      setPresets(presetList);
      setProjectsLoaded(true);
    } catch (e) {
      reportFrontendError("Failed to load projects list", e, "App");
    }
  }, []);

  useEffect(() => {
    reloadProjects();
  }, [reloadProjects]);

  useEffect(() => {
    saveNavigationState(navigation);
  }, [navigation]);

  useEffect(() => {
    if (
      projectsLoaded &&
      page === "projects" &&
      selectedProjectId !== null &&
      !projects.some((project) => project.id === selectedProjectId)
    ) {
      setNavigation({ page: "projects", selectedProjectId: null });
    }
  }, [page, projects, projectsLoaded, selectedProjectId]);

  const handleSelectPage = useCallback((nextPage: PageKey) => {
    setNavigation((current) => ({
      page: nextPage,
      selectedProjectId: nextPage === "projects" ? current.selectedProjectId : null,
    }));
  }, []);

  useEffect(() => {
    return registerNavigationShortcuts(handleSelectPage);
  }, [handleSelectPage]);

  const handleSelectProject = useCallback((projectId: number | null) => {
    setNavigation({ page: "projects", selectedProjectId: projectId });
  }, []);

  const handleAddProject = async () => {
    try {
      const path = await open({ directory: true, multiple: false });
      if (typeof path !== "string") return;
      const id = await api.addProject(path);
      await reloadProjects();
      handleSelectProject(id);
    } catch (e) {
      reportFrontendError("Failed to add project", e, "App");
    }
  };

  const handleSetHiddenProjectsPreview = useCallback(async (show: boolean) => {
    await api.setSetting(PROJECT_HIDDEN_PREVIEW_SETTING_KEY, String(show));
    setShowHiddenProjectsInSidebar(show);
  }, []);

  return (
    <AppScrollProvider scrollRef={scrollContainerRef}>
      <div className="flex h-screen bg-slate-950 text-slate-100 font-sans overflow-hidden">
        <Sidebar
          currentPage={page}
          selectedProjectId={selectedProjectId}
          onSelectPage={handleSelectPage}
          onSelectProject={handleSelectProject}
          projects={projects}
          projectGroups={projectGroups}
          presets={presets}
          showHiddenProjects={showHiddenProjectsInSidebar}
          onAddProject={handleAddProject}
        />
        
        <main
          ref={scrollContainerRef}
          className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-y-none bg-gradient-to-b from-slate-950 via-slate-900/60 to-slate-950"
        >
          <UpdateBanner />
          {debugMode && (
            <div className="px-8 py-3 border-b border-slate-800/60 bg-slate-950/80 backdrop-blur-md sticky top-0 z-20 flex items-center justify-between shrink-0">
              <PageIdBadge
                pageId={
                  page === "projects" && selectedProjectId !== null
                    ? PROJECT_DETAIL_FILE
                    : page === "tools"
                    ? "src/pages/ToolsContainer.tsx" // tools is a conceptual container
                    : PAGE_FILE_MAP[page]
                }
              />
            </div>
          )}
          <div className="flex-1 p-8 flex flex-col">
            <Suspense fallback={null}>
              {page === "market" && <SkillMarketPage debugMode={debugMode} />}
              {page === "installed" && <InstalledPage onSkillsChanged={reloadProjects} onGoExplore={() => handleSelectPage("market")} />}
              {page === "presets" && <PresetsPage onPresetsChanged={reloadProjects} />}
              {page === "agents" && <AgentsPage />}
              {page === "migration" && (
                <MigrationPage
                  onProfileImported={reloadProjects}
                  onGoToPresets={() => handleSelectPage("presets")}
                />
              )}
              {page === "projects" && selectedProjectId === null && (
                <ProjectsPage
                  projects={projects}
                  projectGroups={projectGroups}
                  presets={presets}
                  showHiddenProjectsInSidebar={showHiddenProjectsInSidebar}
                  onSelectProject={handleSelectProject}
                  onReloadProjects={reloadProjects}
                  onAddProject={handleAddProject}
                  onSetHiddenProjectsPreview={handleSetHiddenProjectsPreview}
                />
              )}
              {page === "projects" && selectedProjectId !== null && (
                <ProjectDetailPage
                  key={selectedProjectId}
                  projectId={selectedProjectId}
                  onBack={() => handleSelectProject(null)}
                  onReloadProjects={reloadProjects}
                />
              )}
              {page === "settings" && <SettingsPage />}
            </Suspense>
          </div>
        </main>
      </div>
    </AppScrollProvider>
  );
}

export default function App() {
  return (
    <DebugModeProvider>
      <UpdateProvider>
        <UpdateNotificationProvider>
          <SkillInstallProvider>
            <AppContent />
          </SkillInstallProvider>
        </UpdateNotificationProvider>
      </UpdateProvider>
    </DebugModeProvider>
  );
}
