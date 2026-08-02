import { useCallback, useEffect, useState, useMemo } from "react";
import type { KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import {
  Plus,
  AlertTriangle,
  ArrowLeft,
  RefreshCw,
  FileCheck2,
  Layers,
  Sparkles,
  AlertCircle,
  CheckCircle2,
  FolderX,
  FolderOpen,
  Search,
  X,
  Link2,
  PlusCircle,
  Bot,
  Globe,
  Settings2,
} from "lucide-react";
import { api, errorMessage } from "../api";
import type { Agent, EffectiveSkill, Preset, Project, Skill, SyncReport } from "../types";
import { buildPresetSkillSourceGroups } from "../utils/presets";
import {
  loadProjectDetailTab,
  saveProjectDetailTab,
  type ProjectDetailTab,
} from "../utils/navigation";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import Badge from "../components/ui/Badge";
import Input from "../components/ui/Input";
import SkillSourceActions from "../components/skills/SkillSourceActions";

interface ProjectDetailPageProps {
  projectId: number;
  onBack: () => void;
  onReloadProjects?: () => Promise<void>;
}

const PROJECT_DETAIL_TAB_ORDER: ProjectDetailTab[] = ["operations", "skills", "agents"];

export default function ProjectDetailPage({
  projectId,
  onBack,
  onReloadProjects,
}: ProjectDetailPageProps) {
  const { t } = useTranslation();
  const [project, setProject] = useState<Project | null>(null);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [effective, setEffective] = useState<EffectiveSkill[]>([]);
  const [report, setReport] = useState<SyncReport | null>(null);
  const [gitignoreDone, setGitignoreDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ProjectDetailTab>(() =>
    loadProjectDetailTab(projectId),
  );

  // Search filter for direct skills
  const [skillSearchQuery, setSkillSearchQuery] = useState("");

  const reload = useCallback(async () => {
    try {
      const [proj, ps, ag, ss, eff] = await Promise.all([
        api.getProject(projectId),
        api.listPresets(),
        api.listAgents(),
        api.rescanLocal(),
        api.effectiveSkills(projectId),
      ]);
      setProject(proj);
      setPresets(ps);
      setAgents(ag);
      setSkills(ss);
      setEffective(eff);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [projectId]);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    setActiveTab(loadProjectDetailTab(projectId));
  }, [projectId]);

  function selectTab(tab: ProjectDetailTab) {
    setActiveTab(tab);
    saveProjectDetailTab(projectId, tab);
  }

  function handleTabKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    currentTab: ProjectDetailTab,
  ) {
    const currentIndex = PROJECT_DETAIL_TAB_ORDER.indexOf(currentTab);
    let nextIndex: number | null = null;

    if (event.key === "ArrowRight") {
      nextIndex = (currentIndex + 1) % PROJECT_DETAIL_TAB_ORDER.length;
    } else if (event.key === "ArrowLeft") {
      nextIndex =
        (currentIndex - 1 + PROJECT_DETAIL_TAB_ORDER.length) %
        PROJECT_DETAIL_TAB_ORDER.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = PROJECT_DETAIL_TAB_ORDER.length - 1;
    }

    if (nextIndex === null) return;

    event.preventDefault();
    const nextTab = PROJECT_DETAIL_TAB_ORDER[nextIndex];
    selectTab(nextTab);
    document.getElementById(`project-detail-tab-${nextTab}`)?.focus();
  }

  async function handleOpenDir(path: string) {
    setError(null);
    try {
      await api.openPath(path);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function togglePreset(presetId: number) {
    if (!project) return;
    setError(null);
    try {
      const linked = !project.preset_ids.includes(presetId);
      setReport(await api.setProjectPreset(projectId, presetId, linked));
      await reload();
      if (onReloadProjects) {
        await onReloadProjects();
      }
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function toggleAgent(agentId: number) {
    if (!project) return;
    setError(null);
    try {
      const linked = !project.agent_ids.includes(agentId);
      setReport(await api.setProjectAgent(projectId, agentId, linked));
      await reload();
      if (onReloadProjects) {
        await onReloadProjects();
      }
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function toggleSkill(skillId: number) {
    if (!project) return;
    setError(null);
    try {
      const linked = !project.skill_ids.includes(skillId);
      setReport(await api.setProjectSkill(projectId, skillId, linked));
      await reload();
      if (onReloadProjects) {
        await onReloadProjects();
      }
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function resync() {
    setError(null);
    try {
      setReport(await api.syncProject(projectId));
      await reload();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function gitignore() {
    setError(null);
    try {
      await api.gitignoreLinks(projectId);
      setGitignoreDone(true);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  // Filter skills based on search query in direct skills card
  const filteredSkills = useMemo(() => {
    if (!skillSearchQuery.trim()) return skills;
    const q = skillSearchQuery.toLowerCase().trim();
    return skills.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.description && s.description.toLowerCase().includes(q)) ||
        s.dir_path.toLowerCase().includes(q) ||
        (s.owner && s.owner.toLowerCase().includes(q)) ||
        (s.repo && s.repo.toLowerCase().includes(q))
    );
  }, [skills, skillSearchQuery]);

  // Agents effective for this project (global or explicitly linked)
  const activeAgentCount = useMemo(
    () =>
      agents.filter((a) => a.global_enabled || (project?.agent_ids.includes(a.id) ?? false))
        .length,
    [agents, project]
  );

  // Get currently attached skill IDs for filtering duplicates
  const attachedSkillIds = useMemo(() => {
    if (!project) return new Set<number>();
    return new Set(project.skill_ids);
  }, [project]);

  // Filter available skills: exclude both attached and effective skills
  const availableForAttachment = useMemo(() => {
    const effectiveSkillIds = new Set(effective.map((e) => e.skill_id));
    return filteredSkills.filter(
      (s) => !attachedSkillIds.has(s.id) && !effectiveSkillIds.has(s.id)
    );
  }, [filteredSkills, attachedSkillIds, effective]);

  // Keep project-owned skills separate, then map preset skills to their concrete owners.
  const groupedEffective = useMemo(() => {
    const direct = effective.filter((item) => item.via === "direct");
    const inheritedBySkillId = new Map(
      effective
        .filter((item) => item.via !== "direct")
        .map((item) => [item.skill_id, item]),
    );
    const presetGroups = buildPresetSkillSourceGroups(presets, project?.preset_ids ?? [])
      .map((group) => ({
        ...group,
        items: group.skillIds.flatMap((skillId) => {
          const item = inheritedBySkillId.get(skillId);
          return item ? [item] : [];
        }),
      }))
      .filter((group) => group.items.length > 0);

    return { direct, presets: presetGroups };
  }, [effective, presets, project?.preset_ids]);

  const skillsById = useMemo(
    () => new Map(skills.map((skill) => [skill.id, skill])),
    [skills],
  );

  if (!project) {
    return (
      <div className="p-12 text-center text-slate-400 animate-pulse text-sm">
        {t("common.loading")}
      </div>
    );
  }

  const projectTabs = [
    { id: "operations", label: t("projects.operations"), icon: Settings2 },
    { id: "skills", label: t("projects.attachDirectSkills"), icon: PlusCircle },
    { id: "agents", label: t("projects.agents"), icon: Bot },
  ] as const;

  return (
    <div className="max-w-5xl space-y-6">
      {/* Back Button */}
      <button
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-400 hover:text-emerald-300 transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        <span>{t("common.back")}</span>
      </button>

      {/* Detail Header */}
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold text-slate-100 tracking-tight truncate">
            {project.name}
          </h1>
          {!project.path_exists && (
            <Badge variant="danger" className="shrink-0">
              <FolderX className="w-3.5 h-3.5" />
              <span>{t("projects.pathMissing")}</span>
            </Badge>
          )}
        </div>
        <p className="text-xs text-slate-400 font-mono mt-1 truncate">{project.path}</p>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-sm flex items-center gap-2 animate-in fade-in slide-in-from-top-2 duration-300">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {report && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-sm flex items-center gap-2 animate-in fade-in slide-in-from-top-2 duration-300">
          <Sparkles className="w-4 h-4 shrink-0 text-emerald-400" />
          <span>
            {t("projects.synced", {
              created: report.created.length,
              removed: report.removed.length,
            })}
          </span>
        </div>
      )}

      <div className="space-y-4">
        <div className="overflow-x-auto border-b border-slate-800/80">
          <div
            role="tablist"
            aria-label={t("projects.detailTabs")}
            className="flex min-w-max items-center gap-1"
          >
            {projectTabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  id={`project-detail-tab-${tab.id}`}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  aria-controls={`project-detail-panel-${tab.id}`}
                  tabIndex={isActive ? 0 : -1}
                  onClick={() => selectTab(tab.id)}
                  onKeyDown={(event) => handleTabKeyDown(event, tab.id)}
                  className={`flex h-11 shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-400/70 ${
                    isActive
                      ? "border-emerald-400 text-emerald-300"
                      : "border-transparent text-slate-500 hover:border-slate-700 hover:text-slate-200"
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <section
          id="project-detail-panel-operations"
          role="tabpanel"
          aria-labelledby="project-detail-tab-operations"
          tabIndex={0}
          hidden={activeTab !== "operations"}
        >
          {activeTab === "operations" && (
            <Card hoverEffect={false}>
              <div className="mb-4 flex items-center gap-2 border-b border-slate-800/80 pb-3">
                <Settings2 className="h-4 w-4 text-emerald-400" />
                <h2 className="text-sm font-semibold text-slate-100">
                  {t("projects.operations")}
                </h2>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleOpenDir(project.path)}
                  icon={<FolderOpen className="h-3.5 w-3.5 text-emerald-400" />}
                  className="w-full sm:w-auto"
                >
                  {t("projects.openDir")}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={resync}
                  icon={<RefreshCw className="h-3.5 w-3.5" />}
                  className="w-full sm:w-auto"
                >
                  {t("projects.sync")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={gitignore}
                  disabled={gitignoreDone}
                  icon={<FileCheck2 className="h-3.5 w-3.5 text-emerald-400" />}
                  className="w-full sm:w-auto"
                >
                  {gitignoreDone ? t("projects.gitignoreDone") : t("projects.gitignore")}
                </Button>
              </div>
            </Card>
          )}
        </section>

        <section
          id="project-detail-panel-skills"
          role="tabpanel"
          aria-labelledby="project-detail-tab-skills"
          tabIndex={0}
          hidden={activeTab !== "skills"}
        >
          {activeTab === "skills" && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 px-1">
                <PlusCircle className="h-4 w-4 text-sky-400" />
                <h2 className="text-sm font-semibold text-slate-100">
                  {t("projects.attachDirectSkills")}
                </h2>
                <Badge variant="neutral" className="px-1.5 py-0 text-[10px]">
                  {skills.length} total
                </Badge>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Card hoverEffect={false} className="h-full">
                  <div className="mb-3 flex items-center justify-between border-b border-slate-800/80 pb-2">
                    <h3 className="flex items-center gap-2 text-xs font-semibold text-emerald-400">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      <span>{t("projects.attached")}</span>
                    </h3>
                    <Badge variant="info" className="px-1.5 py-0 text-[10px]">
                      {project.skill_ids.length}
                    </Badge>
                  </div>

                  {project.skill_ids.length === 0 ? (
                    <p className="py-4 text-center text-xs italic text-slate-500">
                      {t("common.empty")}
                    </p>
                  ) : (
                    <div className="max-h-64 space-y-1.5 overflow-y-auto pr-1">
                      {filteredSkills
                        .filter((skill) => project.skill_ids.includes(skill.id))
                        .map((skill) => (
                          <button
                            key={skill.id}
                            type="button"
                            onClick={() => toggleSkill(skill.id)}
                            className="flex w-full items-center justify-between rounded-lg border border-sky-500/30 bg-sky-500/10 p-2 text-left text-xs font-medium text-sky-300 transition-colors hover:bg-sky-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/70"
                          >
                            <span className="mr-2 min-w-0 flex-1">
                              <span className="block truncate font-semibold">{skill.name}</span>
                              {skill.description && (
                                <span className="block truncate text-[10px] text-slate-500">
                                  {skill.description}
                                </span>
                              )}
                            </span>
                            <Badge variant="neutral" className="shrink-0 text-[10px]">
                              {t(`library.source.${skill.source_type}`)}
                            </Badge>
                          </button>
                        ))}
                    </div>
                  )}
                </Card>

                <Card hoverEffect={false} className="h-full">
                  <Input
                    placeholder={t("projects.searchDirectPlaceholder")}
                    value={skillSearchQuery}
                    onChange={(event) => setSkillSearchQuery(event.target.value)}
                    icon={<Search className="h-3.5 w-3.5 text-slate-400" />}
                    className="mb-3 p-2.5"
                    rightElement={
                      skillSearchQuery ? (
                        <button
                          type="button"
                          onClick={() => setSkillSearchQuery("")}
                          aria-label={t("common.clear")}
                          className="cursor-pointer rounded p-1 text-slate-500 transition-colors hover:bg-slate-800/60 hover:text-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      ) : undefined
                    }
                  />

                  <div className="mb-3 flex items-center justify-between border-b border-slate-800/80 pb-2">
                    <h3 className="flex items-center gap-2 text-xs font-semibold text-slate-400">
                      <Plus className="h-3.5 w-3.5 text-slate-500" />
                      <span>{t("projects.availableToAttach")}</span>
                    </h3>
                    <Badge variant="neutral" className="px-1.5 py-0 text-[10px]">
                      {availableForAttachment.length}
                    </Badge>
                  </div>

                  {availableForAttachment.length === 0 ? (
                    <p className="py-4 text-center text-xs italic text-slate-500">
                      {skills.every((skill) => project.skill_ids.includes(skill.id))
                        ? t("presets.allAdded")
                        : t("install.noResults")}
                    </p>
                  ) : (
                    <div className="max-h-64 space-y-1.5 overflow-y-auto pb-2 pr-1">
                      {availableForAttachment.map((skill) => (
                        <button
                          key={skill.id}
                          type="button"
                          onClick={() => toggleSkill(skill.id)}
                          className="flex w-full items-center justify-between rounded-lg border border-slate-800/80 bg-slate-900/60 p-2 text-left text-xs text-slate-400 transition-colors hover:border-slate-700 hover:bg-slate-800/60 hover:text-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70"
                        >
                          <span className="mr-2 min-w-0 flex-1">
                            <span className="block truncate font-semibold">{skill.name}</span>
                            {skill.description && (
                              <span className="block truncate text-[10px] text-slate-500">
                                {skill.description}
                              </span>
                            )}
                          </span>
                          <Badge variant="neutral" className="shrink-0 text-[10px]">
                            {t(`library.source.${skill.source_type}`)}
                          </Badge>
                        </button>
                      ))}
                    </div>
                  )}
                </Card>
              </div>
            </div>
          )}
        </section>

        <section
          id="project-detail-panel-agents"
          role="tabpanel"
          aria-labelledby="project-detail-tab-agents"
          tabIndex={0}
          hidden={activeTab !== "agents"}
        >
          {activeTab === "agents" && (
            <Card hoverEffect={false}>
              <div className="mb-4 flex items-center gap-2 border-b border-slate-800/80 pb-3">
                <Bot className="h-4 w-4 text-emerald-400" />
                <h2 className="text-sm font-semibold text-slate-100">
                  {t("projects.agents")}
                </h2>
                <Badge
                  variant={activeAgentCount > 0 ? "info" : "neutral"}
                  className="px-1.5 py-0 text-[10px]"
                >
                  {t("projects.agentsActive", {
                    enabled: activeAgentCount,
                    total: agents.length,
                  })}
                </Badge>
              </div>
              <div className="space-y-3">
                <p className="text-xs text-slate-500">{t("projects.agentPanelDesc")}</p>
                {agents.length === 0 ? (
                  <div className="flex flex-col items-center gap-3 py-4 text-center">
                    <p className="text-xs italic text-slate-500">
                      {t("projects.agentsEmptyHint")}
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => window.dispatchEvent(new CustomEvent("navigateToAgents"))}
                      icon={<Bot className="h-3.5 w-3.5 text-emerald-400" />}
                    >
                      {t("projects.manageAgentDirectories")}
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {agents.map((agent) => {
                      const isGlobal = agent.global_enabled;
                      const active = isGlobal || project.agent_ids.includes(agent.id);
                      return (
                        <button
                          key={agent.id}
                          type="button"
                          onClick={() => !isGlobal && toggleAgent(agent.id)}
                          disabled={isGlobal}
                          title={isGlobal ? t("agents.globalEnabledHint") : agent.target_dir}
                          className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70 ${
                            active
                              ? "border-emerald-500/50 bg-emerald-500/30 text-emerald-100"
                              : "border-slate-800 bg-slate-900/40 text-slate-400 hover:border-slate-700 hover:bg-slate-800/60 hover:text-slate-200"
                          } ${isGlobal ? "cursor-default opacity-80" : ""}`}
                        >
                          <span>{agent.name}</span>
                          {isGlobal && <Globe className="h-3 w-3 text-emerald-300" />}
                          <span
                            className={`rounded-full px-1.5 font-mono text-[10px] ${
                              active
                                ? "bg-emerald-500/40 text-emerald-200"
                                : "bg-slate-800/60 text-slate-500"
                            }`}
                          >
                            {agent.target_dir}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </Card>
          )}
        </section>
      </div>

      {/* Preset Tags & Effective Active Skills Combined Panel */}
      <Card hoverEffect={false} className="p-4">
        {/* Preset Tags Section */}
        <div className="mb-6 pb-4 border-b border-slate-800/60">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-emerald-400 flex items-center gap-2">
              <Layers className="w-4 h-4" />
              <span>{t("projects.presets")}</span>
            </h2>
            <Badge variant="neutral" className="text-[10px] px-1.5 py-0">
              {project?.preset_ids.length || 0} selected
            </Badge>
          </div>
          <div className="flex flex-wrap gap-2">
            {presets.map((p) => {
              const active = project?.preset_ids.includes(p.id);
              return (
                <button
                  key={p.id}
                  onClick={() => togglePreset(p.id)}
                  className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-all flex items-center gap-1.5 relative overflow-hidden ${
                    active
                      ? "bg-emerald-500/30 text-emerald-100 border-emerald-500/50"
                      : "bg-slate-900/40 border-slate-800 text-slate-400 hover:bg-slate-800/60 hover:text-slate-200 hover:border-slate-700"
                  }`}
                >
                  <span>{p.name}</span>
                  <span className={`text-[10px] px-1.5 rounded-full ${
                    active ? "bg-emerald-500/40 text-emerald-200" : "bg-slate-800/60 text-slate-500"
                  }`}>
                    {p.skill_ids.length}
                  </span>
                </button>
              );
            })}
            {presets.length === 0 && (
              <p className="text-xs text-slate-500">{t("common.empty")}</p>
            )}
          </div>
        </div>

        {/* Effective Active Skills Section */}
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-800/80">
          <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>{t("projects.effective")}</span>
          </h2>
          <Badge variant="info" className="text-xs">
            {effective.length} active
          </Badge>
        </div>

        {effective.length === 0 ? (
          <p className="text-xs text-slate-500 italic text-center py-6">{t("common.empty")}</p>
        ) : (
          <div className="space-y-6">
            {/* 🌟 1. Project-Specific Direct Skills (Priority Section at the top) */}
            {groupedEffective.direct.length > 0 && (
              <div className="space-y-2.5">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-amber-400">
                    {t("projects.effectiveCategoryDirect")}
                  </h3>
                  <Badge variant="warning" className="text-[10px] px-1.5 py-0">
                    {groupedEffective.direct.length}
                  </Badge>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {groupedEffective.direct.map((e) => (
                    <div
                      key={`direct-${e.name}-${e.skill_id}`}
                      className="group relative flex items-center justify-between gap-3 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 transition-all duration-200 hover:border-amber-500/40 hover:bg-amber-500/10"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-semibold text-amber-200 truncate">
                            {e.name}
                          </span>
                        </div>
                        <span className="text-xs text-slate-400 font-mono block truncate mt-0.5">
                          {e.dir_path}
                        </span>
                      </div>

                      <div className="flex shrink-0 items-center gap-1.5">
                        {e.conflicted && (
                          <Badge variant="warning" className="text-[10px]">
                            <AlertTriangle className="w-3 h-3" />
                            <span>{t("projects.conflict")}</span>
                          </Badge>
                        )}
                        <SkillSourceActions
                          skill={skillsById.get(e.skill_id) ?? { id: e.skill_id }}
                          onError={setError}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {groupedEffective.presets.length > 0 && (
              <section
                aria-labelledby="project-inherited-skills-heading"
                className={`space-y-4 ${
                  groupedEffective.direct.length > 0 ? "border-t border-slate-800/60 pt-4" : ""
                }`}
              >
                <div className="flex items-center gap-2">
                  <Link2 className="h-4 w-4 text-sky-400" />
                  <h3
                    id="project-inherited-skills-heading"
                    className="text-xs font-bold uppercase tracking-wider text-sky-400"
                  >
                    {t("presets.inheritedSkills")}
                  </h3>
                  <Badge variant="neutral" className="px-1.5 py-0 text-[10px]">
                    {effective.length - groupedEffective.direct.length}
                  </Badge>
                </div>

                <div className="space-y-5">
                  {groupedEffective.presets.map((group) => {
                    const headingId = `project-preset-source-${group.presetId}`;
                    return (
                      <section
                        key={group.presetId}
                        aria-labelledby={headingId}
                        className="space-y-2.5"
                      >
                        <div className="flex min-w-0 items-center gap-2 px-1">
                          <h4
                            id={headingId}
                            className="flex min-w-0 flex-1 items-center gap-1.5 text-xs font-semibold text-sky-300"
                          >
                            <Link2 className="h-3.5 w-3.5 shrink-0 text-sky-400/80" />
                            <span className="truncate" title={group.presetName}>
                              {group.presetName}
                            </span>
                          </h4>
                          <span className="shrink-0 font-mono text-[10px] text-slate-500">
                            {group.items.length}
                          </span>
                        </div>

                        <div className="border-l border-sky-500/25 pl-3">
                          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                            {group.items.map((e) => (
                              <div
                                key={`${group.presetId}:${e.skill_id}`}
                                className="group flex min-w-0 items-center justify-between gap-3 rounded-lg border border-sky-500/20 bg-sky-500/[0.06] p-3 transition-colors hover:border-sky-500/35 hover:bg-sky-500/[0.09]"
                              >
                                <div className="min-w-0 flex-1">
                                  <span
                                    className="block truncate text-sm font-medium text-slate-200"
                                    title={e.name}
                                  >
                                    {e.name}
                                  </span>
                                  <span
                                    className="mt-0.5 block truncate font-mono text-xs text-slate-400"
                                    title={e.dir_path}
                                  >
                                    {e.dir_path}
                                  </span>
                                </div>

                                <div className="flex shrink-0 items-center gap-1.5">
                                  {e.conflicted && (
                                    <Badge variant="warning" className="text-[10px]">
                                      <AlertTriangle className="h-3 w-3" />
                                      <span>{t("projects.conflict")}</span>
                                    </Badge>
                                  )}
                                  <SkillSourceActions
                                    skill={skillsById.get(e.skill_id) ?? { id: e.skill_id }}
                                    onError={setError}
                                  />
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </section>
                    );
                  })}
                </div>
              </section>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
