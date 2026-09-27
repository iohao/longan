<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { useI18n } from "vue-i18n";
import {
  Download,
  AlertCircle,
  FolderGit2,
  RefreshCw,
  Layers,
  CheckCircle2,
  FolderCheck,
} from "lucide-vue-next";
import Button from "@/components/ui/Button.vue";
import Input from "@/components/ui/Input.vue";
import Card from "@/components/ui/Card.vue";
import Alert from "@/components/ui/Alert.vue";
import Badge from "@/components/ui/Badge.vue";
import GithubIcon from "@/components/icons/GithubIcon.vue";
import { parseGitHubInput } from "@/utils/url";
import { api, errorMessage } from "@/api";
import type { DiscoveredSkill } from "@/types";

export interface GitHubTabProps {
  urlInput: string;
}

const props = defineProps<GitHubTabProps>();

const emit = defineEmits<{
  (e: "update:urlInput", value: string): void;
  (e: "install"): void;
  (e: "batchInstall", skills: DiscoveredSkill[], owner: string, repo: string): void;
}>();

const { t } = useI18n();

const parsed = computed(() => parseGitHubInput(props.urlInput));

const discoveredSkills = ref<DiscoveredSkill[] | null>(null);
const discovering = ref(false);
const discoverError = ref<string | null>(null);
const selectedSkillIds = ref<Set<string>>(new Set());

async function triggerInspect(owner: string, repo: string, subpath?: string) {
  discovering.value = true;
  discoverError.value = null;

  try {
    const skills = await api.inspectGithubSkills(owner, repo, subpath);
    discoveredSkills.value = skills;
    const uninstalled = skills.filter((s) => !s.installed).map((s) => s.skillId);
    selectedSkillIds.value = new Set(
      uninstalled.length > 0 ? uninstalled : skills.map((s) => s.skillId),
    );
  } catch (err) {
    discoverError.value = errorMessage(err);
  } finally {
    discovering.value = false;
  }
}

let inspectTimer: ReturnType<typeof setTimeout> | undefined;

watch(
  () => [parsed.value?.owner, parsed.value?.repo, parsed.value?.subpath, parsed.value?.isValid],
  () => {
    clearTimeout(inspectTimer);
    if (!parsed.value || !parsed.value.isValid) {
      discoveredSkills.value = null;
      discoverError.value = null;
      return;
    }

    const { owner, repo, subpath } = parsed.value;
    inspectTimer = setTimeout(() => {
      void triggerInspect(owner, repo, subpath);
    }, 400);
  },
  { immediate: true },
);

const allSelected = computed(() => {
  if (!discoveredSkills.value || discoveredSkills.value.length === 0) return false;
  return discoveredSkills.value.every((s) => selectedSkillIds.value.has(s.skillId));
});

function toggleSelectAll() {
  if (!discoveredSkills.value) return;
  if (allSelected.value) {
    selectedSkillIds.value = new Set();
  } else {
    selectedSkillIds.value = new Set(discoveredSkills.value.map((s) => s.skillId));
  }
}

function toggleSkill(skillId: string) {
  const next = new Set(selectedSkillIds.value);
  if (next.has(skillId)) {
    next.delete(skillId);
  } else {
    next.add(skillId);
  }
  selectedSkillIds.value = next;
}

function handleBatchInstall() {
  if (!parsed.value || !parsed.value.isValid || !discoveredSkills.value) return;
  const toInstall = discoveredSkills.value.filter((s) => selectedSkillIds.value.has(s.skillId));
  if (toInstall.length === 0) return;

  emit("batchInstall", toInstall, parsed.value.owner, parsed.value.repo);
}

function handleSingleInstall(skill: DiscoveredSkill) {
  if (!parsed.value || !parsed.value.isValid) return;
  emit("batchInstall", [skill], parsed.value.owner, parsed.value.repo);
}

function handlePrimaryAction() {
  if (discoveredSkills.value && discoveredSkills.value.length > 1) {
    handleBatchInstall();
  } else if (discoveredSkills.value && discoveredSkills.value.length === 1) {
    handleSingleInstall(discoveredSkills.value[0]);
  } else {
    emit("install");
  }
}

const primaryButtonLabel = computed(() => {
  if (discoveredSkills.value && discoveredSkills.value.length > 1) {
    return t("install.batchInstall", { count: selectedSkillIds.value.size });
  }
  return t("common.install");
});

const isPrimaryDisabled = computed(() => {
  if (!parsed.value?.isValid) return true;
  if (discovering.value) return true;
  if (discoveredSkills.value && discoveredSkills.value.length > 1) {
    return selectedSkillIds.value.size === 0;
  }
  return false;
});
</script>

<template>
  <div class="space-y-6">
    <Card :hover-effect="false" class="p-6 space-y-5">
      <div class="flex items-center gap-3 border-b border-slate-800/80 pb-4">
        <div
          class="p-2.5 rounded-xl bg-slate-800/80 text-slate-200 border border-slate-700/60 shrink-0"
        >
          <GithubIcon class="w-5 h-5 text-emerald-400" />
        </div>
        <div>
          <h2 class="text-base font-semibold text-slate-100">
            {{ t("install.githubTabTitle") }}
          </h2>
          <p class="text-xs text-slate-400 mt-0.5">
            {{ t("install.githubModalDesc") }}
          </p>
        </div>
      </div>

      <div class="space-y-4">
        <div class="flex gap-3">
          <Input
            placeholder="https://github.com/owner/repo/tree/main/skill-id"
            :model-value="urlInput"
            @update:model-value="(val) => emit('update:urlInput', val)"
            @keydown.enter="
              if (!isPrimaryDisabled) {
                handlePrimaryAction();
              }
            "
          >
            <template #icon>
              <GithubIcon class="w-4 h-4 text-slate-400" />
            </template>
          </Input>

          <Button
            v-if="parsed?.isValid"
            variant="secondary"
            :disabled="discovering"
            :loading="discovering"
            :title="t('install.rescan')"
            @click="triggerInspect(parsed.owner, parsed.repo, parsed.subpath)"
          >
            <RefreshCw :class="['w-4 h-4', discovering ? 'animate-spin' : '']" />
            <span>{{ t("install.scanSkills") }}</span>
          </Button>

          <Button
            variant="primary"
            :disabled="isPrimaryDisabled"
            @click="handlePrimaryAction"
          >
            <Download class="w-4 h-4" />
            <span>{{ primaryButtonLabel }}</span>
          </Button>
        </div>

        <div
          v-if="urlInput.trim() && !parsed?.isValid"
          class="text-xs text-amber-400/90 flex items-center gap-1.5 pt-1"
        >
          <AlertCircle class="w-3.5 h-3.5 shrink-0" />
          <span>{{ t("install.invalidGithubUrl") }}</span>
        </div>

        <!-- Parsed preview card -->
        <div v-if="parsed?.isValid" class="relative p-4 rounded-xl overflow-hidden group">
          <div
            class="absolute inset-0 bg-gradient-to-br from-emerald-500/5 via-transparent to-cyan-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
          />
          <div
            class="relative p-4 rounded-xl bg-slate-900/95 border border-emerald-500/30 backdrop-blur-xl space-y-2 animate-in fade-in duration-150"
          >
            <div class="flex items-center gap-2 text-xs font-semibold text-emerald-400">
              <FolderGit2 class="w-4 h-4" />
              <span>{{ t("install.parsedPreview") }}</span>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs pt-1">
              <div>
                <span class="text-slate-500 block">Owner</span>
                <span class="text-slate-200 font-mono font-medium truncate block">
                  {{ parsed.owner }}
                </span>
              </div>
              <div>
                <span class="text-slate-500 block">Repository</span>
                <span class="text-slate-200 font-mono font-medium truncate block">
                  {{ parsed.repo }}
                </span>
              </div>
              <div>
                <span class="text-slate-500 block">
                  {{ parsed.subpath ? t("install.subpath") : "Skill ID" }}
                </span>
                <span class="text-emerald-300 font-mono font-medium truncate block">
                  {{ parsed.subpath || parsed.skillId }}
                </span>
              </div>
            </div>
          </div>
        </div>

        <!-- Inspecting Loading Indicator -->
        <div
          v-if="discovering"
          class="p-4 rounded-xl bg-slate-900/80 border border-slate-800 flex items-center gap-3 text-slate-300 text-xs animate-pulse"
        >
          <RefreshCw class="w-4 h-4 animate-spin text-emerald-400 shrink-0" />
          <span>{{ t("install.inspecting") }}</span>
        </div>

        <!-- Inspection Error Alert -->
        <Alert
          v-if="discoverError"
          type="error"
          :message="`${t('install.inspectFailed')}: ${discoverError}`"
          @close="discoverError = null"
        />

        <!-- No Skills Found -->
        <div
          v-if="!discovering && discoveredSkills && discoveredSkills.length === 0"
          class="p-4 rounded-xl bg-slate-900/80 border border-amber-500/30 text-amber-300 text-xs flex items-center gap-2.5"
        >
          <AlertCircle class="w-4 h-4 text-amber-400 shrink-0" />
          <span>{{ t("install.noSkillsFound") }}</span>
        </div>

        <!-- Multiple Discovered Skills: Batch Selector -->
        <div
          v-if="!discovering && discoveredSkills && discoveredSkills.length > 1"
          class="p-4 rounded-xl bg-slate-900/90 border border-slate-800 space-y-3 animate-in fade-in duration-150"
        >
          <div
            class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800"
          >
            <div class="flex items-center gap-2 text-sm font-semibold text-slate-100">
              <Layers class="w-4 h-4 text-emerald-400" />
              <span>{{ t("install.detectedSkills", { count: discoveredSkills.length }) }}</span>
              <span class="text-xs text-slate-400 font-normal ml-2">
                {{
                  t("install.selectedCount", {
                    selected: selectedSkillIds.size,
                    total: discoveredSkills.length,
                  })
                }}
              </span>
            </div>
            <div class="flex items-center gap-2">
              <Button size="sm" variant="ghost" @click="toggleSelectAll">
                {{ allSelected ? t("install.deselectAll") : t("install.selectAll") }}
              </Button>
              <Button
                size="sm"
                variant="primary"
                :disabled="selectedSkillIds.size === 0"
                @click="handleBatchInstall"
              >
                <Download class="w-3.5 h-3.5" />
                <span>{{ t("install.batchInstall", { count: selectedSkillIds.size }) }}</span>
              </Button>
            </div>
          </div>

          <div class="space-y-2 max-h-80 overflow-y-auto pr-1">
            <div
              v-for="skill in discoveredSkills"
              :key="skill.sourcePath"
              :class="[
                'p-3 rounded-lg border transition-all cursor-pointer flex items-start gap-3',
                selectedSkillIds.has(skill.skillId)
                  ? 'bg-slate-800/80 border-emerald-500/40'
                  : 'bg-slate-900/50 border-slate-800/80 hover:border-slate-700',
              ]"
              @click="toggleSkill(skill.skillId)"
            >
              <input
                type="checkbox"
                :checked="selectedSkillIds.has(skill.skillId)"
                class="mt-0.5 rounded border-slate-700 bg-slate-900 text-emerald-500 focus:ring-emerald-500/20 cursor-pointer"
                @click.stop
                @change="toggleSkill(skill.skillId)"
              />
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2">
                  <span class="text-xs font-semibold text-slate-100">
                    {{ skill.name }}
                  </span>
                  <span class="text-[11px] font-mono text-slate-500 truncate">
                    {{ skill.sourcePath }}
                  </span>
                </div>
                <p v-if="skill.description" class="text-xs text-slate-400 mt-1 line-clamp-2">
                  {{ skill.description }}
                </p>
              </div>
              <div class="shrink-0 flex items-center gap-2" @click.stop>
                <Badge v-if="skill.installed" variant="success">
                  <CheckCircle2 class="w-3 h-3" />
                  <span>{{ t("common.installed") }}</span>
                </Badge>
                <Button
                  v-else
                  size="sm"
                  variant="secondary"
                  @click="handleSingleInstall(skill)"
                >
                  <Download class="w-3.5 h-3.5" />
                  <span>{{ t("common.install") }}</span>
                </Button>
              </div>
            </div>
          </div>
        </div>

        <!-- Single Discovered Skill Display -->
        <div
          v-if="!discovering && discoveredSkills && discoveredSkills.length === 1"
          class="p-4 rounded-xl bg-slate-900/90 border border-emerald-500/30 space-y-2 animate-in fade-in duration-150"
        >
          <div class="flex items-start justify-between gap-4">
            <div class="space-y-1">
              <div class="flex items-center gap-2">
                <FolderCheck class="w-4 h-4 text-emerald-400" />
                <span class="text-sm font-semibold text-slate-100">
                  {{ discoveredSkills[0].name }}
                </span>
                <span class="text-xs font-mono text-slate-500">
                  {{ discoveredSkills[0].sourcePath }}
                </span>
              </div>
              <p v-if="discoveredSkills[0].description" class="text-xs text-slate-400">
                {{ discoveredSkills[0].description }}
              </p>
            </div>
            <Badge v-if="discoveredSkills[0].installed" variant="success">
              <CheckCircle2 class="w-3 h-3" />
              <span>{{ t("common.installed") }}</span>
            </Badge>
            <Button
              v-else
              size="sm"
              variant="primary"
              @click="handleSingleInstall(discoveredSkills[0])"
            >
              <Download class="w-3.5 h-3.5" />
              <span>{{ t("common.install") }}</span>
            </Button>
          </div>
        </div>
      </div>
    </Card>
  </div>
</template>
