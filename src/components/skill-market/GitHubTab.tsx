import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Download,
  AlertCircle,
  FolderGit2,
  RefreshCw,
  Layers,
  CheckCircle2,
  FolderCheck,
} from "lucide-react";
import Button from "../ui/Button";
import Input from "../ui/Input";
import Card from "../ui/Card";
import Alert from "../ui/Alert";
import { Badge } from "../ui/Badge";
import GithubIcon from "../icons/GithubIcon";
import { parseGitHubInput } from "../../utils/url";
import { api, errorMessage } from "../../api";
import type { DiscoveredSkill } from "../../types";

interface GitHubTabProps {
  urlInput: string;
  setUrlInput: (value: string) => void;
  onInstall: () => void;
  onBatchInstall?: (skills: DiscoveredSkill[], owner: string, repo: string) => void;
}

/**
 * GitHub 导入标签页 - URL 解析预览 + 仓库技能探测 + 单/多技能批量安装
 */
export default function GitHubTab({
  urlInput,
  setUrlInput,
  onInstall,
  onBatchInstall,
}: GitHubTabProps) {
  const { t } = useTranslation();

  // 🔥 PERFORMANCE: 每次 render 只解析一次输入
  const parsed = useMemo(() => parseGitHubInput(urlInput), [urlInput]);

  const [discoveredSkills, setDiscoveredSkills] = useState<DiscoveredSkill[] | null>(null);
  const [discovering, setDiscovering] = useState(false);
  const [discoverError, setDiscoverError] = useState<string | null>(null);
  const [selectedSkillIds, setSelectedSkillIds] = useState<Set<string>>(new Set());

  const triggerInspect = useCallback((owner: string, repo: string, subpath?: string) => {
    setDiscovering(true);
    setDiscoverError(null);

    api.inspectGithubSkills(owner, repo, subpath)
      .then((skills) => {
        setDiscoveredSkills(skills);
        // Default: select all skills that are not already installed
        const uninstalled = skills.filter((s) => !s.installed).map((s) => s.skillId);
        setSelectedSkillIds(new Set(uninstalled.length > 0 ? uninstalled : skills.map((s) => s.skillId)));
      })
      .catch((err) => {
        setDiscoverError(errorMessage(err));
      })
      .finally(() => {
        setDiscovering(false);
      });
  }, []);

  useEffect(() => {
    if (!parsed || !parsed.isValid) {
      setDiscoveredSkills(null);
      setDiscoverError(null);
      return;
    }

    const timer = setTimeout(() => {
      triggerInspect(parsed.owner, parsed.repo, parsed.subpath);
    }, 400);

    return () => clearTimeout(timer);
  }, [parsed?.owner, parsed?.repo, parsed?.subpath, parsed?.isValid, triggerInspect]);

  const allSelected = useMemo(() => {
    if (!discoveredSkills || discoveredSkills.length === 0) return false;
    return discoveredSkills.every((s) => selectedSkillIds.has(s.skillId));
  }, [discoveredSkills, selectedSkillIds]);

  const toggleSelectAll = useCallback(() => {
    if (!discoveredSkills) return;
    if (allSelected) {
      setSelectedSkillIds(new Set());
    } else {
      setSelectedSkillIds(new Set(discoveredSkills.map((s) => s.skillId)));
    }
  }, [allSelected, discoveredSkills]);

  const toggleSkill = useCallback((skillId: string) => {
    setSelectedSkillIds((prev) => {
      const next = new Set(prev);
      if (next.has(skillId)) {
        next.delete(skillId);
      } else {
        next.add(skillId);
      }
      return next;
    });
  }, []);

  const handleBatchInstall = useCallback(() => {
    if (!parsed || !parsed.isValid || !discoveredSkills) return;
    const toInstall = discoveredSkills.filter((s) => selectedSkillIds.has(s.skillId));
    if (toInstall.length === 0) return;

    if (onBatchInstall) {
      onBatchInstall(toInstall, parsed.owner, parsed.repo);
    } else {
      onInstall();
    }
  }, [parsed, discoveredSkills, selectedSkillIds, onBatchInstall, onInstall]);

  const handleSingleInstall = useCallback((skill: DiscoveredSkill) => {
    if (!parsed || !parsed.isValid) return;
    if (onBatchInstall) {
      onBatchInstall([skill], parsed.owner, parsed.repo);
    } else {
      onInstall();
    }
  }, [parsed, onBatchInstall, onInstall]);

  const handlePrimaryAction = useCallback(() => {
    if (discoveredSkills && discoveredSkills.length > 1) {
      handleBatchInstall();
    } else if (discoveredSkills && discoveredSkills.length === 1) {
      handleSingleInstall(discoveredSkills[0]);
    } else {
      onInstall();
    }
  }, [discoveredSkills, handleBatchInstall, handleSingleInstall, onInstall]);

  const primaryButtonLabel = useMemo(() => {
    if (discoveredSkills && discoveredSkills.length > 1) {
      return t("install.batchInstall", { count: selectedSkillIds.size });
    }
    return t("common.install");
  }, [discoveredSkills, selectedSkillIds.size, t]);

  const isPrimaryDisabled = useMemo(() => {
    if (!parsed?.isValid) return true;
    if (discovering) return true;
    if (discoveredSkills && discoveredSkills.length > 1) {
      return selectedSkillIds.size === 0;
    }
    return false;
  }, [parsed?.isValid, discovering, discoveredSkills, selectedSkillIds.size]);

  return (
    <div className="space-y-6">
      <Card hoverEffect={false} className="p-6 space-y-5">
        <div className="flex items-center gap-3 border-b border-slate-800/80 pb-4">
          <div className="p-2.5 rounded-xl bg-slate-800/80 text-slate-200 border border-slate-700/60 shrink-0">
            <GithubIcon className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-slate-100">
              {t("install.githubTabTitle")}
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {t("install.githubModalDesc")}
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex gap-3">
            <Input
              icon={<GithubIcon className="w-4 h-4 text-slate-400" />}
              placeholder="https://github.com/owner/repo/tree/main/skill-id"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !isPrimaryDisabled) {
                  handlePrimaryAction();
                }
              }}
              autoFocus
            />
            {parsed?.isValid && (
              <Button
                variant="secondary"
                disabled={discovering}
                loading={discovering}
                onClick={() => triggerInspect(parsed.owner, parsed.repo, parsed.subpath)}
                icon={<RefreshCw className={`w-4 h-4 ${discovering ? "animate-spin" : ""}`} />}
                title={t("install.rescan")}
              >
                {t("install.scanSkills")}
              </Button>
            )}
            <Button
              variant="primary"
              disabled={isPrimaryDisabled}
              onClick={handlePrimaryAction}
              icon={<Download className="w-4 h-4" />}
            >
              {primaryButtonLabel}
            </Button>
          </div>

          {urlInput.trim() && !parsed?.isValid && (
            <div className="text-xs text-amber-400/90 flex items-center gap-1.5 pt-1">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span>{t("install.invalidGithubUrl")}</span>
            </div>
          )}

          {parsed?.isValid && (
            <div className="relative p-4 rounded-xl overflow-hidden group">
              <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 via-transparent to-cyan-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              <div className="relative p-4 rounded-xl bg-slate-900/95 border border-emerald-500/30 backdrop-blur-xl space-y-2 animate-in fade-in duration-150">
                <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400">
                  <FolderGit2 className="w-4 h-4" />
                  <span>{t("install.parsedPreview")}</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs pt-1">
                  <div>
                    <span className="text-slate-500 block">Owner</span>
                    <span className="text-slate-200 font-mono font-medium truncate block">
                      {parsed.owner}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Repository</span>
                    <span className="text-slate-200 font-mono font-medium truncate block">
                      {parsed.repo}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">
                      {parsed.subpath ? t("install.subpath") : "Skill ID"}
                    </span>
                    <span className="text-emerald-300 font-mono font-medium truncate block">
                      {parsed.subpath || parsed.skillId}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Inspecting Loading Indicator */}
          {discovering && (
            <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 flex items-center gap-3 text-slate-300 text-xs animate-pulse">
              <RefreshCw className="w-4 h-4 animate-spin text-emerald-400 shrink-0" />
              <span>{t("install.inspecting")}</span>
            </div>
          )}

          {/* Inspection Error Alert */}
          {discoverError && (
            <Alert
              type="error"
              message={`${t("install.inspectFailed")}: ${discoverError}`}
              onClose={() => setDiscoverError(null)}
            />
          )}

          {/* No Skills Found */}
          {!discovering && discoveredSkills && discoveredSkills.length === 0 && (
            <div className="p-4 rounded-xl bg-slate-900/80 border border-amber-500/30 text-amber-300 text-xs flex items-center gap-2.5">
              <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
              <span>{t("install.noSkillsFound")}</span>
            </div>
          )}

          {/* Multiple Discovered Skills: Batch Selector */}
          {!discovering && discoveredSkills && discoveredSkills.length > 1 && (
            <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 space-y-3 animate-in fade-in duration-150">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-100">
                  <Layers className="w-4 h-4 text-emerald-400" />
                  <span>{t("install.detectedSkills", { count: discoveredSkills.length })}</span>
                  <span className="text-xs text-slate-400 font-normal ml-2">
                    {t("install.selectedCount", {
                      selected: selectedSkillIds.size,
                      total: discoveredSkills.length,
                    })}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={toggleSelectAll}
                  >
                    {allSelected ? t("install.deselectAll") : t("install.selectAll")}
                  </Button>
                  <Button
                    size="sm"
                    variant="primary"
                    disabled={selectedSkillIds.size === 0}
                    onClick={handleBatchInstall}
                    icon={<Download className="w-3.5 h-3.5" />}
                  >
                    {t("install.batchInstall", { count: selectedSkillIds.size })}
                  </Button>
                </div>
              </div>

              <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                {discoveredSkills.map((skill) => {
                  const isSelected = selectedSkillIds.has(skill.skillId);
                  return (
                    <div
                      key={skill.sourcePath}
                      onClick={() => toggleSkill(skill.skillId)}
                      className={`p-3 rounded-lg border transition-all cursor-pointer flex items-start gap-3 ${
                        isSelected
                          ? "bg-slate-800/80 border-emerald-500/40"
                          : "bg-slate-900/50 border-slate-800/80 hover:border-slate-700"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSkill(skill.skillId)}
                        className="mt-0.5 rounded border-slate-700 bg-slate-900 text-emerald-500 focus:ring-emerald-500/20 cursor-pointer"
                        onClick={(e) => e.stopPropagation()}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-slate-100">
                            {skill.name}
                          </span>
                          <span className="text-[11px] font-mono text-slate-500 truncate">
                            {skill.sourcePath}
                          </span>
                        </div>
                        {skill.description && (
                          <p className="text-xs text-slate-400 mt-1 line-clamp-2">
                            {skill.description}
                          </p>
                        )}
                      </div>
                      <div className="shrink-0 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                        {skill.installed ? (
                          <Badge variant="success">
                            <CheckCircle2 className="w-3 h-3" />
                            <span>{t("common.installed")}</span>
                          </Badge>
                        ) : (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => handleSingleInstall(skill)}
                            icon={<Download className="w-3.5 h-3.5" />}
                          >
                            {t("common.install")}
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Single Discovered Skill Display */}
          {!discovering && discoveredSkills && discoveredSkills.length === 1 && (
            <div className="p-4 rounded-xl bg-slate-900/90 border border-emerald-500/30 space-y-2 animate-in fade-in duration-150">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <FolderCheck className="w-4 h-4 text-emerald-400" />
                    <span className="text-sm font-semibold text-slate-100">
                      {discoveredSkills[0].name}
                    </span>
                    <span className="text-xs font-mono text-slate-500">
                      {discoveredSkills[0].sourcePath}
                    </span>
                  </div>
                  {discoveredSkills[0].description && (
                    <p className="text-xs text-slate-400">
                      {discoveredSkills[0].description}
                    </p>
                  )}
                </div>
                {discoveredSkills[0].installed ? (
                  <Badge variant="success">
                    <CheckCircle2 className="w-3 h-3" />
                    <span>{t("common.installed")}</span>
                  </Badge>
                ) : (
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => handleSingleInstall(discoveredSkills[0])}
                    icon={<Download className="w-3.5 h-3.5" />}
                  >
                    {t("common.install")}
                  </Button>
                )}
              </div>
            </div>
          )}

        </div>
      </Card>
    </div>
  );
}

