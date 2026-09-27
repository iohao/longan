<script setup lang="ts">
import { ref, computed, onMounted, type Component } from "vue";
import { useI18n } from "vue-i18n";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  Settings,
  Languages,
  Key,
  FolderOpen,
  Stethoscope,
  Code2,
  Check,
  Eye,
  EyeOff,
  AlertTriangle,
  CheckCircle2,
  Palette,
  Sun,
  Moon,
  Monitor,
  Loader2,
  XCircle,
  Info,
  GitFork,
  Share2,
  ExternalLink,
} from "lucide-vue-next";
import { api, errorMessage } from "@/api";
import type { BrokenLink, StorageInfo } from "@/types";
import Button from "@/components/ui/Button.vue";
import Input from "@/components/ui/Input.vue";
import Card from "@/components/ui/Card.vue";
import Badge from "@/components/ui/Badge.vue";
import AnchoredSectionTabs, {
  type AnchoredSection,
} from "@/components/ui/AnchoredSectionTabs.vue";
import {
  type ThemeMode,
  getStoredTheme,
  applyTheme,
} from "@/utils/theme";
import { useDebugModeStore } from "@/stores/debugMode";
import { useAppUpdateStore } from "@/stores/appUpdate";

const GITHUB_REPOSITORY_URL = "https://github.com/iohao/longan";

const { t, locale } = useI18n();
const debugStore = useDebugModeStore();
const appUpdateStore = useAppUpdateStore();

const token = ref("");
const showPassword = ref(false);
const tokenSaved = ref(false);
const tokenValidating = ref(false);
const tokenValid = ref<boolean | null>(null);
const validationError = ref<string | null>(null);
const broken = ref<BrokenLink[] | null>(null);
const fixedCount = ref<number | null>(null);
const error = ref<string | null>(null);
const notice = ref<string | null>(null);
const theme = ref<ThemeMode>(getStoredTheme());
const customStoragePath = ref("");
const storageInfo = ref<StorageInfo | null>(null);
const isSettingStorageDir = ref(false);
const repositoryCopied = ref(false);

const latestVersion = computed(
  () => appUpdateStore.availableUpdate?.version ?? appUpdateStore.currentVersion ?? "-",
);

const latestVersionPublishedAt = computed(() => {
  if (!appUpdateStore.availableUpdate?.date) return "-";
  try {
    return new Intl.DateTimeFormat(locale.value).format(
      new Date(appUpdateStore.availableUpdate.date),
    );
  } catch {
    return "-";
  }
});

async function shareRepository() {
  try {
    await navigator.clipboard.writeText(
      t("settings.repositoryShareMessage", { url: GITHUB_REPOSITORY_URL }),
    );
    repositoryCopied.value = true;
    setTimeout(() => {
      repositoryCopied.value = false;
    }, 2000);
  } catch {
    error.value = t("settings.repositoryCopyFailed");
    setTimeout(() => {
      error.value = null;
    }, 3000);
  }
}

async function applyStoragePath() {
  error.value = null;
  try {
    isSettingStorageDir.value = true;
    const info = await api.setStorageDir(customStoragePath.value);
    storageInfo.value = info;
    notice.value = t("settings.storageRestartNotice");
    setTimeout(() => {
      notice.value = null;
    }, 3000);
  } catch (e) {
    error.value = errorMessage(e);
  } finally {
    isSettingStorageDir.value = false;
  }
}

async function resetToDefault() {
  if (!confirm(t("settings.confirmResetStorage"))) {
    return;
  }

  error.value = null;
  try {
    isSettingStorageDir.value = true;
    const info = await api.setStorageDir("");
    storageInfo.value = info;
    customStoragePath.value = "";
    notice.value = t("settings.storageRestartNotice");
    setTimeout(() => {
      notice.value = null;
    }, 3000);
  } catch (e) {
    error.value = errorMessage(e);
  } finally {
    isSettingStorageDir.value = false;
  }
}

async function browseStoragePath() {
  error.value = null;
  try {
    const path = await api.selectDirectory();
    if (path) {
      customStoragePath.value = path;
    }
  } catch (e) {
    error.value = errorMessage(e);
  }
}

onMounted(() => {
  api
    .getStorageDir()
    .then((info) => {
      storageInfo.value = info;
      customStoragePath.value = info.isDefault ? "" : info.configuredDir;
    })
    .catch(() => {});

  api
    .getSetting("github_token")
    .then((v) => {
      token.value = v ?? "";
    })
    .catch(() => {});

  api
    .getSetting("theme")
    .then((v) => {
      if (v === "dark" || v === "light" || v === "system") {
        theme.value = v;
        applyTheme(v);
      }
    })
    .catch(() => {});
});

async function changeLanguage(lang: string) {
  error.value = null;
  try {
    locale.value = lang;
    localStorage.setItem("app_language", lang);
    await api.setSetting("language", lang);
  } catch (e) {
    error.value = errorMessage(e);
  }
}

async function changeTheme(nextTheme: ThemeMode) {
  error.value = null;
  theme.value = nextTheme;
  applyTheme(nextTheme);
  try {
    await api.setSetting("theme", nextTheme);
  } catch (e) {
    error.value = errorMessage(e);
  }
}

async function saveToken() {
  const normalizedToken = token.value.trim();

  error.value = null;
  validationError.value = null;
  tokenValid.value = null;

  if (!normalizedToken) {
    try {
      await api.setSetting("github_token", "");
      tokenSaved.value = true;
      setTimeout(() => {
        tokenSaved.value = false;
      }, 2000);
    } catch (e) {
      error.value = errorMessage(e);
    }
    return;
  }

  tokenValidating.value = true;
  try {
    try {
      const result = await api.verifyGithubToken(normalizedToken);
      tokenValid.value = result;
      if (!result) {
        validationError.value = t("settings.tokenInvalid");
        return;
      }
    } catch (e) {
      validationError.value = errorMessage(e);
      tokenValid.value = false;
      return;
    }

    try {
      await api.setSetting("github_token", normalizedToken);
      tokenSaved.value = true;
      setTimeout(() => {
        tokenSaved.value = false;
      }, 2000);
    } catch (e) {
      error.value = errorMessage(e);
    }
  } finally {
    tokenValidating.value = false;
  }
}

async function scan() {
  error.value = null;
  fixedCount.value = null;
  try {
    broken.value = await api.doctorScan();
  } catch (e) {
    error.value = errorMessage(e);
  }
}

async function fix() {
  error.value = null;
  try {
    fixedCount.value = await api.doctorFix();
    broken.value = await api.doctorScan();
  } catch (e) {
    error.value = errorMessage(e);
  }
}

const sections = computed<AnchoredSection[]>(() => [
  {
    id: "language",
    label: t("settings.language"),
    icon: Languages as Component,
  },
  {
    id: "theme",
    label: t("settings.theme"),
    icon: Palette as Component,
  },
  {
    id: "githubToken",
    label: t("settings.githubToken"),
    icon: Key as Component,
  },
  {
    id: "storage",
    label: t("settings.storageTitle"),
    icon: FolderOpen as Component,
  },
  {
    id: "developer",
    label: t("settings.developer"),
    icon: Code2 as Component,
  },
  {
    id: "about",
    label: t("settings.aboutTitle"),
    icon: Info as Component,
  },
]);
</script>

<template>
  <div class="max-w-4xl space-y-6">
    <!-- Header -->
    <div>
      <div class="flex items-center gap-2 text-emerald-400 text-xs font-semibold uppercase tracking-wider mb-1">
        <Settings class="w-3.5 h-3.5" />
        <span>Console Configuration</span>
      </div>
      <h1 class="text-2xl font-bold text-slate-100 tracking-tight">
        {{ t("nav.settings") }}
      </h1>
    </div>

    <!-- Error notice -->
    <div
      v-if="error"
      class="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm flex items-center gap-2"
    >
      <AlertTriangle class="w-4 h-4 shrink-0" />
      <span>{{ error }}</span>
    </div>

    <!-- Success notice -->
    <div
      v-if="notice"
      class="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex items-center gap-2"
    >
      <CheckCircle2 class="w-3.5 h-3.5 shrink-0" />
      <span>{{ notice }}</span>
    </div>

    <!-- Anchored Section Tabs -->
    <AnchoredSectionTabs :sections="sections">
      <!-- 1. Language Preferences -->
      <template #language>
        <Card :hover-effect="false">
          <h2 class="text-sm font-semibold text-slate-200 mb-3 flex items-center gap-2">
            <Languages class="w-4 h-4 text-emerald-400" />
            <span>{{ t("settings.language") }}</span>
          </h2>
          <div class="flex gap-2">
            <button
              v-for="l in [
                { key: 'zh', label: '中文 (Chinese)' },
                { key: 'en', label: 'English' },
              ]"
              :key="l.key"
              type="button"
              :class="[
                'text-xs px-4 py-2 rounded-xl font-medium border transition-all cursor-pointer',
                locale === l.key
                  ? 'bg-emerald-600 text-white border-emerald-500 shadow-md shadow-emerald-600/30'
                  : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700',
              ]"
              @click="changeLanguage(l.key)"
            >
              {{ l.label }}
            </button>
          </div>
        </Card>
      </template>

      <!-- 2. Theme Preferences -->
      <template #theme>
        <Card :hover-effect="false">
          <h2 class="text-sm font-semibold text-slate-200 mb-1 flex items-center gap-2">
            <Palette class="w-4 h-4 text-purple-400" />
            <span>{{ t("settings.theme") }}</span>
          </h2>
          <p class="text-xs text-slate-400 mb-4 leading-relaxed">
            {{ t("settings.themeHint") }}
          </p>
          <div class="flex gap-2">
            <button
              v-for="item in [
                { key: 'dark', label: t('settings.themeDark'), icon: Moon },
                { key: 'light', label: t('settings.themeLight'), icon: Sun },
                { key: 'system', label: t('settings.themeSystem'), icon: Monitor },
              ]"
              :key="item.key"
              type="button"
              :class="[
                'flex items-center gap-2 text-xs px-4 py-2 rounded-xl font-medium border transition-all cursor-pointer',
                theme === item.key
                  ? 'bg-emerald-600 text-white border-emerald-500 shadow-md shadow-emerald-600/30'
                  : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700',
              ]"
              @click="changeTheme(item.key as ThemeMode)"
            >
              <component :is="item.icon" class="w-3.5 h-3.5" />
              <span>{{ item.label }}</span>
            </button>
          </div>
        </Card>
      </template>

      <!-- 3. GitHub API Token -->
      <template #githubToken>
        <Card :hover-effect="false">
          <h2 class="text-sm font-semibold text-slate-200 mb-1 flex items-center gap-2">
            <Key class="w-4 h-4 text-amber-400" />
            <span>{{ t("settings.githubToken") }}</span>
          </h2>
          <p class="text-xs text-slate-400 mb-4 leading-relaxed">
            {{ t("settings.githubTokenHint") }}
          </p>
          <div class="flex gap-2">
            <div class="flex-1">
              <Input
                v-model="token"
                :type="showPassword ? 'text' : 'password'"
                placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                @input="
                  tokenSaved = false;
                  tokenValid = null;
                  validationError = null;
                "
              >
                <template #rightElement>
                  <button
                    type="button"
                    :aria-label="t(showPassword ? 'settings.hideToken' : 'settings.showToken')"
                    :title="t(showPassword ? 'settings.hideToken' : 'settings.showToken')"
                    class="text-slate-500 hover:text-slate-300 focus:outline-none cursor-pointer"
                    @click="showPassword = !showPassword"
                  >
                    <Eye v-if="showPassword" class="w-4 h-4" />
                    <EyeOff v-else class="w-4 h-4" />
                  </button>
                </template>
              </Input>
            </div>
            <Button
              :variant="tokenSaved ? 'primary' : 'secondary'"
              :disabled="tokenValidating"
              @click="saveToken"
            >
              <template #icon>
                <Loader2 v-if="tokenValidating" class="w-4 h-4 animate-spin" />
                <Check v-else-if="tokenSaved" class="w-4 h-4 text-emerald-400" />
              </template>
              {{
                tokenValidating
                  ? t("settings.validating")
                  : tokenSaved
                    ? "Saved"
                    : t("common.save")
              }}
            </Button>
          </div>

          <!-- Validation status -->
          <div class="mt-3 flex flex-wrap items-center gap-2">
            <div
              v-if="tokenValid === true"
              class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-medium"
            >
              <CheckCircle2 class="w-3.5 h-3.5" />
              <span>{{ t("settings.tokenValid") }}</span>
            </div>

            <div
              v-if="tokenValid === false"
              class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs"
            >
              <XCircle class="w-3.5 h-3.5 shrink-0" />
              <span class="truncate">
                {{ validationError ?? t("settings.tokenInvalid") }}
              </span>
            </div>

            <!-- Help Link -->
            <a
              v-if="!tokenValid"
              href="https://github.com/settings/tokens"
              target="_blank"
              rel="noopener noreferrer"
              class="inline-flex items-center gap-1.5 text-emerald-400 hover:text-emerald-300 transition-colors text-xs"
            >
              <span>{{ t("settings.githubTokenGetLink") }}</span>
              <span class="font-medium">{{ t("settings.githubTokenLearnMore") }}</span>
              <ExternalLink class="w-3 h-3" />
            </a>
          </div>
        </Card>
      </template>

      <!-- 4. Storage Directory -->
      <template #storage>
        <Card :hover-effect="false">
          <div class="space-y-4">
            <div>
              <h2 class="text-sm font-semibold text-slate-200">
                {{ t("settings.storageTitle") }}
              </h2>
              <p class="text-xs text-slate-400 mt-0.5">
                {{ t("settings.customStorageHint") }}
              </p>
            </div>

            <div class="space-y-2">
              <label class="text-xs font-medium text-slate-400">
                {{ t("settings.storagePathLabel") }}
              </label>
              <div class="flex gap-2">
                <Input
                  :model-value="customStoragePath"
                  placeholder="/path/to/storage"
                  :disabled="true"
                />
                <Button
                  variant="secondary"
                  size="sm"
                  :disabled="isSettingStorageDir"
                  @click="browseStoragePath"
                >
                  <template #icon>
                    <FolderOpen class="w-3.5 h-3.5" />
                  </template>
                  {{ t("settings.browse") }}
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  :disabled="!customStoragePath || isSettingStorageDir"
                  :loading="isSettingStorageDir"
                  @click="applyStoragePath"
                >
                  {{ t("settings.applyStoragePath") }}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  :disabled="isSettingStorageDir || storageInfo?.isDefault"
                  @click="resetToDefault"
                >
                  {{ t("settings.resetToDefault") }}
                </Button>
              </div>

              <div class="mt-2 space-y-1 text-xs text-slate-500">
                <div class="break-all font-mono">
                  {{ t("settings.currentStoragePath") }}: {{ storageInfo?.currentDir ?? t("common.loading") }}
                </div>
                <div
                  v-if="storageInfo?.restartRequired"
                  class="break-all font-mono text-amber-400"
                >
                  {{ t("settings.nextStoragePath") }}: {{ storageInfo.configuredDir }}
                </div>
              </div>

              <div
                v-if="storageInfo?.restartRequired"
                class="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-300"
              >
                {{ t("settings.storageRestartHint") }}
              </div>

              <!-- Action buttons -->
              <div class="flex flex-wrap gap-2 pt-2">
                <Button
                  variant="secondary"
                  size="sm"
                  @click="
                    api.openConsoleDir().catch((e) => error = errorMessage(e))
                  "
                >
                  <template #icon>
                    <FolderOpen class="w-3.5 h-3.5" />
                  </template>
                  {{ t("settings.openStorageDir") }}
                </Button>
              </div>
            </div>
          </div>
        </Card>
      </template>

      <!-- 5. Developer Mode -->
      <template #developer>
        <Card :hover-effect="false">
          <h2 class="text-sm font-semibold text-slate-200 mb-3 flex items-center gap-2">
            <Code2 class="w-4 h-4 text-sky-400" />
            <span>{{ t("settings.developer") }}</span>
          </h2>
          <div class="space-y-3">
            <label
              class="flex items-center gap-3 cursor-pointer select-none p-3 rounded-xl bg-slate-900/60 border border-slate-800 hover:border-slate-700 transition-all"
            >
              <input
                type="checkbox"
                class="w-4 h-4 text-emerald-600 rounded bg-slate-900 border-slate-700 focus:ring-emerald-500 cursor-pointer"
                :checked="debugStore.debugMode"
                @change="
                  debugStore.toggleDebugMode(($event.target as HTMLInputElement).checked)
                "
              />
              <div class="flex flex-col ml-2">
                <span class="text-sm font-medium text-slate-200">
                  Debug Mode
                </span>
              </div>
            </label>

            <div class="border-t border-slate-800 pt-4">
              <h3 class="text-sm font-semibold text-slate-200 mb-3 flex items-center gap-2">
                <Stethoscope class="w-4 h-4 text-emerald-400" />
                <span>{{ t("settings.doctor") }}</span>
              </h3>
              <div class="flex gap-2 mb-4">
                <Button variant="secondary" size="sm" @click="scan">
                  <template #icon>
                    <Stethoscope class="w-3.5 h-3.5" />
                  </template>
                  {{ t("settings.doctorScan") }}
                </Button>
                <Button
                  v-if="broken !== null && broken.length > 0"
                  variant="amber"
                  size="sm"
                  @click="fix"
                >
                  {{ t("settings.doctorFix") }}
                </Button>
              </div>

              <div
                v-if="fixedCount !== null"
                class="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex items-center gap-2 mb-3"
              >
                <CheckCircle2 class="w-3.5 h-3.5 shrink-0" />
                <span>{{ t("settings.doctorFixed", { count: fixedCount }) }}</span>
              </div>

              <template v-if="broken !== null">
                <div
                  v-if="broken.length === 0"
                  class="p-3 rounded-lg bg-slate-900/60 border border-slate-800 text-slate-400 text-xs flex items-center gap-2"
                >
                  <CheckCircle2 class="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>{{ t("settings.doctorNone") }}</span>
                </div>
                <div v-else class="space-y-2">
                  <Badge variant="warning">
                    <AlertTriangle class="w-3 h-3" />
                    <span>{{ t("settings.doctorFound", { count: broken.length }) }}</span>
                  </Badge>
                  <ul class="text-xs font-mono text-slate-400 bg-slate-900/90 p-3 rounded-xl border border-slate-800 space-y-1 overflow-x-auto">
                    <li v-for="b in broken" :key="b.link_path" class="truncate">
                      <span class="text-slate-300 font-semibold">{{ b.project_name }}</span>: {{ b.link_path }} → <span class="text-rose-400">{{ b.target }}</span>
                    </li>
                  </ul>
                </div>
              </template>
            </div>
          </div>
        </Card>
      </template>

      <!-- 6. About Longan -->
      <template #about>
        <Card :hover-effect="false">
          <h2 class="text-sm font-semibold text-slate-200 mb-4 flex items-center gap-2">
            <Info class="w-4 h-4 text-emerald-400" />
            <span>{{ t("settings.aboutTitle") }}</span>
          </h2>

          <div class="divide-y divide-slate-800 rounded-lg border border-slate-800 bg-slate-900/60">
            <dl class="grid grid-cols-1 gap-4 p-4 sm:grid-cols-3">
              <div>
                <dt class="text-xs font-medium text-slate-500">
                  {{ t("settings.currentVersion") }}
                </dt>
                <dd class="mt-1 font-mono text-sm font-semibold text-slate-200">
                  {{ appUpdateStore.currentVersion ?? "-" }}
                </dd>
              </div>
              <div>
                <dt class="text-xs font-medium text-slate-500">
                  {{ t("settings.latestVersion") }}
                </dt>
                <dd class="mt-1 font-mono text-sm font-semibold text-emerald-400">
                  {{ latestVersion }}
                </dd>
              </div>
              <div>
                <dt class="text-xs font-medium text-slate-500">
                  {{ t("settings.publishedAt") }}
                </dt>
                <dd class="mt-1 font-mono text-sm text-slate-300">
                  {{ latestVersionPublishedAt }}
                </dd>
              </div>
            </dl>

            <div class="p-4">
              <div class="mb-3 flex items-center gap-2 text-xs font-medium text-slate-500">
                <GitFork class="h-4 w-4 text-slate-400" />
                <span>{{ t("settings.sourceRepository") }}</span>
              </div>
              <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <span class="min-w-0 break-all font-mono text-xs text-slate-300">
                  {{ GITHUB_REPOSITORY_URL }}
                </span>
                <div class="flex shrink-0 flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    @click="
                      openUrl(GITHUB_REPOSITORY_URL).catch((e) => error = errorMessage(e))
                    "
                  >
                    <template #icon>
                      <ExternalLink class="h-3.5 w-3.5" />
                    </template>
                    {{ t("settings.openRepository") }}
                  </Button>
                  <Button
                    :variant="repositoryCopied ? 'primary' : 'secondary'"
                    size="sm"
                    @click="shareRepository"
                  >
                    <template #icon>
                      <Check v-if="repositoryCopied" class="h-3.5 w-3.5" />
                      <Share2 v-else class="h-3.5 w-3.5" />
                    </template>
                    {{
                      repositoryCopied
                        ? t("settings.repositoryCopied")
                        : t("settings.shareRepository")
                    }}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </Card>
      </template>
    </AnchoredSectionTabs>
  </div>
</template>
