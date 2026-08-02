import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  Search,
  Download,
  TrendingUp,
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Copy,
  Clock3,
  RotateCcw,
} from "lucide-react";
import type { RegistrySkill, Skill, SkillInstallTask } from "../../types";
import Button from "../ui/Button";
import Badge from "../ui/Badge";
import Input from "../ui/Input";
import Card from "../ui/Card";
import EmptyState from "../ui/EmptyState";
import Alert from "../ui/Alert";
import VirtualizedList from "../ui/VirtualizedList";
import GithubIcon from "../icons/GithubIcon";
import SkillsShIcon from "../icons/SkillsShIcon";
import HoverActionGroup from "../ui/HoverActionGroup";
import { parseGitHubInput } from "../../utils/url";
import { reportFrontendError } from "../../logging";

interface RecommendedSkill {
  id: string;
  name: string;
  source: string;
  description?: string;
  descriptionEnglish?: string;
  installs?: number;
  category?: string;
}

function formatInstalls(count: number): string {
  if (!count || count < 0) return "0";
  if (count < 1000) return count.toLocaleString();
  if (count < 10000) {
    const k = count / 1000;
    const formatted = k % 1 === 0 ? k.toString() : k.toFixed(1);
    return `${formatted}k`;
  }
  const k = Math.round(count / 1000);
  return `${k.toLocaleString()}k`;
}

/**
 * 格式化为 JSON 字符串的 skill 信息
 */
function formatSkillDetails(skill: RegistrySkill): string {
  return JSON.stringify({
    id: skill.id,
    name: skill.name,
    source: skill.source,
    installs: skill.installs,
    supported: skill.supported,
    installed: skill.installed,
    full_info_retrieved_from: "skills.sh API",
    retrieved_at: new Date().toISOString(),
  }, null, 2);
}

/**
 * 根据当前语言环境获取技能描述
 * - zh, zh-CN, zh-TW 等使用中文描述
 * - 其他语言使用英文描述
 */
function getSkillDescription(skill: RecommendedSkill, currentLang: string): string {
  if (currentLang.startsWith('zh')) {
    return skill.description || skill.descriptionEnglish || '';
  } else {
    // 优先使用英文描述，如果没有则 fallback 到中文
    return skill.descriptionEnglish || skill.description || '';
  }
}

interface ExploreTabProps {
  registryQuery: string;
  setRegistryQuery: (query: string) => void;
  registryResults: RegistrySkill[] | null;
  registryResultsVersion: number;
  registryLoading: boolean;
  installTasks: ReadonlyMap<string, SkillInstallTask>;
  error: string | null;
  onClearError: () => void;
  installedSkillsList: Skill[];
  onSearch: () => void;
  onInstall: (skill: RegistrySkill) => void;
  onGithubFallback: (query: string) => void;
  onCopySkillDetails?: (skill: RegistrySkill) => void; // Optional callback for copying skills details
  debugMode: boolean; // Debug Mode flag
}

interface SkillInstallActionProps {
  skill: RegistrySkill;
  installed: boolean;
  task: SkillInstallTask | undefined;
  onInstall: (skill: RegistrySkill) => void;
}

function SkillInstallAction({ skill, installed, task, onInstall }: SkillInstallActionProps) {
  const { t } = useTranslation();
  if (installed || task?.status === "completed") {
    return (
      <Badge variant="success">
        <CheckCircle2 className="h-3.5 w-3.5" />
        <span>{t("common.installed")}</span>
      </Badge>
    );
  }
  if (!skill.supported) return <Badge variant="neutral">{t("common.unsupported")}</Badge>;

  const pending = task?.status === "queued"
    || task?.status === "installing"
    || task?.status === "cancelling";
  const loading = task?.status === "installing" || task?.status === "cancelling";
  const retryable = task?.status === "failed" || task?.status === "cancelled";
  const label = task?.status === "queued"
    ? t("install.queue.queued")
    : task?.status === "installing"
      ? t("install.queue.installing")
      : task?.status === "cancelling"
        ? t("install.queue.cancelling")
        : retryable
          ? t("install.queue.retryAction")
          : t("common.install");

  return (
    <Button
      size="sm"
      variant="primary"
      disabled={pending}
      loading={loading}
      onClick={() => onInstall(skill)}
      icon={task?.status === "queued"
        ? <Clock3 className="h-3.5 w-3.5" />
        : retryable
          ? <RotateCcw className="h-3.5 w-3.5" />
          : <Download className="h-3.5 w-3.5" />}
    >
      {label}
    </Button>
  );
}

/**
 * 探索标签页 - skills.sh 注册表搜索/安装 + GitHub fallback
 */
export default function ExploreTab({
  registryQuery,
  setRegistryQuery,
  registryResults,
  registryResultsVersion,
  registryLoading,
  installTasks,
  error,
  onClearError,
  installedSkillsList,
  onSearch,
  onInstall,
  onGithubFallback,
  onCopySkillDetails,
  debugMode,
}: ExploreTabProps) {
  const { t, i18n } = useTranslation();
  const [recommendedSkills, setRecommendedSkills] = useState<RecommendedSkill[]>([]);
  const [shouldShowWelcome, setShouldShowWelcome] = useState(true);
  const installedSourceIds = useMemo(
    () => new Set(installedSkillsList.flatMap(
      (skill) => skill.source_url ? [skill.source_url.toLowerCase()] : [],
    )),
    [installedSkillsList],
  );
  useEffect(() => {
    // 加载推荐技能列表
    fetch("/recommended-skills.json")
      .then((res) => res.json())
      .then((allSkills) => {
        // 随机抽取 8 条推荐技能
        const shuffled = [...allSkills].sort(() => Math.random() - 0.5);
        setRecommendedSkills(shuffled.slice(0, 8));
      })
      .catch((error) =>
        reportFrontendError("Failed to load recommended skills", error, "ExploreTab"),
      );
  }, []);

  // 监听搜索框变化，决定是否显示欢迎界面
  useEffect(() => {
    const trimmedQuery = registryQuery.trim().toLowerCase();
    setShouldShowWelcome(trimmedQuery === "");
  }, [registryQuery]);

  return (
    <div className="space-y-6">
      {/* Search Input Bar */}
      <Card hoverEffect={false} className="p-2">
        <div className="flex gap-3">
          <Input
            icon={<Search className="w-4 h-4" />}
            placeholder={t("install.placeholder")}
            value={registryQuery}
            onChange={(e) => setRegistryQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onSearch()}
          />
          <Button
            variant="primary"
            onClick={onSearch}
            loading={registryLoading}
            icon={<Search className="w-4 h-4" />}
            title={t("common.search")}
            aria-label={t("common.search")}
          />
        </div>
      </Card>

      {/* Error Display */}
      {error && <Alert type="error" message={error} onClose={onClearError} />}

      {/* Initial Hint */}
      {shouldShowWelcome && !registryLoading && (
        <div className="space-y-6">
          {/* Two-column layout for recommended and external links */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Recommended Skills - takes 2 columns */}
            <div className="lg:col-span-2 space-y-4">
              <Card hoverEffect={false} className="border-emerald-500/30">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-base font-semibold text-slate-100 flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-amber-400" />
                    {t("explore.recommendedHeader")}
                  </h3>
                </div>

                {recommendedSkills.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {recommendedSkills.map((skill) => {
                      const registrySkill: RegistrySkill = {
                        id: skill.id,
                        name: skill.name,
                        source: skill.source,
                        installs: skill.installs || 0,
                        supported: true,
                        installed: false,
                      };
                      const task = installTasks.get(skill.id.toLowerCase());
                      const installed = installedSourceIds.has(skill.id.toLowerCase());
                      return (
                      <div
                        key={skill.id}
                        className="group glass-card rounded-lg p-3 border border-slate-700 hover:border-emerald-500/40 transition-all duration-200"
                      >
                        <div className="space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <h4 className="text-sm font-medium text-slate-100 truncate">
                                {skill.name}
                              </h4>
                              <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">
                                {getSkillDescription(skill, i18n.language)}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center justify-between pt-2 border-t border-slate-700/50">
                            <span className="text-xs text-slate-500 flex items-center gap-1">
                              <TrendingUp className="w-3 h-3" />
                              {formatInstalls(skill.installs || 0)}
                              <span className="text-slate-600">{t("common.installs")}</span>
                            </span>
                            <div className="flex items-center gap-2">
                              <HoverActionGroup>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => openUrl(`https://skills.sh/${skill.id}`)}
                                  title={t("library.openSkillsSrcPage")}
                                  aria-label={t("library.openSkillsSrcPage")}
                                  icon={<SkillsShIcon />}
                                />
                              </HoverActionGroup>
                              <SkillInstallAction
                                skill={registrySkill}
                                installed={installed}
                                task={task}
                                onInstall={onInstall}
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-slate-400">加载中...</p>
                )}
              </Card>
            </div>

            {/* External Links & Info - takes 1 column */}
            <div className="space-y-4">
              {/* Visit skills.sh Card */}
              <a
                href="https://skills.sh/"
                target="_blank"
                rel="noopener noreferrer"
                className="block glass-card rounded-xl p-5 border border-emerald-500/30 hover:border-emerald-500/60 transition-all duration-200 group"
              >
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-emerald-300">
                    <ExternalLink className="w-5 h-5 text-emerald-400" />
                    <span className="font-semibold text-sm">Skills.sh</span>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    {t("explore.externalSiteDesc")}
                  </p>
                  <div className="pt-3 border-t border-slate-700 flex items-center justify-between">
                    <span className="text-[11px] text-slate-500">
                      {t("explore.externalSiteSource")}
                    </span>
                    <ExternalLink className="w-3.5 h-3.5 text-slate-400 group-hover:text-emerald-400 transition-colors" />
                  </div>
                </div>
              </a>

              {/* Tips Card */}
              <Card hoverEffect={false} className="p-4 bg-emerald-500/5 border-emerald-500/20">
                <h4 className="text-sm font-semibold text-slate-100 mb-2">
                  {t("explore.tipsTitle")}
                </h4>
                <ul className="space-y-1.5 text-xs text-slate-400">
                  <li className="flex items-start gap-2">
                    <span className="text-emerald-400 mt-0.5">•</span>
                    <span>{t("explore.tipInstall")}</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-emerald-400 mt-0.5">•</span>
                    <span>{t("explore.tipSearch")}</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-emerald-400 mt-0.5">•</span>
                    <span>{t("explore.tipGitHub")}</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-emerald-400 mt-0.5">•</span>
                    <span>{t("explore.tipCopyDetails")}</span>
                  </li>
                </ul>
              </Card>
            </div>
          </div>
        </div>
      )}

      {/* No Results */}
      {registryResults !== null && registryResults.length === 0 && !registryLoading && (
        (() => {
          const ghParsed = parseGitHubInput(registryQuery);
          if (ghParsed && ghParsed.isValid) {
            return (
              <div className="glass-card rounded-xl p-5 border border-emerald-500/30 bg-emerald-500/5 space-y-4 animate-in fade-in duration-200">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-emerald-300 font-semibold text-sm">
                      <GithubIcon className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>{t("install.githubFallbackTitle")}</span>
                    </div>
                    <p className="text-xs text-slate-400">
                      {t("install.githubFallbackDesc", { source: ghParsed.source })}
                    </p>
                  </div>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => onGithubFallback(registryQuery)}
                    icon={<Download className="w-4 h-4" />}
                  >
                    {t("install.githubInstallAction")}
                  </Button>
                </div>
              </div>
            );
          }
          return (
            <EmptyState
              icon={<AlertCircle className="w-8 h-8 text-amber-400" />}
              title={t("install.noResults")}
              description={t("install.noResultsDesc")}
            />
          );
        })()
      )}

      {/* Results List */}
      {registryResults !== null && registryResults.length > 0 && (
        <VirtualizedList
          items={registryResults}
          getItemKey={(skill) => skill.id}
          ariaLabel={t("install.exploreTab")}
          resetKey={registryResultsVersion}
          className="grid grid-cols-1 gap-3"
          renderItem={(s) => {
            const task = installTasks.get(s.id.toLowerCase());
            const installed = s.installed || installedSourceIds.has(s.id.toLowerCase());
            return (
              <div className="group glass-card rounded-xl p-4 border border-slate-800/80 hover:border-emerald-500/40 transition-all duration-200">
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-slate-100 truncate">
                        {s.name}
                      </h3>
                      <span className="text-xs text-slate-500 font-mono">({s.id})</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-slate-400">
                      <span className="font-mono text-emerald-400/90">{s.source}</span>
                      <span>•</span>
                      <span className="flex items-center gap-1.5 text-slate-400 font-medium">
                        <TrendingUp className="w-4 h-4 text-emerald-400" />
                        <span className="text-slate-200">{formatInstalls(s.installs)}</span>
                        <span className="text-slate-500 text-[11px]">{t("common.installs")}</span>
                      </span>
                    </div>
                  </div>

                  <div className="shrink-0 flex items-center gap-2">
                    <HoverActionGroup>
                      {debugMode && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            const details = formatSkillDetails(s);
                            navigator.clipboard.writeText(details).then(() => {
                              onCopySkillDetails?.(s);
                            }).catch((error) =>
                              reportFrontendError(
                                "Failed to copy registry skill details",
                                error,
                                "ExploreTab",
                              ),
                            );
                          }}
                          icon={<Copy className="w-3.5 h-3.5" />}
                          title={t("explore.copyDetails")}
                        >
                          <span className="hidden sm:inline">{t("explore.copyDetails")}</span>
                        </Button>
                      )}

                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openUrl(`https://skills.sh/${s.id}`)}
                        title={t("library.openSkillsSrcPage")}
                        aria-label={t("library.openSkillsSrcPage")}
                        icon={<SkillsShIcon />}
                      />
                    </HoverActionGroup>
                    <SkillInstallAction
                      skill={s}
                      installed={installed}
                      task={task}
                      onInstall={onInstall}
                    />
                  </div>
                </div>
              </div>
            );
          }}
        />
      )}
    </div>
  );
}
