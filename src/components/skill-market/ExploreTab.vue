<script setup lang="ts">
import { ref, computed, onMounted, watch } from "vue";
import { useI18n } from "vue-i18n";
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
} from "lucide-vue-next";
import type { RegistrySkill, Skill, SkillInstallTask } from "@/types";
import Button from "@/components/ui/Button.vue";
import Badge from "@/components/ui/Badge.vue";
import Input from "@/components/ui/Input.vue";
import Card from "@/components/ui/Card.vue";
import EmptyState from "@/components/ui/EmptyState.vue";
import Alert from "@/components/ui/Alert.vue";
import VirtualizedList from "@/components/ui/VirtualizedList.vue";
import GithubIcon from "@/components/icons/GithubIcon.vue";
import SkillsShIcon from "@/components/icons/SkillsShIcon.vue";
import HoverActionGroup from "@/components/ui/HoverActionGroup.vue";
import { parseGitHubInput } from "@/utils/url";
import { reportFrontendError } from "@/logging";

interface RecommendedSkill {
  id: string;
  name: string;
  source: string;
  description?: string;
  descriptionEnglish?: string;
  installs?: number;
  category?: string;
}

export interface ExploreTabProps {
  registryQuery: string;
  registryResults: RegistrySkill[] | null;
  registryResultsVersion: number;
  registryLoading: boolean;
  installTasks: ReadonlyMap<string, SkillInstallTask>;
  error: string | null;
  installedSkillsList: Skill[];
  debugMode: boolean;
}

const props = defineProps<ExploreTabProps>();

const emit = defineEmits<{
  (e: "update:registryQuery", value: string): void;
  (e: "clearError"): void;
  (e: "search"): void;
  (e: "install", skill: RegistrySkill): void;
  (e: "githubFallback", query: string): void;
  (e: "copySkillDetails", skill: RegistrySkill): void;
}>();

const { t, locale } = useI18n();

const recommendedSkills = ref<RecommendedSkill[]>([]);
const shouldShowWelcome = ref(true);

const installedSourceIds = computed(
  () =>
    new Set(
      props.installedSkillsList.flatMap((skill) =>
        skill.source_url ? [skill.source_url.toLowerCase()] : [],
      ),
    ),
);

onMounted(() => {
  fetch("/recommended-skills.json")
    .then((res) => res.json())
    .then((allSkills: RecommendedSkill[]) => {
      const shuffled = [...allSkills].sort(() => Math.random() - 0.5);
      recommendedSkills.value = shuffled.slice(0, 8);
    })
    .catch((err) => {
      reportFrontendError("Failed to load recommended skills", err, "ExploreTab");
    });
});

watch(
  () => props.registryQuery,
  (query) => {
    shouldShowWelcome.value = query.trim() === "";
  },
  { immediate: true },
);

const ghParsedFallback = computed(() => {
  if (
    props.registryResults !== null &&
    props.registryResults.length === 0 &&
    !props.registryLoading
  ) {
    const parsed = parseGitHubInput(props.registryQuery);
    if (parsed && parsed.isValid) return parsed;
  }
  return null;
});

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

function formatSkillDetails(skill: RegistrySkill): string {
  return JSON.stringify(
    {
      id: skill.id,
      name: skill.name,
      source: skill.source,
      installs: skill.installs,
      supported: skill.supported,
      installed: skill.installed,
      full_info_retrieved_from: "skills.sh API",
      retrieved_at: new Date().toISOString(),
    },
    null,
    2,
  );
}

function getSkillDescription(skill: RecommendedSkill, currentLang: string): string {
  if (currentLang.startsWith("zh")) {
    return skill.description || skill.descriptionEnglish || "";
  }
  return skill.descriptionEnglish || skill.description || "";
}

function isSkillInstalled(sourceUrlOrId: string): boolean {
  return installedSourceIds.value.has(sourceUrlOrId.toLowerCase());
}

function handleCopyDetails(skill: RegistrySkill) {
  const details = formatSkillDetails(skill);
  navigator.clipboard
    .writeText(details)
    .then(() => {
      emit("copySkillDetails", skill);
    })
    .catch((err) => {
      reportFrontendError("Failed to copy registry skill details", err, "ExploreTab");
    });
}
</script>

<template>
  <div class="space-y-6">
    <!-- Search Input Bar -->
    <Card :hover-effect="false" class="p-2">
      <div class="flex gap-3">
        <Input
          :placeholder="t('install.placeholder')"
          :model-value="registryQuery"
          @update:model-value="(val) => emit('update:registryQuery', val)"
          @keydown.enter="emit('search')"
        >
          <template #icon>
            <Search class="w-4 h-4 text-slate-400" />
          </template>
        </Input>
        <Button
          variant="primary"
          :loading="registryLoading"
          :title="t('common.search')"
          :aria-label="t('common.search')"
          @click="emit('search')"
        >
          <Search class="w-4 h-4" />
        </Button>
      </div>
    </Card>

    <!-- Error Display -->
    <Alert v-if="error" type="error" :message="error" @close="emit('clearError')" />

    <!-- Initial Welcome & Recommendations -->
    <div v-if="shouldShowWelcome && !registryLoading" class="space-y-6">
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <!-- Recommended Skills - 2 columns -->
        <div class="lg:col-span-2 space-y-4">
          <Card :hover-effect="false" class="border-emerald-500/30">
            <div class="flex items-center justify-between mb-4">
              <h3 class="text-base font-semibold text-slate-100 flex items-center gap-2">
                <TrendingUp class="w-5 h-5 text-amber-400" />
                <span>{{ t("explore.recommendedHeader") }}</span>
              </h3>
            </div>

            <div v-if="recommendedSkills.length > 0" class="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div
                v-for="skill in recommendedSkills"
                :key="skill.id"
                class="group glass-card rounded-lg p-3 border border-slate-700 hover:border-emerald-500/40 transition-all duration-200"
              >
                <div class="space-y-2">
                  <div class="flex items-start justify-between gap-2">
                    <div class="min-w-0">
                      <h4 class="text-sm font-medium text-slate-100 truncate">
                        {{ skill.name }}
                      </h4>
                      <p class="text-xs text-slate-400 mt-0.5 line-clamp-2">
                        {{ getSkillDescription(skill, locale) }}
                      </p>
                    </div>
                  </div>

                  <div class="flex items-center justify-between pt-2 border-t border-slate-700/50">
                    <span class="text-xs text-slate-500 flex items-center gap-1">
                      <TrendingUp class="w-3 h-3" />
                      <span>{{ formatInstalls(skill.installs || 0) }}</span>
                      <span class="text-slate-600">{{ t("common.installs") }}</span>
                    </span>

                    <div class="flex items-center gap-2">
                      <HoverActionGroup>
                        <Button
                          size="sm"
                          variant="outline"
                          :title="t('library.openSkillsSrcPage')"
                          :aria-label="t('library.openSkillsSrcPage')"
                          @click="openUrl(`https://skills.sh/${skill.id}`)"
                        >
                          <SkillsShIcon />
                        </Button>
                      </HoverActionGroup>

                      <!-- Install Action -->
                      <Badge
                        v-if="
                          isSkillInstalled(skill.id) ||
                          installTasks.get(skill.id.toLowerCase())?.status === 'completed'
                        "
                        variant="success"
                      >
                        <CheckCircle2 class="h-3.5 w-3.5" />
                        <span>{{ t("common.installed") }}</span>
                      </Badge>

                      <Button
                        v-else
                        size="sm"
                        variant="primary"
                        :disabled="
                          installTasks.get(skill.id.toLowerCase())?.status === 'queued' ||
                          installTasks.get(skill.id.toLowerCase())?.status === 'installing' ||
                          installTasks.get(skill.id.toLowerCase())?.status === 'cancelling'
                        "
                        :loading="
                          installTasks.get(skill.id.toLowerCase())?.status === 'installing' ||
                          installTasks.get(skill.id.toLowerCase())?.status === 'cancelling'
                        "
                        @click="
                          emit('install', {
                            id: skill.id,
                            name: skill.name,
                            source: skill.source,
                            installs: skill.installs || 0,
                            supported: true,
                            installed: false,
                          })
                        "
                      >
                        <Clock3
                          v-if="installTasks.get(skill.id.toLowerCase())?.status === 'queued'"
                          class="h-3.5 w-3.5"
                        />
                        <RotateCcw
                          v-else-if="
                            installTasks.get(skill.id.toLowerCase())?.status === 'failed' ||
                            installTasks.get(skill.id.toLowerCase())?.status === 'cancelled'
                          "
                          class="h-3.5 w-3.5"
                        />
                        <Download v-else class="h-3.5 w-3.5" />
                        <span>{{
                          installTasks.get(skill.id.toLowerCase())?.status === "queued"
                            ? t("install.queue.queued")
                            : installTasks.get(skill.id.toLowerCase())?.status === "installing"
                              ? t("install.queue.installing")
                              : installTasks.get(skill.id.toLowerCase())?.status === "cancelling"
                                ? t("install.queue.cancelling")
                                : installTasks.get(skill.id.toLowerCase())?.status === "failed" ||
                                    installTasks.get(skill.id.toLowerCase())?.status === "cancelled"
                                  ? t("install.queue.retryAction")
                                  : t("common.install")
                        }}</span>
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <p v-else class="text-sm text-slate-400">{{ t("common.loading") }}</p>
          </Card>
        </div>

        <!-- External Links & Tips - 1 column -->
        <div class="space-y-4">
          <a
            href="https://skills.sh/"
            target="_blank"
            rel="noopener noreferrer"
            class="block glass-card rounded-xl p-5 border border-emerald-500/30 hover:border-emerald-500/60 transition-all duration-200 group"
          >
            <div class="space-y-3">
              <div class="flex items-center gap-2 text-emerald-300">
                <ExternalLink class="w-5 h-5 text-emerald-400" />
                <span class="font-semibold text-sm">Skills.sh</span>
              </div>
              <p class="text-xs text-slate-400 leading-relaxed">
                {{ t("explore.externalSiteDesc") }}
              </p>
              <div class="pt-3 border-t border-slate-700 flex items-center justify-between">
                <span class="text-[11px] text-slate-500">
                  {{ t("explore.externalSiteSource") }}
                </span>
                <ExternalLink
                  class="w-3.5 h-3.5 text-slate-400 group-hover:text-emerald-400 transition-colors"
                />
              </div>
            </div>
          </a>

          <Card :hover-effect="false" class="p-4 bg-emerald-500/5 border-emerald-500/20">
            <h4 class="text-sm font-semibold text-slate-100 mb-2">
              {{ t("explore.tipsTitle") }}
            </h4>
            <ul class="space-y-1.5 text-xs text-slate-400">
              <li class="flex items-start gap-2">
                <span class="text-emerald-400 mt-0.5">•</span>
                <span>{{ t("explore.tipInstall") }}</span>
              </li>
              <li class="flex items-start gap-2">
                <span class="text-emerald-400 mt-0.5">•</span>
                <span>{{ t("explore.tipSearch") }}</span>
              </li>
              <li class="flex items-start gap-2">
                <span class="text-emerald-400 mt-0.5">•</span>
                <span>{{ t("explore.tipGitHub") }}</span>
              </li>
              <li class="flex items-start gap-2">
                <span class="text-emerald-400 mt-0.5">•</span>
                <span>{{ t("explore.tipCopyDetails") }}</span>
              </li>
            </ul>
          </Card>
        </div>
      </div>
    </div>

    <!-- GitHub Fallback Card -->
    <div
      v-else-if="ghParsedFallback"
      class="glass-card rounded-xl p-5 border border-emerald-500/30 bg-emerald-500/5 space-y-4 animate-in fade-in duration-200"
    >
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div class="space-y-1">
          <div class="flex items-center gap-2 text-emerald-300 font-semibold text-sm">
            <GithubIcon class="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{{ t("install.githubFallbackTitle") }}</span>
          </div>
          <p class="text-xs text-slate-400">
            {{ t("install.githubFallbackDesc", { source: ghParsedFallback.source }) }}
          </p>
        </div>
        <Button
          variant="primary"
          size="sm"
          @click="emit('githubFallback', registryQuery)"
        >
          <Download class="w-4 h-4" />
          <span>{{ t("install.githubInstallAction") }}</span>
        </Button>
      </div>
    </div>

    <!-- No Results State -->
    <EmptyState
      v-else-if="registryResults !== null && registryResults.length === 0 && !registryLoading"
      :title="t('install.noResults')"
      :description="t('install.noResultsDesc')"
    >
      <template #icon>
        <AlertCircle class="w-8 h-8 text-amber-400" />
      </template>
    </EmptyState>

    <!-- Results List with VirtualizedList -->
    <VirtualizedList
      v-else-if="registryResults !== null && registryResults.length > 0"
      :items="registryResults"
      :get-item-key="(s) => s.id"
      :aria-label="t('install.exploreTab')"
      :reset-key="registryResultsVersion"
      class="grid grid-cols-1 gap-3"
      v-slot="{ item: s }"
    >
      <div
        class="group glass-card rounded-xl p-4 border border-slate-800/80 hover:border-emerald-500/40 transition-all duration-200"
      >
        <div class="flex items-center justify-between gap-4">
          <div class="min-w-0 space-y-1">
            <div class="flex items-center gap-2">
              <h3 class="text-sm font-semibold text-slate-100 truncate">
                {{ s.name }}
              </h3>
              <span class="text-xs text-slate-500 font-mono">({{ s.id }})</span>
            </div>
            <div class="flex items-center gap-3 text-xs text-slate-400">
              <span class="font-mono text-emerald-400/90">{{ s.source }}</span>
              <span>•</span>
              <span class="flex items-center gap-1.5 text-slate-400 font-medium">
                <TrendingUp class="w-4 h-4 text-emerald-400" />
                <span class="text-slate-200">{{ formatInstalls(s.installs) }}</span>
                <span class="text-slate-500 text-[11px]">{{ t("common.installs") }}</span>
              </span>
            </div>
          </div>

          <div class="shrink-0 flex items-center gap-2">
            <HoverActionGroup>
              <Button
                v-if="debugMode"
                size="sm"
                variant="outline"
                :title="t('explore.copyDetails')"
                @click="handleCopyDetails(s)"
              >
                <Copy class="w-3.5 h-3.5" />
                <span class="hidden sm:inline">{{ t("explore.copyDetails") }}</span>
              </Button>

              <Button
                size="sm"
                variant="outline"
                :title="t('library.openSkillsSrcPage')"
                :aria-label="t('library.openSkillsSrcPage')"
                @click="openUrl(`https://skills.sh/${s.id}`)"
              >
                <SkillsShIcon />
              </Button>
            </HoverActionGroup>

            <!-- Install Action -->
            <Badge
              v-if="
                s.installed ||
                isSkillInstalled(s.id) ||
                installTasks.get(s.id.toLowerCase())?.status === 'completed'
              "
              variant="success"
            >
              <CheckCircle2 class="h-3.5 w-3.5" />
              <span>{{ t("common.installed") }}</span>
            </Badge>

            <Badge v-else-if="!s.supported" variant="neutral">
              {{ t("common.unsupported") }}
            </Badge>

            <Button
              v-else
              size="sm"
              variant="primary"
              :disabled="
                installTasks.get(s.id.toLowerCase())?.status === 'queued' ||
                installTasks.get(s.id.toLowerCase())?.status === 'installing' ||
                installTasks.get(s.id.toLowerCase())?.status === 'cancelling'
              "
              :loading="
                installTasks.get(s.id.toLowerCase())?.status === 'installing' ||
                installTasks.get(s.id.toLowerCase())?.status === 'cancelling'
              "
              @click="emit('install', s)"
            >
              <Clock3
                v-if="installTasks.get(s.id.toLowerCase())?.status === 'queued'"
                class="h-3.5 w-3.5"
              />
              <RotateCcw
                v-else-if="
                  installTasks.get(s.id.toLowerCase())?.status === 'failed' ||
                  installTasks.get(s.id.toLowerCase())?.status === 'cancelled'
                "
                class="h-3.5 w-3.5"
              />
              <Download v-else class="h-3.5 w-3.5" />
              <span>{{
                installTasks.get(s.id.toLowerCase())?.status === "queued"
                  ? t("install.queue.queued")
                  : installTasks.get(s.id.toLowerCase())?.status === "installing"
                    ? t("install.queue.installing")
                    : installTasks.get(s.id.toLowerCase())?.status === "cancelling"
                      ? t("install.queue.cancelling")
                      : installTasks.get(s.id.toLowerCase())?.status === "failed" ||
                          installTasks.get(s.id.toLowerCase())?.status === "cancelled"
                        ? t("install.queue.retryAction")
                        : t("common.install")
              }}</span>
            </Button>
          </div>
        </div>
      </div>
    </VirtualizedList>
  </div>
</template>
