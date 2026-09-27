<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from "vue";
import { useI18n } from "vue-i18n";
import { open } from "@tauri-apps/plugin-dialog";
import { Store, Sparkles, HardDrive } from "lucide-vue-next";
import { api, errorMessage, listenForSkillsChanged } from "@/api";
import type { DiscoveredSkill, LocalSkillPreview, RegistrySkill, Skill } from "@/types";
import GithubIcon from "@/components/icons/GithubIcon.vue";
import TabNavigation, { type TabItem } from "@/components/skill-market/TabNavigation.vue";
import ExploreTab from "@/components/skill-market/ExploreTab.vue";
import GitHubTab from "@/components/skill-market/GitHubTab.vue";
import LocalImportTab from "@/components/skill-market/LocalImportTab.vue";
import { parseSkillUrl, parseGitHubInput } from "@/utils/url";
import { reportFrontendError } from "@/logging";
import { useSkillInstallStore } from "@/stores/skillInstall";
import { useDebugModeStore } from "@/stores/debugMode";

type MarketTabKey = "explore" | "github" | "local";

const { t } = useI18n();
const skillInstallStore = useSkillInstallStore();
const debugStore = useDebugModeStore();

const activeTab = ref<MarketTabKey>("explore");

// Explore registry state
const registryQuery = ref("");
const registryResults = ref<RegistrySkill[] | null>(null);
const registryResultsVersion = ref(0);
const registryLoading = ref(false);
const registryError = ref<string | null>(null);
const copyToast = ref<string | null>(null);
const installedSkillsList = ref<Skill[]>([]);

// GitHub Tab state
const githubUrlInput = ref("");

// Local import state
const localPath = ref<string | null>(null);
const localPreview = ref<LocalSkillPreview | null>(null);
const localImporting = ref(false);
const localError = ref<string | null>(null);
const localSuccess = ref<string | null>(null);

let toastTimer: ReturnType<typeof setTimeout> | undefined;

function setCopyToastWithTimer(msg: string) {
  clearTimeout(toastTimer);
  copyToast.value = msg;
  toastTimer = setTimeout(() => {
    copyToast.value = null;
  }, 2000);
}

function sortRegistryResults(
  results: RegistrySkill[],
  preferredSource?: string,
): RegistrySkill[] {
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

async function reloadInstalledSkills() {
  try {
    const skills = await api.listSkills();
    installedSkillsList.value = skills;
  } catch (error) {
    reportFrontendError("Failed to load installed skills", error, "SkillMarketPage");
  }
}

let cleanupSkillsListener: (() => void) | undefined;

onMounted(async () => {
  await reloadInstalledSkills();

  try {
    cleanupSkillsListener = await listenForSkillsChanged(() => {
      void reloadInstalledSkills();
    });
  } catch (error) {
    reportFrontendError("Failed to listen for installed skill changes", error, "SkillMarketPage");
  }
});

onUnmounted(() => {
  cleanupSkillsListener?.();
  clearTimeout(toastTimer);
});

async function searchRegistry() {
  const rawQuery = registryQuery.value.trim();
  if (!rawQuery) return;
  registryLoading.value = true;
  registryError.value = null;

  const parsed = parseSkillUrl(rawQuery);
  const preferredSource =
    parsed.owner && parsed.repo && !parsed.skillId ? `${parsed.owner}/${parsed.repo}` : undefined;

  try {
    let results = await api.searchRegistry(parsed.cleanQuery);

    if (
      (!results || results.length === 0) &&
      parsed.skillId &&
      parsed.skillId.toLowerCase() !== parsed.cleanQuery.toLowerCase()
    ) {
      results = await api.searchRegistry(parsed.skillId);
    }

    if (results && results.length > 0 && parsed.targetId) {
      const targetIdLower = parsed.targetId.toLowerCase();
      if (parsed.isUrl && targetIdLower.includes("/")) {
        const pathParts = targetIdLower.split("/");
        if (pathParts.length >= 3) {
          results = results.filter((s) => s.id.toLowerCase() === targetIdLower);
        }
      } else {
        results = [...results].sort((a, b) => {
          const aMatch = a.id.toLowerCase() === targetIdLower;
          const bMatch = b.id.toLowerCase() === targetIdLower;
          if (aMatch && !bMatch) return -1;
          if (!aMatch && bMatch) return 1;
          return 0;
        });
      }
    }

    if (results && results.length > 0) {
      results = sortRegistryResults(results, preferredSource);
    }

    registryResults.value = results;
    registryResultsVersion.value += 1;
  } catch (e) {
    registryError.value = errorMessage(e);
  } finally {
    registryLoading.value = false;
  }
}

function installSkill(s: RegistrySkill) {
  const alreadyInstalled = installedSkillsList.value.find(
    (installed) => installed.source_url === s.id,
  );

  if (alreadyInstalled) {
    if (registryResults.value) {
      registryResults.value = registryResults.value.map((r) =>
        r.id === s.id ? { ...r, installed: true } : r,
      );
    }
    return;
  }

  const [owner, repoName] = s.source.split("/");
  const skillIdParts = s.id.split("/");
  let skillId: string;

  if (skillIdParts.length >= 3) {
    skillId = skillIdParts[skillIdParts.length - 1];
  } else {
    skillId = "any";
  }

  skillInstallStore.enqueue({
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
  const parsed = parseGitHubInput(githubUrlInput.value);
  if (!parsed || !parsed.isValid) return;

  skillInstallStore.enqueue({
    installKey: `${parsed.owner}/${parsed.repo}/${parsed.skillId}`.toLowerCase(),
    sourceId: `${parsed.owner}/${parsed.repo}/${parsed.skillId}`,
    name: parsed.skillId,
    owner: parsed.owner,
    repoName: parsed.repo,
    skillId: parsed.skillId,
    origin: "github",
    sourcePath: parsed.subpath,
  });
  githubUrlInput.value = "";
}

function installBatchFromGithub(skills: DiscoveredSkill[], owner: string, repo: string) {
  for (const skill of skills) {
    skillInstallStore.enqueue({
      installKey: `${owner}/${repo}/${skill.skillId}`.toLowerCase(),
      sourceId: `${owner}/${repo}/${skill.skillId}`,
      name: skill.name,
      owner,
      repoName: repo,
      skillId: skill.skillId,
      origin: "github",
      sourcePath: skill.sourcePath,
      githubSource: `${owner}/${repo}`,
    });
  }
}

async function pickLocalFolder() {
  const picked = await open({ directory: true, multiple: false });
  if (typeof picked !== "string") return;
  localPath.value = picked;
  localPreview.value = null;
  localSuccess.value = null;
  try {
    localPreview.value = await api.previewLocalSkill(picked);
  } catch (e) {
    localError.value = errorMessage(e);
  }
}

async function importLocal() {
  if (!localPath.value || !localPreview.value || localPreview.value.conflict) return;
  localImporting.value = true;
  localError.value = null;
  localSuccess.value = null;
  try {
    await api.importLocalSkill(localPath.value);
    localSuccess.value = t("install.localImportSuccess", { name: localPreview.value.name });
    localPath.value = null;
    localPreview.value = null;
    localError.value = null;
  } catch (e) {
    localError.value = errorMessage(e);
  } finally {
    localImporting.value = false;
  }
}

const tabs = computed<TabItem[]>(() => [
  { key: "explore", icon: Sparkles, count: null, label: t("install.exploreTab"), highlight: true },
  { key: "github", icon: GithubIcon, count: null, label: t("install.githubButton"), highlight: false },
  { key: "local", icon: HardDrive, count: null, label: t("install.localButton"), highlight: false },
]);

const installTasksBySourceId = computed(
  () =>
    new Map(
      skillInstallStore.tasks.map((task) => [task.sourceId.toLowerCase(), task]),
    ),
);
</script>

<template>
  <div class="max-w-7xl space-y-8">
    <!-- Top Banner Header -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <div class="flex items-center gap-2 text-emerald-400 text-xs font-semibold uppercase tracking-wider mb-1">
          <Store class="w-3.5 h-3.5" />
          <span>Longan Hub</span>
        </div>
        <h1 class="text-2xl font-bold text-slate-100 tracking-tight">
          {{ t("nav.market") }}
        </h1>
      </div>

      <TabNavigation
        :active-tab="activeTab"
        :tabs="tabs"
        @change="(tab) => (activeTab = tab as MarketTabKey)"
      />
    </div>

    <!-- Active Tab Panel -->
    <ExploreTab
      v-if="activeTab === 'explore'"
      :registry-query="registryQuery"
      :registry-results="registryResults"
      :registry-results-version="registryResultsVersion"
      :registry-loading="registryLoading"
      :install-tasks="installTasksBySourceId"
      :error="registryError"
      :installed-skills-list="installedSkillsList"
      :debug-mode="debugStore.debugMode"
      @update:registry-query="(val) => (registryQuery = val)"
      @clear-error="registryError = null"
      @search="searchRegistry"
      @install="installSkill"
      @github-fallback="
        (query) => {
          githubUrlInput = query;
          activeTab = 'github';
        }
      "
      @copy-skill-details="
        (skill) => {
          setCopyToastWithTimer(`${skill.name} - ${t('explore.copyDetails')}`);
        }
      "
    />

    <GitHubTab
      v-else-if="activeTab === 'github'"
      :url-input="githubUrlInput"
      @update:url-input="(val) => (githubUrlInput = val)"
      @install="installFromGithubDirectly"
      @batch-install="installBatchFromGithub"
    />

    <LocalImportTab
      v-else-if="activeTab === 'local'"
      :local-path="localPath"
      :local-preview="localPreview"
      :importing="localImporting"
      :error="localError"
      :success="localSuccess"
      @clear-error="localError = null"
      @clear-success="localSuccess = null"
      @pick-folder="pickLocalFolder"
      @import="importLocal"
    />

    <!-- Copy success Toast -->
    <div
      v-if="copyToast"
      class="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-sm flex items-center gap-2 animate-in fade-in duration-200"
    >
      <span class="text-emerald-400">✓</span>
      <span>{{ copyToast }}</span>
    </div>
  </div>
</template>
