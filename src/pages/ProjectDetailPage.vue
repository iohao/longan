<script setup lang="ts">
import { ref, computed, watch, type Component } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
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
} from "lucide-vue-next";
import { api, errorMessage } from "@/api";
import type { Agent, EffectiveSkill, Preset, Project, Skill, SyncReport } from "@/types";
import {
  buildInheritedPresetMap,
  buildPresetSkillSourceGroups,
  parsePresetOrder,
  sortPresets,
  PRESET_ORDER_SETTING_KEY,
} from "@/utils/presets";
import {
  loadProjectDetailTab,
  saveProjectDetailTab,
  type ProjectDetailTab,
} from "@/utils/navigation";
import Button from "@/components/ui/Button.vue";
import Card from "@/components/ui/Card.vue";
import Badge from "@/components/ui/Badge.vue";
import Input from "@/components/ui/Input.vue";
import SkillSourceActions from "@/components/skills/SkillSourceActions.vue";
import { useProjectStore } from "@/stores/project";

export interface ProjectDetailPageProps {
  projectId?: number;
  onBack?: () => void;
  onReloadProjects?: () => Promise<void>;
}

const props = withDefaults(defineProps<ProjectDetailPageProps>(), {
  projectId: undefined,
  onBack: undefined,
  onReloadProjects: undefined,
});

const emit = defineEmits<{
  (e: "back"): void;
  (e: "reloadProjects"): void;
}>();

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const projectStore = useProjectStore();

const effectiveProjectId = computed<number>(() => {
  if (props.projectId !== undefined && !Number.isNaN(props.projectId)) {
    return props.projectId;
  }
  const idFromParam = Number(route.params.id);
  return Number.isNaN(idFromParam) ? 0 : idFromParam;
});

const PROJECT_DETAIL_TAB_ORDER: ProjectDetailTab[] = ["operations", "skills", "agents"];

const project = ref<Project | null>(null);
const presets = ref<Preset[]>([]);
const presetOrder = ref<number[]>([]);
const agents = ref<Agent[]>([]);
const skills = ref<Skill[]>([]);
const effective = ref<EffectiveSkill[]>([]);
const report = ref<SyncReport | null>(null);
const gitignoreDone = ref(false);
const error = ref<string | null>(null);
const activeTab = ref<ProjectDetailTab>("operations");
const skillSearchQuery = ref("");

watch(
  effectiveProjectId,
  (id) => {
    if (id > 0) {
      activeTab.value = loadProjectDetailTab(id);
      void reload();
    }
  },
  { immediate: true },
);

async function reload() {
  const id = effectiveProjectId.value;
  if (!id) return;
  try {
    const [proj, ps, ag, ss, eff, savedOrderStr] = await Promise.all([
      api.getProject(id),
      api.listPresets(),
      api.listAgents(),
      api.rescanLocal(),
      api.effectiveSkills(id),
      api.getSetting(PRESET_ORDER_SETTING_KEY),
    ]);
    project.value = proj;
    presets.value = ps;
    agents.value = ag;
    skills.value = ss;
    effective.value = eff;
    presetOrder.value = parsePresetOrder(savedOrderStr, ps);
  } catch (e) {
    error.value = errorMessage(e);
  }
}

function selectTab(tab: ProjectDetailTab) {
  activeTab.value = tab;
  if (effectiveProjectId.value > 0) {
    saveProjectDetailTab(effectiveProjectId.value, tab);
  }
}

function handleTabKeyDown(event: KeyboardEvent, currentTab: ProjectDetailTab) {
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

function handleBack() {
  if (props.onBack) {
    props.onBack();
  }
  emit("back");
  router.push({ name: "projects" }).catch(() => {});
}

function navigateToAgents() {
  window.dispatchEvent(new CustomEvent("navigateToAgents"));
}

async function handleOpenDir(path: string) {
  error.value = null;
  try {
    await api.openPath(path);
  } catch (e) {
    error.value = errorMessage(e);
  }
}

async function notifyReload() {
  await reload();
  if (props.onReloadProjects) {
    await props.onReloadProjects();
  } else {
    await projectStore.reloadProjects();
  }
  emit("reloadProjects");
}

async function togglePreset(presetId: number) {
  if (!project.value) return;
  error.value = null;
  try {
    const linked = !project.value.preset_ids.includes(presetId);
    report.value = await api.setProjectPreset(effectiveProjectId.value, presetId, linked);
    await notifyReload();
  } catch (e) {
    error.value = errorMessage(e);
  }
}

async function toggleAgent(agentId: number) {
  if (!project.value) return;
  error.value = null;
  try {
    const linked = !project.value.agent_ids.includes(agentId);
    report.value = await api.setProjectAgent(effectiveProjectId.value, agentId, linked);
    await notifyReload();
  } catch (e) {
    error.value = errorMessage(e);
  }
}

async function toggleSkill(skillId: number) {
  if (!project.value) return;
  error.value = null;
  try {
    const linked = !project.value.skill_ids.includes(skillId);
    report.value = await api.setProjectSkill(effectiveProjectId.value, skillId, linked);
    await notifyReload();
  } catch (e) {
    error.value = errorMessage(e);
  }
}

async function resync() {
  error.value = null;
  try {
    report.value = await api.syncProject(effectiveProjectId.value);
    await reload();
  } catch (e) {
    error.value = errorMessage(e);
  }
}

async function gitignore() {
  error.value = null;
  try {
    await api.gitignoreLinks(effectiveProjectId.value);
    gitignoreDone.value = true;
  } catch (e) {
    error.value = errorMessage(e);
  }
}

const filteredSkills = computed(() => {
  if (!skillSearchQuery.value.trim()) return skills.value;
  const q = skillSearchQuery.value.toLowerCase().trim();
  return skills.value.filter(
    (s) =>
      s.name.toLowerCase().includes(q) ||
      (s.description && s.description.toLowerCase().includes(q)) ||
      s.dir_path.toLowerCase().includes(q) ||
      (s.owner && s.owner.toLowerCase().includes(q)) ||
      (s.repo && s.repo.toLowerCase().includes(q)),
  );
});

const activeAgentCount = computed(() =>
  agents.value.filter(
    (a) => a.global_enabled || (project.value?.agent_ids.includes(a.id) ?? false),
  ).length,
);

const attachedSkillIds = computed(() => {
  if (!project.value) return new Set<number>();
  return new Set(project.value.skill_ids);
});

const availableForAttachment = computed(() => {
  const effectiveSkillIds = new Set(effective.value.map((e) => e.skill_id));
  return filteredSkills.value.filter(
    (s) => !attachedSkillIds.value.has(s.id) && !effectiveSkillIds.has(s.id),
  );
});

const sortedPresets = computed(() => sortPresets(presets.value, presetOrder.value));

const inheritedPresetMap = computed(() =>
  buildInheritedPresetMap(presets.value, project.value?.preset_ids ?? []),
);

const presetCountBadgeText = computed(() => {
  const selectedCount = project.value?.preset_ids.length ?? 0;
  const inheritedCount = inheritedPresetMap.value.size;
  if (inheritedCount > 0) {
    return t("projects.presetSelectedAndInheritedCount", {
      selected: selectedCount,
      inherited: inheritedCount,
    });
  }
  return t("projects.presetSelectedCount", { count: selectedCount });
});

const groupedEffective = computed(() => {
  const direct = effective.value.filter((item) => item.via === "direct");
  const inheritedBySkillId = new Map(
    effective.value
      .filter((item) => item.via !== "direct")
      .map((item) => [item.skill_id, item]),
  );
  const presetGroups = buildPresetSkillSourceGroups(
    sortedPresets.value,
    project.value?.preset_ids ?? [],
  )
    .map((group) => ({
      ...group,
      items: group.skillIds.flatMap((skillId) => {
        const item = inheritedBySkillId.get(skillId);
        return item ? [item] : [];
      }),
    }))
    .filter((group) => group.items.length > 0);

  return { direct, presets: presetGroups };
});

const skillsById = computed(
  () => new Map(skills.value.map((skill) => [skill.id, skill])),
);

interface TabItem {
  id: ProjectDetailTab;
  label: string;
  icon: Component;
}

const projectTabs = computed<TabItem[]>(() => [
  { id: "operations", label: t("projects.operations"), icon: Settings2 },
  { id: "skills", label: t("projects.attachDirectSkills"), icon: PlusCircle },
  { id: "agents", label: t("projects.agents"), icon: Bot },
]);
</script>

<template>
  <div v-if="!project" class="p-12 text-center text-slate-400 animate-pulse text-sm">
    {{ t("common.loading") }}
  </div>

  <div v-else class="max-w-5xl space-y-6">
    <!-- Back Button -->
    <button
      type="button"
      class="inline-flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-emerald-400 hover:text-emerald-300 transition-colors"
      @click="handleBack"
    >
      <ArrowLeft class="w-3.5 h-3.5" />
      <span>{{ t("common.back") }}</span>
    </button>

    <!-- Detail Header -->
    <div class="min-w-0">
      <div class="flex items-center gap-2">
        <h1 class="text-2xl font-bold text-slate-100 tracking-tight truncate">
          {{ project.name }}
        </h1>
        <Badge v-if="!project.path_exists" variant="danger" class="shrink-0">
          <FolderX class="w-3.5 h-3.5" />
          <span>{{ t("projects.pathMissing") }}</span>
        </Badge>
      </div>
      <p class="text-xs text-slate-400 font-mono mt-1 truncate" :title="project.path">
        {{ project.path }}
      </p>
    </div>

    <!-- Error Banner -->
    <div
      v-if="error"
      class="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-sm flex items-center gap-2 animate-in fade-in slide-in-from-top-2 duration-300"
    >
      <AlertCircle class="w-4 h-4 shrink-0" />
      <span>{{ error }}</span>
    </div>

    <!-- Sync Report Banner -->
    <div
      v-if="report"
      class="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-sm flex items-center gap-2 animate-in fade-in slide-in-from-top-2 duration-300"
    >
      <Sparkles class="w-4 h-4 shrink-0 text-emerald-400" />
      <span>
        {{
          t("projects.synced", {
            created: report.created.length,
            removed: report.removed.length,
          })
        }}
      </span>
    </div>

    <!-- Tabs Container -->
    <div class="space-y-4">
      <div class="overflow-x-auto border-b border-slate-800/80">
        <div
          role="tablist"
          :aria-label="t('projects.detailTabs')"
          class="flex min-w-max items-center gap-1"
        >
          <button
            v-for="tab in projectTabs"
            :id="`project-detail-tab-${tab.id}`"
            :key="tab.id"
            type="button"
            role="tab"
            :aria-selected="activeTab === tab.id"
            :aria-controls="`project-detail-panel-${tab.id}`"
            :tabindex="activeTab === tab.id ? 0 : -1"
            :class="[
              'flex h-11 shrink-0 cursor-pointer items-center gap-2 whitespace-nowrap border-b-2 px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-400/70',
              activeTab === tab.id
                ? 'border-emerald-400 text-emerald-300'
                : 'border-transparent text-slate-500 hover:border-slate-700 hover:text-slate-200',
            ]"
            @click="selectTab(tab.id)"
            @keydown="handleTabKeyDown($event, tab.id)"
          >
            <component :is="tab.icon" class="h-4 w-4 shrink-0" />
            <span>{{ tab.label }}</span>
          </button>
        </div>
      </div>

      <!-- Operations Panel -->
      <section
        id="project-detail-panel-operations"
        role="tabpanel"
        aria-labelledby="project-detail-tab-operations"
        :tabindex="0"
        :hidden="activeTab !== 'operations'"
      >
        <Card v-if="activeTab === 'operations'" :hover-effect="false">
          <div class="mb-4 flex items-center gap-2 border-b border-slate-800/80 pb-3">
            <Settings2 class="h-4 w-4 text-emerald-400" />
            <h2 class="text-sm font-semibold text-slate-100">
              {{ t("projects.operations") }}
            </h2>
          </div>
          <div class="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <Button
              variant="outline"
              size="sm"
              class="w-full sm:w-auto"
              @click="handleOpenDir(project.path)"
            >
              <template #icon>
                <FolderOpen class="h-3.5 w-3.5 text-emerald-400" />
              </template>
              {{ t("projects.openDir") }}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              class="w-full sm:w-auto"
              @click="resync"
            >
              <template #icon>
                <RefreshCw class="h-3.5 w-3.5" />
              </template>
              {{ t("projects.sync") }}
            </Button>
            <Button
              variant="outline"
              size="sm"
              :disabled="gitignoreDone"
              class="w-full sm:w-auto"
              @click="gitignore"
            >
              <template #icon>
                <FileCheck2 class="h-3.5 w-3.5 text-emerald-400" />
              </template>
              {{ gitignoreDone ? t("projects.gitignoreDone") : t("projects.gitignore") }}
            </Button>
          </div>
        </Card>
      </section>

      <!-- Skills Panel -->
      <section
        id="project-detail-panel-skills"
        role="tabpanel"
        aria-labelledby="project-detail-tab-skills"
        :tabindex="0"
        :hidden="activeTab !== 'skills'"
      >
        <div v-if="activeTab === 'skills'" class="space-y-4">
          <div class="flex items-center gap-2 px-1">
            <PlusCircle class="h-4 w-4 text-sky-400" />
            <h2 class="text-sm font-semibold text-slate-100">
              {{ t("projects.attachDirectSkills") }}
            </h2>
            <Badge variant="neutral" class="px-1.5 py-0 text-[10px]">
              {{ skills.length }} total
            </Badge>
          </div>

          <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
            <!-- Attached Skills Card -->
            <Card :hover-effect="false" class="h-full">
              <div class="mb-3 flex items-center justify-between border-b border-slate-800/80 pb-2">
                <h3 class="flex items-center gap-2 text-xs font-semibold text-emerald-400">
                  <CheckCircle2 class="h-3.5 w-3.5" />
                  <span>{{ t("projects.attached") }}</span>
                </h3>
                <Badge variant="info" class="px-1.5 py-0 text-[10px]">
                  {{ project.skill_ids.length }}
                </Badge>
              </div>

              <p
                v-if="project.skill_ids.length === 0"
                class="py-4 text-center text-xs italic text-slate-500"
              >
                {{ t("common.empty") }}
              </p>

              <div v-else class="max-h-64 space-y-1.5 overflow-y-auto pr-1">
                <button
                  v-for="skill in filteredSkills.filter((s) => project!.skill_ids.includes(s.id))"
                  :key="skill.id"
                  type="button"
                  class="flex w-full cursor-pointer items-center justify-between rounded-lg border border-sky-500/30 bg-sky-500/10 p-2 text-left text-xs font-medium text-sky-300 transition-colors hover:bg-sky-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/70"
                  @click="toggleSkill(skill.id)"
                >
                  <span class="mr-2 min-w-0 flex-1">
                    <span class="block truncate font-semibold">{{ skill.name }}</span>
                    <span
                      v-if="skill.description"
                      class="block truncate text-[10px] text-slate-500"
                    >
                      {{ skill.description }}
                    </span>
                  </span>
                  <Badge variant="neutral" class="shrink-0 text-[10px]">
                    {{ t(`library.source.${skill.source_type}`) }}
                  </Badge>
                </button>
              </div>
            </Card>

            <!-- Available Skills to Attach Card -->
            <Card :hover-effect="false" class="h-full">
              <Input
                v-model="skillSearchQuery"
                :placeholder="t('projects.searchDirectPlaceholder')"
                class="mb-3"
              >
                <template #icon>
                  <Search class="h-3.5 w-3.5 text-slate-400" />
                </template>
                <template v-if="skillSearchQuery" #rightElement>
                  <button
                    type="button"
                    :aria-label="t('common.clear')"
                    class="cursor-pointer rounded p-1 text-slate-500 transition-colors hover:bg-slate-800/60 hover:text-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70"
                    @click="skillSearchQuery = ''"
                  >
                    <X class="h-3.5 w-3.5" />
                  </button>
                </template>
              </Input>

              <div class="mb-3 flex items-center justify-between border-b border-slate-800/80 pb-2">
                <h3 class="flex items-center gap-2 text-xs font-semibold text-slate-400">
                  <Plus class="h-3.5 w-3.5 text-slate-500" />
                  <span>{{ t("projects.availableToAttach") }}</span>
                </h3>
                <Badge variant="neutral" class="px-1.5 py-0 text-[10px]">
                  {{ availableForAttachment.length }}
                </Badge>
              </div>

              <p
                v-if="availableForAttachment.length === 0"
                class="py-4 text-center text-xs italic text-slate-500"
              >
                {{
                  skills.every((skill) => project!.skill_ids.includes(skill.id))
                    ? t("presets.allAdded")
                    : t("install.noResults")
                }}
              </p>

              <div v-else class="max-h-64 space-y-1.5 overflow-y-auto pb-2 pr-1">
                <button
                  v-for="skill in availableForAttachment"
                  :key="skill.id"
                  type="button"
                  class="flex w-full cursor-pointer items-center justify-between rounded-lg border border-slate-800/80 bg-slate-900/60 p-2 text-left text-xs text-slate-400 transition-colors hover:border-slate-700 hover:bg-slate-800/60 hover:text-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70"
                  @click="toggleSkill(skill.id)"
                >
                  <span class="mr-2 min-w-0 flex-1">
                    <span class="block truncate font-semibold">{{ skill.name }}</span>
                    <span
                      v-if="skill.description"
                      class="block truncate text-[10px] text-slate-500"
                    >
                      {{ skill.description }}
                    </span>
                  </span>
                  <Badge variant="neutral" class="shrink-0 text-[10px]">
                    {{ t(`library.source.${skill.source_type}`) }}
                  </Badge>
                </button>
              </div>
            </Card>
          </div>
        </div>
      </section>

      <!-- Agents Panel -->
      <section
        id="project-detail-panel-agents"
        role="tabpanel"
        aria-labelledby="project-detail-tab-agents"
        :tabindex="0"
        :hidden="activeTab !== 'agents'"
      >
        <Card v-if="activeTab === 'agents'" :hover-effect="false">
          <div class="mb-4 flex items-center gap-2 border-b border-slate-800/80 pb-3">
            <Bot class="h-4 w-4 text-emerald-400" />
            <h2 class="text-sm font-semibold text-slate-100">
              {{ t("projects.agents") }}
            </h2>
            <Badge
              :variant="activeAgentCount > 0 ? 'info' : 'neutral'"
              class="px-1.5 py-0 text-[10px]"
            >
              {{
                t("projects.agentsActive", {
                  enabled: activeAgentCount,
                  total: agents.length,
                })
              }}
            </Badge>
          </div>

          <div class="space-y-3">
            <p class="text-xs text-slate-500">{{ t("projects.agentPanelDesc") }}</p>

            <div v-if="agents.length === 0" class="flex flex-col items-center gap-3 py-4 text-center">
              <p class="text-xs italic text-slate-500">
                {{ t("projects.agentsEmptyHint") }}
              </p>
              <Button
                variant="outline"
                size="sm"
                @click="navigateToAgents"
              >
                <template #icon>
                  <Bot class="h-3.5 w-3.5 text-emerald-400" />
                </template>
                {{ t("projects.manageAgentDirectories") }}
              </Button>
            </div>

            <div v-else class="flex flex-wrap gap-2">
              <button
                v-for="agent in agents"
                :key="agent.id"
                type="button"
                :disabled="agent.global_enabled"
                :title="agent.global_enabled ? t('agents.globalEnabledHint') : agent.target_dir"
                :class="[
                  'flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70',
                  agent.global_enabled || project.agent_ids.includes(agent.id)
                    ? 'border-emerald-500/50 bg-emerald-500/30 text-emerald-100'
                    : 'border-slate-800 bg-slate-900/40 text-slate-400 hover:border-slate-700 hover:bg-slate-800/60 hover:text-slate-200',
                  agent.global_enabled ? 'cursor-default opacity-80' : 'cursor-pointer',
                ]"
                @click="!agent.global_enabled && toggleAgent(agent.id)"
              >
                <span>{{ agent.name }}</span>
                <Globe v-if="agent.global_enabled" class="h-3 w-3 text-emerald-300" />
                <span
                  :class="[
                    'rounded-full px-1.5 font-mono text-[10px]',
                    agent.global_enabled || project.agent_ids.includes(agent.id)
                      ? 'bg-emerald-500/40 text-emerald-200'
                      : 'bg-slate-800/60 text-slate-500',
                  ]"
                >
                  {{ agent.target_dir }}
                </span>
              </button>
            </div>
          </div>
        </Card>
      </section>
    </div>

    <!-- Preset Tags & Effective Active Skills Combined Panel -->
    <Card :hover-effect="false" class="p-4">
      <!-- Preset Tags Section -->
      <div class="mb-6 pb-4 border-b border-slate-800/60">
        <div class="flex items-center justify-between mb-3">
          <h2 class="text-sm font-semibold text-emerald-400 flex items-center gap-2">
            <Layers class="w-4 h-4" />
            <span>{{ t("projects.presets") }}</span>
          </h2>
          <Badge variant="neutral" class="text-[10px] px-1.5 py-0">
            {{ presetCountBadgeText }}
          </Badge>
        </div>

        <div class="flex flex-wrap gap-2">
          <button
            v-for="p in sortedPresets"
            :key="p.id"
            type="button"
            :class="[
              'text-xs px-3 py-1.5 rounded-lg border font-medium transition-all flex items-center gap-1.5 relative overflow-hidden cursor-pointer',
              project.preset_ids.includes(p.id)
                ? 'bg-emerald-500/30 text-emerald-100 border-emerald-500/50'
                : inheritedPresetMap.has(p.id)
                  ? 'bg-slate-900/40 border-dashed border-sky-500/60 text-slate-300 hover:bg-slate-800/60 hover:text-slate-100 hover:border-sky-400'
                  : 'bg-slate-900/40 border-slate-800 text-slate-400 hover:bg-slate-800/60 hover:text-slate-200 hover:border-slate-700',
            ]"
            :title="
              !project.preset_ids.includes(p.id) && inheritedPresetMap.has(p.id)
                ? t('projects.presetInheritedFrom', {
                    sources: inheritedPresetMap.get(p.id)?.sourcePresetNames.join(', '),
                  })
                : undefined
            "
            @click="togglePreset(p.id)"
          >
            <span>{{ p.name }}</span>
            <span
              :class="[
                'text-[10px] px-1.5 rounded-full',
                project.preset_ids.includes(p.id)
                  ? 'bg-emerald-500/40 text-emerald-200'
                  : 'bg-slate-800/60 text-slate-500',
              ]"
            >
              {{ p.skill_ids.length }}
            </span>
          </button>
          <p v-if="sortedPresets.length === 0" class="text-xs text-slate-500">
            {{ t("common.empty") }}
          </p>
        </div>
      </div>

      <!-- Effective Active Skills Section -->
      <div class="flex items-center justify-between mb-4 pb-3 border-b border-slate-800/80">
        <h2 class="text-base font-bold text-slate-100 flex items-center gap-2">
          <CheckCircle2 class="w-4 h-4 text-emerald-400" />
          <span>{{ t("projects.effective") }}</span>
        </h2>
        <Badge variant="info" class="text-xs">
          {{ effective.length }} active
        </Badge>
      </div>

      <p v-if="effective.length === 0" class="text-xs text-slate-500 italic text-center py-6">
        {{ t("common.empty") }}
      </p>

      <div v-else class="space-y-6">
        <!-- Direct Skills -->
        <div v-if="groupedEffective.direct.length > 0" class="space-y-2.5">
          <div class="flex items-center gap-2">
            <Sparkles class="w-4 h-4 text-amber-400" />
            <h3 class="text-xs font-bold uppercase tracking-wider text-amber-400">
              {{ t("projects.effectiveCategoryDirect") }}
            </h3>
            <Badge variant="warning" class="text-[10px] px-1.5 py-0">
              {{ groupedEffective.direct.length }}
            </Badge>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div
              v-for="e in groupedEffective.direct"
              :key="`direct-${e.name}-${e.skill_id}`"
              class="group relative flex items-center justify-between gap-3 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 transition-all duration-200 hover:border-amber-500/40 hover:bg-amber-500/10"
            >
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-1.5">
                  <span class="text-sm font-semibold text-amber-200 truncate">
                    {{ e.name }}
                  </span>
                </div>
                <span class="text-xs text-slate-400 font-mono block truncate mt-0.5" :title="e.dir_path">
                  {{ e.dir_path }}
                </span>
              </div>

              <div class="flex shrink-0 items-center gap-1.5">
                <Badge v-if="e.conflicted" variant="warning" class="text-[10px]">
                  <AlertTriangle class="w-3 h-3" />
                  <span>{{ t("projects.conflict") }}</span>
                </Badge>
                <SkillSourceActions
                  :skill="skillsById.get(e.skill_id) ?? { id: e.skill_id }"
                  @error="(msg) => error = msg"
                />
              </div>
            </div>
          </div>
        </div>

        <!-- Inherited Skills from Presets -->
        <section
          v-if="groupedEffective.presets.length > 0"
          aria-labelledby="project-inherited-skills-heading"
          :class="[
            'space-y-4',
            groupedEffective.direct.length > 0 ? 'border-t border-slate-800/60 pt-4' : '',
          ]"
        >
          <div class="flex items-center gap-2">
            <Link2 class="h-4 w-4 text-sky-400" />
            <h3
              id="project-inherited-skills-heading"
              class="text-xs font-bold uppercase tracking-wider text-sky-400"
            >
              {{ t("presets.inheritedSkills") }}
            </h3>
            <Badge variant="neutral" class="px-1.5 py-0 text-[10px]">
              {{ effective.length - groupedEffective.direct.length }}
            </Badge>
          </div>

          <div class="space-y-5">
            <section
              v-for="group in groupedEffective.presets"
              :key="group.presetId"
              :aria-labelledby="`project-preset-source-${group.presetId}`"
              class="space-y-2.5"
            >
              <div class="flex min-w-0 items-center gap-2 px-1">
                <h4
                  :id="`project-preset-source-${group.presetId}`"
                  class="flex min-w-0 flex-1 items-center gap-1.5 text-xs font-semibold text-sky-300"
                >
                  <Link2 class="h-3.5 w-3.5 shrink-0 text-sky-400/80" />
                  <span class="truncate" :title="group.presetName">
                    {{ group.presetName }}
                  </span>
                </h4>
                <span class="shrink-0 font-mono text-[10px] text-slate-500">
                  {{ group.items.length }}
                </span>
              </div>

              <div class="border-l border-sky-500/25 pl-3">
                <div class="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  <div
                    v-for="e in group.items"
                    :key="`${group.presetId}:${e.skill_id}`"
                    class="group flex min-w-0 items-center justify-between gap-3 rounded-lg border border-sky-500/20 bg-sky-500/[0.06] p-3 transition-colors hover:border-sky-500/35 hover:bg-sky-500/[0.09]"
                  >
                    <div class="min-w-0 flex-1">
                      <span
                        class="block truncate text-sm font-medium text-slate-200"
                        :title="e.name"
                      >
                        {{ e.name }}
                      </span>
                      <span
                        class="mt-0.5 block truncate font-mono text-xs text-slate-400"
                        :title="e.dir_path"
                      >
                        {{ e.dir_path }}
                      </span>
                    </div>

                    <div class="flex shrink-0 items-center gap-1.5">
                      <Badge v-if="e.conflicted" variant="warning" class="text-[10px]">
                        <AlertTriangle class="w-3 h-3" />
                        <span>{{ t("projects.conflict") }}</span>
                      </Badge>
                      <SkillSourceActions
                        :skill="skillsById.get(e.skill_id) ?? { id: e.skill_id }"
                        @error="(msg) => error = msg"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </section>
          </div>
        </section>
      </div>
    </Card>
  </div>
</template>
