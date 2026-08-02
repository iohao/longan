import React, { useState, useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  Store,
  Layers,
  FolderGit2,
  Settings,
  ChevronDown,
  ChevronRight,
  Plus,
  AlertTriangle,
  BookOpen,
  Bot,
  Archive,
  MoreVertical,
  EyeOff,
  FolderTree,
} from "lucide-react";
import type { Preset, Project, ProjectGroup } from "../types";
import { getProjectSkillCount } from "../types";
import { buildProjectGroupSections } from "../utils/projectOrder";
import { useUpdateNotification } from "../context/UpdateNotificationContext";
import SkillInstallQueue from "./SkillInstallQueue";

export type PageKey = "market" | "installed" | "presets" | "agents" | "migration" | "projects" | "settings" | "tools";

export interface NavItem {
  key: PageKey;
  icon: React.ReactNode;
}

export const NAV_ITEMS: NavItem[] = [
  { key: "projects", icon: <FolderGit2 className="w-4 h-4" /> },
  { key: "market", icon: <Store className="w-4 h-4" /> },
  { key: "presets", icon: <Layers className="w-4 h-4" /> },
  { key: "installed", icon: <BookOpen className="w-4 h-4" /> },
  { key: "tools", icon: <MoreVertical className="w-4 h-4" /> },
  { key: "settings", icon: <Settings className="w-4 h-4" /> },
];

// Tools group items (collapsed in dropdown under tools)
export const TOOLS_NAV_ITEMS: NavItem[] = [
  { key: "agents", icon: <Bot className="w-4 h-4" /> },
  { key: "migration", icon: <Archive className="w-4 h-4" /> },
];

interface SidebarProps {
  currentPage: PageKey;
  selectedProjectId: number | null;
  onSelectPage: (page: PageKey) => void;
  onSelectProject: (projectId: number | null) => void;
  projects?: Project[];
  projectGroups?: ProjectGroup[];
  presets?: Preset[];
  showHiddenProjects?: boolean;
  onAddProject?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentPage,
  selectedProjectId,
  onSelectPage,
  onSelectProject,
  projects = [],
  projectGroups = [],
  presets = [],
  showHiddenProjects = false,
  onAddProject,
}) => {
  const { t } = useTranslation();
  const { updatableCount } = useUpdateNotification();
  const [isProjectsExpanded, setIsProjectsExpanded] = useState<boolean>(true);
  const [isToolsExpanded, setIsToolsExpanded] = useState<boolean>(false);
  const previousPageRef = useRef<PageKey>(currentPage);
  const toolsButtonRef = useRef<HTMLButtonElement>(null);
  const groupedProjects = useMemo(
    () => buildProjectGroupSections(projectGroups, projects),
    [projectGroups, projects],
  );
  const sidebarGroups = groupedProjects.filter(({ group, visibleProjects, hiddenProjects }) => {
    if (group.hidden && !showHiddenProjects) return false;
    const displayedCount = visibleProjects.length + (showHiddenProjects ? hiddenProjects.length : 0);
    return displayedCount > 0;
  });

  // Close tools dropdown when clicking outside or switching pages
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      const sidebar = document.querySelector('.w-64');
      
      // Don't close if clicking inside the tools button
      if (toolsButtonRef.current?.contains(target)) return;
      
      // Don't close if clicking inside the dropdown panel
      const dropdown = document.querySelector('[data-tools-dropdown]') as HTMLElement;
      if (dropdown?.contains(target)) return;
      
      // Close when clicking anywhere else in the sidebar or outside
      if (sidebar && isToolsExpanded) {
        setIsToolsExpanded(false);
        if (currentPage === "tools") {
          onSelectPage("market");
        }
      }
    };

    // Update ref and check if we should close the dropdown when page changes
    if (previousPageRef.current !== currentPage) {
      if (currentPage !== "agents" && currentPage !== "migration") {
        setIsToolsExpanded(false);
      }
      previousPageRef.current = currentPage;
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [currentPage, isToolsExpanded, onSelectPage]);

  // Exclude projects (rendered in its own section), tools (rendered as dropdown)
  // and settings (rendered after the tools dropdown so it stays at the bottom)
  const mainNavItems = NAV_ITEMS.filter(
    (item) => item.key !== "projects" && item.key !== "tools" && item.key !== "settings"
  );
  const settingsNavItem = NAV_ITEMS.find((item) => item.key === "settings");
  const projectsNavItem = NAV_ITEMS.find((item) => item.key === "projects");

  const renderNavButton = (item: NavItem) => {
    const isCurrentPageActive = currentPage === item.key;
    const showUpdateBadge = item.key === 'installed' && updatableCount > 0;
    return (
      <button
        key={item.key}
        onClick={() => onSelectPage(item.key)}
        className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 group ${
          isCurrentPageActive
            ? "bg-emerald-600/15 text-emerald-400 border border-emerald-500/30 shadow-sm"
            : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/80"
        }`}
      >
        <div className="flex items-center gap-3">
          <span
            className={`transition-colors ${
              isCurrentPageActive
                ? "text-emerald-400"
                : "text-slate-400 group-hover:text-slate-300"
            }`}
          >
            {item.icon}
          </span>
          <span>{t(`nav.${item.key}`)}</span>
          {showUpdateBadge && (
            <span className="shrink-0 flex items-center justify-center min-w-[20px] h-[20px] px-1.5 ml-auto bg-red-500 text-white text-xs font-bold rounded-full shadow-lg shadow-red-500/30 animate-pulse">
              {updatableCount > 99 ? '99+' : updatableCount}
            </span>
          )}
        </div>
      </button>
    );
  };

  const renderProjectItem = (project: Project) => {
    const isSelected =
      currentPage === "projects" && selectedProjectId === project.id;
    const totalSkills = getProjectSkillCount(project, presets);

    return (
      <button
        key={project.id}
        onClick={() => onSelectProject(project.id)}
        title={project.path}
        className={`group/proj flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all duration-150 ${
          isSelected
            ? "border border-emerald-500/30 bg-emerald-600/20 font-semibold text-emerald-300"
            : project.hidden
              ? "text-slate-500 hover:bg-slate-900/60 hover:text-slate-300"
              : "text-slate-400 hover:bg-slate-900/60 hover:text-slate-200"
        }`}
      >
        <div className="flex min-w-0 items-center gap-1.5">
          {project.hidden && <EyeOff className="h-3 w-3 shrink-0" aria-hidden="true" />}
          <span className="truncate">{project.name}</span>
        </div>
        <div className="ml-1.5 flex shrink-0 items-center gap-1.5">
          <span
            className={`rounded-full border px-1.5 py-0.5 font-mono text-[10px] transition-colors ${
              isSelected
                ? "border-emerald-500/30 bg-emerald-500/20 font-semibold text-emerald-300"
                : "border-slate-800 bg-slate-900 text-slate-400 group-hover/proj:border-slate-700"
            }`}
            title={`${totalSkills} skill(s)`}
          >
            {totalSkills}
          </span>
          {!project.path_exists && (
            <span title="Project directory missing" className="shrink-0">
              <AlertTriangle className="h-3 w-3 text-amber-400" />
            </span>
          )}
        </div>
      </button>
    );
  };

  return (
    <aside className="relative w-64 shrink-0 border-r border-slate-800/80 bg-slate-950 flex flex-col justify-between select-none">
      {/* Brand Header */}
      <div className="px-5 py-5 border-b border-slate-800/80 flex items-center gap-3 shrink-0">
        <div className="w-8 h-8 rounded-xl overflow-hidden flex items-center justify-center shrink-0 shadow-md shadow-slate-900/50">
          <img src="/icon.png" alt="Longan Logo" className="w-full h-full object-cover" />
        </div>
        <div>
          <h1 className="text-sm font-bold tracking-wide text-slate-100 flex items-center gap-1.5">
            Longan
          </h1>
          <p className="text-[11px] text-slate-400 font-mono">{t("app.codename")}</p>
        </div>
      </div>

      {/* Region 1: Projects Section (Scrollable Top / Middle) */}
      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-y-none p-3">
        <div className="space-y-1">
          {/* Projects Group Header */}
          <div
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 group cursor-pointer ${
              currentPage === "projects"
                ? "bg-emerald-600/10 text-emerald-400 border border-emerald-500/20"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/80"
            }`}
            onClick={() => {
              onSelectProject(null);
              if (!isProjectsExpanded) setIsProjectsExpanded(true);
            }}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsProjectsExpanded(!isProjectsExpanded);
                }}
                className="p-0.5 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
                title={isProjectsExpanded ? "Collapse" : "Expand"}
              >
                {isProjectsExpanded ? (
                  <ChevronDown className="w-3.5 h-3.5" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5" />
                )}
              </button>

              <span
                className={`transition-colors shrink-0 ${
                  currentPage === "projects"
                    ? "text-emerald-400"
                    : "text-slate-400 group-hover:text-slate-300"
                }`}
              >
                {projectsNavItem?.icon || <FolderGit2 className="w-4 h-4" />}
              </span>
              <span className="truncate">{t("nav.projects")}</span>
              {projects.length > 0 && (
                <span className="ml-1 text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-slate-800/80 text-slate-400 border border-slate-700/50">
                  {projects.length}
                </span>
              )}
            </div>

            <div
              className="flex items-center gap-1.5 shrink-0"
              onClick={(e) => e.stopPropagation()}
            >
              {onAddProject && (
                <button
                  type="button"
                  onClick={() => {
                    onAddProject();
                    if (!isProjectsExpanded) setIsProjectsExpanded(true);
                  }}
                  className="p-1 rounded-lg text-slate-400 hover:text-emerald-300 hover:bg-emerald-500/20 transition-all"
                  title={t("common.create") || "Add Project"}
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Projects Sub-list */}
          {isProjectsExpanded && sidebarGroups.length > 0 && (
            <div className="ml-3 pl-3 border-l border-slate-800/80 space-y-0.5 py-1">
              {sidebarGroups.map(({ group, visibleProjects, hiddenProjects }, groupIndex) => {
                const groupName = group.is_system
                  ? t("projectGroups.ungrouped")
                  : group.name ?? "";
                const startsHiddenGroups = group.hidden && !sidebarGroups
                  .slice(0, groupIndex)
                  .some((section) => section.group.hidden);
                if (group.is_system) {
                  return (
                    <React.Fragment key={group.id}>
                      {startsHiddenGroups && (
                        <div
                          role="separator"
                          aria-label={t("projectGroups.hiddenGroups")}
                          className="mb-1.5 flex items-center gap-1.5 px-2.5 text-[10px] font-semibold text-slate-500"
                        >
                          <EyeOff className="h-3 w-3" aria-hidden="true" />
                          <span>{t("projectGroups.hiddenGroups")}</span>
                        </div>
                      )}
                      {visibleProjects.map(renderProjectItem)}
                      {showHiddenProjects && hiddenProjects.length > 0 && (
                        <>
                          <div
                            role="separator"
                            aria-label={t("projectGroups.hiddenProjectsInGroup", { name: groupName })}
                            className="my-1.5 border-t border-dashed border-slate-800/90"
                          />
                          {hiddenProjects.map(renderProjectItem)}
                        </>
                      )}
                    </React.Fragment>
                  );
                }
                return (
                  <section
                    key={group.id}
                    aria-label={groupName}
                    className={groupIndex > 0 ? "mt-2 border-t border-dashed border-slate-700/80 pt-2" : ""}
                  >
                    {startsHiddenGroups && (
                      <div
                        role="separator"
                        aria-label={t("projectGroups.hiddenGroups")}
                        className="mb-1.5 flex items-center gap-1.5 px-2.5 text-[10px] font-semibold text-slate-500"
                      >
                        <EyeOff className="h-3 w-3" aria-hidden="true" />
                        <span>{t("projectGroups.hiddenGroups")}</span>
                      </div>
                    )}
                    <div className="mb-1 flex min-w-0 items-center gap-1.5 px-2.5 text-[10px] font-semibold text-slate-500">
                      {group.hidden ? (
                        <EyeOff className="h-3 w-3 shrink-0" aria-hidden="true" />
                      ) : (
                        <FolderTree className="h-3 w-3 shrink-0" aria-hidden="true" />
                      )}
                      <span className="truncate" title={groupName}>{groupName}</span>
                    </div>
                    {visibleProjects.map(renderProjectItem)}
                    {showHiddenProjects && hiddenProjects.length > 0 && (
                      <>
                        <div
                          role="separator"
                          aria-label={t("projectGroups.hiddenProjectsInGroup", { name: groupName })}
                          className="my-1.5 border-t border-dashed border-slate-800/90"
                        />
                        {hiddenProjects.map(renderProjectItem)}
                      </>
                    )}
                  </section>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Region 2: Skill Market, Presets & Settings (Fixed Bottom) */}
      <div className="shrink-0 p-3 space-y-1 border-t border-slate-800/80 bg-slate-950">
        <nav className="space-y-1">
          {mainNavItems.map(renderNavButton)}

          {/* Tools Dropdown Menu */}
          <div className="relative">
            <button
              ref={toolsButtonRef}
              onClick={() => {
                setIsToolsExpanded(!isToolsExpanded);
                if (currentPage === "tools") {
                  onSelectPage("market"); // Exit tools view
                }
              }}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 group ${
                currentPage === "tools"
                  ? "bg-emerald-600/15 text-emerald-400 border border-emerald-500/30 shadow-sm"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/80"
              }`}
            >
              <div className="flex items-center gap-3">
                <span
                  className={`transition-colors ${
                    currentPage === "tools"
                      ? "text-emerald-400"
                      : "text-slate-400 group-hover:text-slate-300"
                  }`}
                >
                  <MoreVertical className="w-4 h-4" />
                </span>
                <span>{t("nav.tools")}</span>
              </div>
              <ChevronDown
                className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-150 ${
                  isToolsExpanded ? "rotate-180" : ""
                }`}
              />
            </button>

            {/* Dropdown Panel */}
            {isToolsExpanded && (
              <div className="absolute bottom-full left-0 right-0 mb-1 mx-3 rounded-xl bg-slate-900 border border-slate-700 shadow-xl shadow-slate-900/50 overflow-hidden z-30" data-tools-dropdown>
                <div className="py-1">
                  {TOOLS_NAV_ITEMS.map((toolItem) => {
                    const isToolItemActive = currentPage === toolItem.key;
                    return (
                      <button
                        key={toolItem.key}
                        onClick={() => {
                          onSelectPage(toolItem.key);
                          setIsToolsExpanded(false); // Close dropdown when navigating to tool page
                        }}
                        className={`w-full flex items-center justify-between px-3 py-2.5 text-sm font-medium transition-all duration-150 ${
                          isToolItemActive
                            ? "bg-emerald-600/20 text-emerald-300"
                            : "text-slate-300 hover:bg-slate-800"
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <span className="shrink-0">
                            {toolItem.icon}
                          </span>
                          <span>{t(`nav.${toolItem.key}`)}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <SkillInstallQueue />

          {/* Settings (always at the bottom) */}
          {settingsNavItem && renderNavButton(settingsNavItem)}
        </nav>
      </div>
    </aside>
  );
};

export default Sidebar;
