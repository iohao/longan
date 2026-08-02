import { useCallback, useMemo, useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { open } from "@tauri-apps/plugin-dialog";
import { Store, Sparkles, HardDrive } from "lucide-react";
import { api, errorMessage, listenForSkillsChanged } from "../api";
import type { LocalSkillPreview, RegistrySkill, Skill } from "../types";
import GithubIcon from "../components/icons/GithubIcon";
import TabNavigation from "../components/skill-market/TabNavigation";
import ExploreTab from "../components/skill-market/ExploreTab";
import GitHubTab from "../components/skill-market/GitHubTab";
import LocalImportTab from "../components/skill-market/LocalImportTab";
import { parseSkillUrl, parseGitHubInput } from "../utils/url";
import { reportFrontendError } from "../logging";
import { useSkillInstallQueue } from "../context/SkillInstallContext";

type MarketTabKey = "explore" | "github" | "local";

/**
 * 技能市场页面 - 专注于技能发现、探索和导入
 */
interface SkillMarketPageProps {
  debugMode: boolean;
}

function sortRegistryResults(results: RegistrySkill[], preferredSource?: string): RegistrySkill[] {
  const normalizedPreferredSource = preferredSource?.toLowerCase();

  return [...results].sort((a, b) => {
    if (normalizedPreferredSource) {
      const aPreferred = a.source.toLowerCase() === normalizedPreferredSource;
      const bPreferred = b.source.toLowerCase() === normalizedPreferredSource;
      if (aPreferred !== bPreferred) return aPreferred ? -1 : 1;
    }

    return b.installs - a.installs;
  });
}

export default function SkillMarketPage({ debugMode }: SkillMarketPageProps) {
  const { t } = useTranslation();
  const { tasks: installTasks, enqueue: enqueueInstall } = useSkillInstallQueue();
  const [activeTab, setActiveTab] = useState<MarketTabKey>("explore");

  // Explore registry state
  const [registryQuery, setRegistryQuery] = useState("");
  const [registryResults, setRegistryResults] = useState<RegistrySkill[] | null>(null);
  const [registryResultsVersion, setRegistryResultsVersion] = useState(0);
  const [registryLoading, setRegistryLoading] = useState(false);
  const [registryError, setRegistryError] = useState<string | null>(null);
  const [copyToast, setCopyToast] = useState<string | null>(null);
  const [installedSkillsList, setInstalledSkillsList] = useState<Skill[]>([]);

  // GitHub Tab state
  const [githubUrlInput, setGithubUrlInput] = useState("");
  const reloadInstalledSkills = useCallback(() => {
    return api.listSkills()
      .then(setInstalledSkillsList)
      .catch((error) => reportFrontendError("Failed to load installed skills", error, "SkillMarketPage"));
  }, []);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;

    void listenForSkillsChanged(() => {
      if (!disposed) void reloadInstalledSkills();
    })
      .then((stopListening) => {
        if (disposed) stopListening();
        else {
          unlisten = stopListening;
          void reloadInstalledSkills();
        }
      })
      .catch((error) => {
        reportFrontendError(
          "Failed to listen for installed skill changes",
          error,
          "SkillMarketPage",
        );
        if (!disposed) void reloadInstalledSkills();
      });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [reloadInstalledSkills]);

  // Auto-hide copy toast after 2 seconds
  useEffect(() => {
    if (copyToast) {
      const timer = setTimeout(() => setCopyToast(null), 2000);
      return () => clearTimeout(timer);
    }
  }, [copyToast]);

  async function searchRegistry() {
    const rawQuery = registryQuery.trim();
    if (!rawQuery) return;
    setRegistryLoading(true);
    setRegistryError(null);

    const parsed = parseSkillUrl(rawQuery);
    const preferredSource = parsed.owner && parsed.repo && !parsed.skillId
      ? `${parsed.owner}/${parsed.repo}`
      : undefined;

    try {
      let results = await api.searchRegistry(parsed.cleanQuery);

      if (
        (!results || results.length === 0) &&
        parsed.skillId &&
        parsed.skillId.toLowerCase() !== parsed.cleanQuery.toLowerCase()
      ) {
        results = await api.searchRegistry(parsed.skillId);
      }

      // If the input is a URL with a specific skill path (e.g., skills.sh/owner/repo/skill),
      // filter to show only that exact skill
      if (results && results.length > 0 && parsed.targetId) {
        const targetIdLower = parsed.targetId.toLowerCase();
        // Check if this is a full path match (contains 3+ parts like owner/repo/skill)
        if (parsed.isUrl && targetIdLower.includes('/')) {
          const pathParts = targetIdLower.split('/');
          if (pathParts.length >= 3) {
            // Filter to show only the exact matched skill
            results = results.filter(s => s.id.toLowerCase() === targetIdLower);
          }
        } else {
          // Original logic for partial matches - move matching skills to front
          results = [...results].sort((a, b) => {
            const aMatch = a.id.toLowerCase() === targetIdLower;
            const bMatch = b.id.toLowerCase() === targetIdLower;
            if (aMatch && !bMatch) return -1;
            if (!aMatch && bMatch) return 1;
            return 0;
          });
        }
      }

      // Repository queries prioritize exact source matches, then sort each group by installs.
      if (results && results.length > 0) {
        results = sortRegistryResults(results, preferredSource);
      }

      setRegistryResults(results);
      setRegistryResultsVersion((version) => version + 1);
    } catch (e) {
      setRegistryError(errorMessage(e));
    } finally {
      setRegistryLoading(false);
    }
  }

  function installSkill(s: RegistrySkill) {
    // Check if skill is already installed by comparing source_url
    const alreadyInstalled = installedSkillsList.find(
      (installed) => installed.source_url === s.id
    );
    
    if (alreadyInstalled) {
      // Skill already installed - just mark it as installed in registry results
      // and let the UI update naturally
      setRegistryResults((prev) =>
        prev ? prev.map((r) => (r.id === s.id ? { ...r, installed: true } : r)) : prev
      );
      return;
    }
    
    const [owner, repoName] = s.source.split("/");
    
    // Determine the correct skill directory name
    // If id has 3+ parts like "owner/repo/skill_name", use the last part as skill_id
    // If only 2 parts like "owner/repo", we'll let find_skill_dir() auto-detect by using the full ID
    const skillIdParts = s.id.split('/');
    let skillId: string;
    
    if (skillIdParts.length >= 3) {
      // Extract from full ID like "apache/kafka/topic"
      skillId = skillIdParts[skillIdParts.length - 1];
    } else {
      // Only owner/repo, no specific subdirectory in the id
      // Use a generic name that will trigger find_skill_dir to search for any SKILL.md
      skillId = 'any'; // Special marker to indicate "find any SKILL.md dir"
    }
    
    enqueueInstall({
      installKey: `${owner}/${repoName}/${skillId}`.toLowerCase(),
      sourceId: s.id,
      name: s.name,
      owner,
      repoName,
      skillId,
      origin: "explore",
      sourceUrl: s.id,
      githubSource: s.source,
    });
  }

  function installFromGithubDirectly() {
    const parsed = parseGitHubInput(githubUrlInput);
    if (!parsed || !parsed.isValid) return;
    enqueueInstall({
      installKey: `${parsed.owner}/${parsed.repo}/${parsed.skillId}`.toLowerCase(),
      sourceId: `${parsed.owner}/${parsed.repo}/${parsed.skillId}`,
      name: parsed.skillId,
      owner: parsed.owner,
      repoName: parsed.repo,
      skillId: parsed.skillId,
      origin: "github",
    });
    setGithubUrlInput("");
  }

  async function pickLocalFolder() {
    const picked = await open({ directory: true, multiple: false });
    if (typeof picked !== "string") return;
    setLocalPath(picked);
    setLocalPreview(null);
    setLocalSuccess(null);
    try {
      setLocalPreview(await api.previewLocalSkill(picked));
    } catch (e) {
      setLocalError(errorMessage(e));
    }
  }

  async function importLocal() {
    if (!localPath || !localPreview || localPreview.conflict) return;
    setLocalImporting(true);
    setLocalError(null);
    setLocalSuccess(null);
    try {
      await api.importLocalSkill(localPath);
      setLocalSuccess(t("install.localImportSuccess", { name: localPreview.name }));
      setLocalPath(null);
      setLocalPreview(null);
      setLocalError(null);
    } catch (e) {
      setLocalError(errorMessage(e));
    } finally {
      setLocalImporting(false);
    }
  }

  const tabs = useMemo(
    () => [
      { key: "explore", icon: Sparkles, count: null, label: t("install.exploreTab"), highlight: true },
      { key: "github", icon: GithubIcon, count: null, label: t("install.githubButton"), highlight: false },
      { key: "local", icon: HardDrive, count: null, label: t("install.localButton"), highlight: false },
    ],
    [t]
  );

  const installTasksBySourceId = useMemo(
    () => new Map(installTasks.map((task) => [task.sourceId.toLowerCase(), task])),
    [installTasks],
  );

  // Local import state
  const [localPath, setLocalPath] = useState<string | null>(null);
  const [localPreview, setLocalPreview] = useState<LocalSkillPreview | null>(null);
  const [localImporting, setLocalImporting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [localSuccess, setLocalSuccess] = useState<string | null>(null);

  return (
    <div className="max-w-7xl space-y-8">
      {/* Top Banner Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-emerald-400 text-xs font-semibold uppercase tracking-wider mb-1">
            <Store className="w-3.5 h-3.5" />
            <span>Longan Hub</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-100 tracking-tight">
            {t("nav.market")}
          </h1>
        </div>

        <TabNavigation
          activeTab={activeTab}
          onChange={(tab) => setActiveTab(tab as MarketTabKey)}
          tabs={tabs}
        />
      </div>



      {activeTab === "explore" && (
        <ExploreTab
          registryQuery={registryQuery}
          setRegistryQuery={setRegistryQuery}
          registryResults={registryResults}
          registryResultsVersion={registryResultsVersion}
          registryLoading={registryLoading}
          installTasks={installTasksBySourceId}
          error={registryError}
          onClearError={() => setRegistryError(null)}
          installedSkillsList={installedSkillsList}
          onSearch={searchRegistry}
          onInstall={installSkill}
          onGithubFallback={(query) => {
            setGithubUrlInput(query);
            setActiveTab("github");
          }}
          onCopySkillDetails={(skill) => {
            setCopyToast(`${skill.name} - ${t("explore.copyDetails")}`);
          }}
          debugMode={debugMode}
        />
      )}

      {activeTab === "github" && (
        <GitHubTab
          urlInput={githubUrlInput}
          setUrlInput={setGithubUrlInput}
          onInstall={installFromGithubDirectly}
        />
      )}

      {activeTab === "local" && (
        <LocalImportTab
          localPath={localPath}
          localPreview={localPreview}
          importing={localImporting}
          error={localError}
          success={localSuccess}
          onClearError={() => setLocalError(null)}
          onClearSuccess={() => setLocalSuccess(null)}
          onPickFolder={pickLocalFolder}
          onImport={importLocal}
        />
      )}

      {/* Copy success Toast */}
      {copyToast && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-sm flex items-center gap-2 animate-in fade-in duration-200">
          <span className="text-emerald-400">✓</span>
          <span>{copyToast}</span>
        </div>
      )}
    </div>
  );
}
