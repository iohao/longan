<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import {
  Store,
  Layers,
  FolderGit2,
  Settings as SettingsIcon,
  ChevronDown,
  ChevronRight,
  Plus,
  AlertTriangle,
  BookOpen,
  Bot,
  Archive,
  MoreVertical,
  Eye,
  EyeOff,
  FolderTree,
} from "lucide-vue-next";
import type { Component } from "vue";
import type { Preset, Project, ProjectGroup } from "@/types";
import { getProjectSkillCount } from "@/types";
import { buildProjectGroupSections } from "@/utils/projectOrder";
import { useProjectStore } from "@/stores/project";
import { useAppUpdateStore } from "@/stores/appUpdate";
import { useSkillUpdateStore } from "@/stores/skillUpdate";
import SkillInstallQueue from "./SkillInstallQueue.vue";

export type PageKey =
  | "market"
  | "installed"
  | "presets"
  | "agents"
  | "migration"
  | "projects"
  | "settings"
  | "tools";

export interface NavItem {
  key: PageKey;
  icon: Component;
}

export interface SidebarProps {
  currentPage?: PageKey;
  selectedProjectId?: number | null;
  projects?: Project[];
  projectGroups?: ProjectGroup[];
  presets?: Preset[];
  showHiddenProjects?: boolean;
  currentVersion?: string | null;
}

const props = withDefaults(defineProps<SidebarProps>(), {
  currentPage: undefined,
  selectedProjectId: undefined,
  projects: undefined,
  projectGroups: undefined,
  presets: undefined,
  showHiddenProjects: undefined,
  currentVersion: undefined,
});

const emit = defineEmits<{
  (e: "selectPage", page: PageKey): void;
  (e: "selectProject", projectId: number | null): void;
  (e: "addProject"): void;
  (e: "setHiddenProjectsPreview", show: boolean): void;
  (e: "toggleHiddenProjects"): void;
}>();

const { t } = useI18n();
const router = useRouter();
const route = useRoute();
const projectStore = useProjectStore();
const appUpdateStore = useAppUpdateStore();
const skillUpdateStore = useSkillUpdateStore();

const effectiveProjects = computed(() => props.projects ?? projectStore.projects);
const effectiveProjectGroups = computed(
  () => props.projectGroups ?? projectStore.projectGroups,
);
const effectivePresets = computed(() => props.presets ?? projectStore.presets);
const effectiveShowHiddenProjects = computed(
  () => props.showHiddenProjects ?? projectStore.showHiddenProjectsInSidebar,
);

const effectiveCurrentPage = computed<PageKey>(() => {
  if (props.currentPage !== undefined) return props.currentPage;
  const path = route?.path || "";
  if (path.startsWith("/market")) return "market";
  if (path.startsWith("/installed")) return "installed";
  if (path.startsWith("/presets")) return "presets";
  if (path.startsWith("/agents")) return "agents";
  if (path.startsWith("/migration")) return "migration";
  if (path.startsWith("/settings")) return "settings";
  if (path.startsWith("/projects")) return "projects";
  return "market";
});

const effectiveSelectedProjectId = computed<number | null>(() => {
  if (props.selectedProjectId !== undefined) return props.selectedProjectId;
  if (route?.params?.id) {
    const id = Number(route.params.id);
    return isNaN(id) ? null : id;
  }
  return projectStore.selectedProjectId;
});

const displayVersion = computed(() => {
  const raw = props.currentVersion ?? appUpdateStore.currentVersion;
  if (!raw) return "";
  return raw.startsWith("v") ? raw : `v${raw}`;
});

const isProjectsExpanded = ref(true);
const isToolsExpanded = ref(false);
const toolsButtonRef = ref<HTMLButtonElement | null>(null);

const groupedProjects = computed(() =>
  buildProjectGroupSections(effectiveProjectGroups.value, effectiveProjects.value),
);

const hasHiddenItems = computed(() =>
  groupedProjects.value.some(
    ({ group, hiddenProjects }) => group.hidden || hiddenProjects.length > 0,
  ),
);

const sidebarGroups = computed(() =>
  groupedProjects.value.filter(({ group, visibleProjects, hiddenProjects }) => {
    if (group.hidden && !effectiveShowHiddenProjects.value) return false;
    const displayedCount =
      visibleProjects.length +
      (effectiveShowHiddenProjects.value ? hiddenProjects.length : 0);
    return displayedCount > 0;
  }),
);

function handleToggleHidden() {
  const next = !effectiveShowHiddenProjects.value;
  emit("toggleHiddenProjects");
  emit("setHiddenProjectsPreview", next);
  if (props.showHiddenProjects === undefined) {
    void projectStore.setHiddenProjectsPreview(next);
  }
}

async function handleAddProject() {
  emit("addProject");
  if (!isProjectsExpanded.value) isProjectsExpanded.value = true;
  if (!props.projects) {
    const newId = await projectStore.addProject();
    if (newId !== null) {
      handleSelectProject(newId);
    }
  }
}

function handleSelectPage(pageKey: PageKey) {
  emit("selectPage", pageKey);
  if (router) {
    router.push({ name: pageKey }).catch(() => {});
  }
}

function handleSelectProject(projectId: number | null) {
  emit("selectProject", projectId);
  if (projectId === null) {
    if (router) router.push({ name: "projects" }).catch(() => {});
    projectStore.selectProject(null);
  } else {
    if (router) {
      router
        .push({ name: "project-detail", params: { id: projectId } })
        .catch(() => {});
    }
    projectStore.selectProject(projectId);
  }
}

function handleClickOutside(event: MouseEvent) {
  const target = event.target as HTMLElement;
  const sidebar = document.querySelector(".w-64");

  if (toolsButtonRef.value?.contains(target)) return;

  const dropdown = document.querySelector("[data-tools-dropdown]") as HTMLElement;
  if (dropdown?.contains(target)) return;

  if (sidebar && isToolsExpanded.value) {
    isToolsExpanded.value = false;
    if (effectiveCurrentPage.value === "tools") {
      handleSelectPage("market");
    }
  }
}

onMounted(() => {
  document.addEventListener("mousedown", handleClickOutside);
});

onUnmounted(() => {
  document.removeEventListener("mousedown", handleClickOutside);
});

watch(effectiveCurrentPage, (newPage) => {
  if (newPage !== "agents" && newPage !== "migration") {
    isToolsExpanded.value = false;
  }
});

const NAV_ITEMS: NavItem[] = [
  { key: "market", icon: Store },
  { key: "presets", icon: Layers },
  { key: "installed", icon: BookOpen },
];

const TOOLS_NAV_ITEMS: NavItem[] = [
  { key: "agents", icon: Bot },
  { key: "migration", icon: Archive },
];
</script>

<template>
  <aside
    class="relative w-64 shrink-0 border-r border-slate-800/80 bg-slate-950 flex flex-col justify-between select-none"
  >
    <!-- Brand Header -->
    <div
      class="px-5 py-5 border-b border-slate-800/80 flex items-center gap-3 shrink-0"
    >
      <div
        class="w-8 h-8 rounded-xl overflow-hidden flex items-center justify-center shrink-0 shadow-md shadow-slate-900/50"
      >
        <img src="/icon.png" alt="Longan Logo" class="w-full h-full object-cover" />
      </div>
      <div>
        <h1
          class="text-sm font-bold tracking-wide text-slate-100 flex items-center gap-1.5"
        >
          Longan
        </h1>
        <p class="text-[11px] text-slate-400 font-mono min-h-[1rem]">
          {{ displayVersion }}
        </p>
      </div>
    </div>

    <!-- Region 1: Projects Section (Scrollable Top / Middle) -->
    <div class="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-y-none p-3">
      <div class="space-y-1">
        <!-- Projects Group Header -->
        <div
          :class="[
            'w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 group cursor-pointer',
            effectiveCurrentPage === 'projects'
              ? 'bg-emerald-600/10 text-emerald-400 border border-emerald-500/20'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/80',
          ]"
          @click="
            () => {
              handleSelectProject(null);
              if (!isProjectsExpanded) isProjectsExpanded = true;
            }
          "
        >
          <div class="flex items-center gap-2.5 min-w-0">
            <button
              type="button"
              class="p-0.5 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
              :title="isProjectsExpanded ? 'Collapse' : 'Expand'"
              @click.stop="isProjectsExpanded = !isProjectsExpanded"
            >
              <ChevronDown v-if="isProjectsExpanded" class="w-3.5 h-3.5" />
              <ChevronRight v-else class="w-3.5 h-3.5" />
            </button>

            <span
              :class="[
                'transition-colors shrink-0',
                effectiveCurrentPage === 'projects'
                  ? 'text-emerald-400'
                  : 'text-slate-400 group-hover:text-slate-300',
              ]"
            >
              <FolderGit2 class="w-4 h-4" />
            </span>
            <span class="truncate">{{ t("nav.projects") }}</span>
            <span
              v-if="effectiveProjects.length > 0"
              class="ml-1 text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-slate-800/80 text-slate-400 border border-slate-700/50"
            >
              {{ effectiveProjects.length }}
            </span>
          </div>

          <div class="flex items-center gap-1.5 shrink-0" @click.stop>
            <!-- Toggle Hidden Projects Preview -->
            <button
              v-if="hasHiddenItems || effectiveShowHiddenProjects"
              type="button"
              :aria-pressed="effectiveShowHiddenProjects"
              :aria-label="
                t(
                  effectiveShowHiddenProjects
                    ? 'projects.endHiddenProjectsPreview'
                    : 'projectGroups.showHiddenItems',
                )
              "
              :title="
                t(
                  effectiveShowHiddenProjects
                    ? 'projects.endHiddenProjectsPreview'
                    : 'projectGroups.showHiddenItems',
                )
              "
              :class="[
                'p-1 rounded-lg transition-all cursor-pointer',
                effectiveShowHiddenProjects
                  ? 'text-emerald-400 bg-emerald-500/20 hover:bg-emerald-500/30 hover:text-emerald-300'
                  : 'text-slate-400 hover:text-emerald-300 hover:bg-emerald-500/20',
              ]"
              @click="
                () => {
                  handleToggleHidden();
                  if (!effectiveShowHiddenProjects && !isProjectsExpanded) {
                    isProjectsExpanded = true;
                  }
                }
              "
            >
              <Eye v-if="effectiveShowHiddenProjects" class="w-3.5 h-3.5" />
              <EyeOff v-else class="w-3.5 h-3.5" />
            </button>

            <!-- Add Project Button -->
            <button
              type="button"
              class="p-1 rounded-lg text-slate-400 hover:text-emerald-300 hover:bg-emerald-500/20 transition-all cursor-pointer"
              :title="t('common.create') || 'Add Project'"
              @click="handleAddProject"
            >
              <Plus class="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <!-- Projects Sub-list -->
        <div
          v-if="isProjectsExpanded && sidebarGroups.length > 0"
          class="ml-3 pl-3 border-l border-slate-800/80 space-y-0.5 py-1"
        >
          <template
            v-for="({ group, visibleProjects, hiddenProjects }, groupIndex) in sidebarGroups"
            :key="group.id"
          >
            <!-- System Group (Ungrouped) -->
            <template v-if="group.is_system">
              <div
                v-if="
                  group.hidden &&
                  !sidebarGroups
                    .slice(0, groupIndex)
                    .some((section) => section.group.hidden)
                "
                role="separator"
                :aria-label="t('projectGroups.hiddenGroups')"
                class="mb-1.5 flex items-center gap-1.5 px-2.5 text-[10px] font-semibold text-slate-500"
              >
                <EyeOff class="h-3 w-3" aria-hidden="true" />
                <span>{{ t("projectGroups.hiddenGroups") }}</span>
              </div>

              <!-- Visible Projects -->
              <button
                v-for="project in visibleProjects"
                :key="project.id"
                type="button"
                :title="project.path"
                :class="[
                  'group/proj flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all duration-150 cursor-pointer',
                  effectiveCurrentPage === 'projects' &&
                  effectiveSelectedProjectId === project.id
                    ? 'border border-emerald-500/30 bg-emerald-600/20 font-semibold text-emerald-300'
                    : project.hidden
                      ? 'text-slate-500 hover:bg-slate-900/60 hover:text-slate-300'
                      : 'text-slate-400 hover:bg-slate-900/60 hover:text-slate-200',
                ]"
                @click="handleSelectProject(project.id)"
              >
                <div class="flex min-w-0 items-center gap-1.5">
                  <EyeOff
                    v-if="project.hidden"
                    class="h-3 w-3 shrink-0"
                    aria-hidden="true"
                  />
                  <span class="truncate">{{ project.name }}</span>
                </div>
                <div class="ml-1.5 flex shrink-0 items-center gap-1.5">
                  <span
                    :class="[
                      'rounded-full border px-1.5 py-0.5 font-mono text-[10px] transition-colors',
                      effectiveCurrentPage === 'projects' &&
                      effectiveSelectedProjectId === project.id
                        ? 'border-emerald-500/30 bg-emerald-500/20 font-semibold text-emerald-300'
                        : 'border-slate-800 bg-slate-900 text-slate-400 group-hover/proj:border-slate-700',
                    ]"
                    :title="`${getProjectSkillCount(project, effectivePresets)} skill(s)`"
                  >
                    {{ getProjectSkillCount(project, effectivePresets) }}
                  </span>
                  <span
                    v-if="!project.path_exists"
                    title="Project directory missing"
                    class="shrink-0"
                  >
                    <AlertTriangle class="h-3 w-3 text-amber-400" />
                  </span>
                </div>
              </button>

              <!-- Hidden Projects Divider and Items -->
              <template
                v-if="effectiveShowHiddenProjects && hiddenProjects.length > 0"
              >
                <div
                  role="separator"
                  :aria-label="
                    t('projectGroups.hiddenProjectsInGroup', {
                      name: t('projectGroups.ungrouped'),
                    })
                  "
                  class="my-1.5 border-t border-dashed border-slate-800/90"
                />
                <button
                  v-for="project in hiddenProjects"
                  :key="project.id"
                  type="button"
                  :title="project.path"
                  :class="[
                    'group/proj flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all duration-150 cursor-pointer',
                    effectiveCurrentPage === 'projects' &&
                    effectiveSelectedProjectId === project.id
                      ? 'border border-emerald-500/30 bg-emerald-600/20 font-semibold text-emerald-300'
                      : 'text-slate-500 hover:bg-slate-900/60 hover:text-slate-300',
                  ]"
                  @click="handleSelectProject(project.id)"
                >
                  <div class="flex min-w-0 items-center gap-1.5">
                    <EyeOff class="h-3 w-3 shrink-0" aria-hidden="true" />
                    <span class="truncate">{{ project.name }}</span>
                  </div>
                  <div class="ml-1.5 flex shrink-0 items-center gap-1.5">
                    <span
                      class="rounded-full border border-slate-800 bg-slate-900 text-slate-400 px-1.5 py-0.5 font-mono text-[10px]"
                    >
                      {{ getProjectSkillCount(project, effectivePresets) }}
                    </span>
                  </div>
                </button>
              </template>
            </template>

            <!-- Custom User Project Group (rendered as section / role="region") -->
            <section
              v-else
              :aria-label="group.name ?? ''"
              :class="
                groupIndex > 0
                  ? 'mt-2 border-t border-dashed border-slate-700/80 pt-2'
                  : ''
              "
            >
              <div
                v-if="
                  group.hidden &&
                  !sidebarGroups
                    .slice(0, groupIndex)
                    .some((section) => section.group.hidden)
                "
                role="separator"
                :aria-label="t('projectGroups.hiddenGroups')"
                class="mb-1.5 flex items-center gap-1.5 px-2.5 text-[10px] font-semibold text-slate-500"
              >
                <EyeOff class="h-3 w-3" aria-hidden="true" />
                <span>{{ t("projectGroups.hiddenGroups") }}</span>
              </div>

              <div
                class="mb-1 flex min-w-0 items-center gap-1.5 px-2.5 text-[10px] font-semibold text-slate-500"
              >
                <EyeOff v-if="group.hidden" class="h-3 w-3 shrink-0" aria-hidden="true" />
                <FolderTree v-else class="h-3 w-3 shrink-0" aria-hidden="true" />
                <span class="truncate" :title="group.name ?? ''">
                  {{ group.name }}
                </span>
              </div>

              <!-- Visible Projects in Group -->
              <button
                v-for="project in visibleProjects"
                :key="project.id"
                type="button"
                :title="project.path"
                :class="[
                  'group/proj flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all duration-150 cursor-pointer',
                  effectiveCurrentPage === 'projects' &&
                  effectiveSelectedProjectId === project.id
                    ? 'border border-emerald-500/30 bg-emerald-600/20 font-semibold text-emerald-300'
                    : project.hidden
                      ? 'text-slate-500 hover:bg-slate-900/60 hover:text-slate-300'
                      : 'text-slate-400 hover:bg-slate-900/60 hover:text-slate-200',
                ]"
                @click="handleSelectProject(project.id)"
              >
                <div class="flex min-w-0 items-center gap-1.5">
                  <EyeOff
                    v-if="project.hidden"
                    class="h-3 w-3 shrink-0"
                    aria-hidden="true"
                  />
                  <span class="truncate">{{ project.name }}</span>
                </div>
                <div class="ml-1.5 flex shrink-0 items-center gap-1.5">
                  <span
                    :class="[
                      'rounded-full border px-1.5 py-0.5 font-mono text-[10px] transition-colors',
                      effectiveCurrentPage === 'projects' &&
                      effectiveSelectedProjectId === project.id
                        ? 'border-emerald-500/30 bg-emerald-500/20 font-semibold text-emerald-300'
                        : 'border-slate-800 bg-slate-900 text-slate-400 group-hover/proj:border-slate-700',
                    ]"
                    :title="`${getProjectSkillCount(project, effectivePresets)} skill(s)`"
                  >
                    {{ getProjectSkillCount(project, effectivePresets) }}
                  </span>
                  <span
                    v-if="!project.path_exists"
                    title="Project directory missing"
                    class="shrink-0"
                  >
                    <AlertTriangle class="h-3 w-3 text-amber-400" />
                  </span>
                </div>
              </button>

              <!-- Hidden Projects in Group -->
              <template
                v-if="effectiveShowHiddenProjects && hiddenProjects.length > 0"
              >
                <div
                  role="separator"
                  :aria-label="
                    t('projectGroups.hiddenProjectsInGroup', {
                      name: group.name ?? '',
                    })
                  "
                  class="my-1.5 border-t border-dashed border-slate-800/90"
                />
                <button
                  v-for="project in hiddenProjects"
                  :key="project.id"
                  type="button"
                  :title="project.path"
                  :class="[
                    'group/proj flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all duration-150 cursor-pointer',
                    effectiveCurrentPage === 'projects' &&
                    effectiveSelectedProjectId === project.id
                      ? 'border border-emerald-500/30 bg-emerald-600/20 font-semibold text-emerald-300'
                      : 'text-slate-500 hover:bg-slate-900/60 hover:text-slate-300',
                  ]"
                  @click="handleSelectProject(project.id)"
                >
                  <div class="flex min-w-0 items-center gap-1.5">
                    <EyeOff class="h-3 w-3 shrink-0" aria-hidden="true" />
                    <span class="truncate">{{ project.name }}</span>
                  </div>
                  <div class="ml-1.5 flex shrink-0 items-center gap-1.5">
                    <span
                      class="rounded-full border border-slate-800 bg-slate-900 text-slate-400 px-1.5 py-0.5 font-mono text-[10px]"
                    >
                      {{ getProjectSkillCount(project, effectivePresets) }}
                    </span>
                  </div>
                </button>
              </template>
            </section>
          </template>
        </div>
      </div>
    </div>

    <!-- Region 2: Navigation & Tools (Fixed Bottom) -->
    <div class="shrink-0 p-3 space-y-1 border-t border-slate-800/80 bg-slate-950">
      <nav class="space-y-1">
        <!-- Market, Presets, Installed -->
        <button
          v-for="item in NAV_ITEMS"
          :key="item.key"
          type="button"
          :class="[
            'w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 group cursor-pointer',
            effectiveCurrentPage === item.key
              ? 'bg-emerald-600/15 text-emerald-400 border border-emerald-500/30 shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/80',
          ]"
          @click="handleSelectPage(item.key)"
        >
          <div class="flex items-center gap-3 w-full">
            <span
              :class="[
                'transition-colors',
                effectiveCurrentPage === item.key
                  ? 'text-emerald-400'
                  : 'text-slate-400 group-hover:text-slate-300',
              ]"
            >
              <component :is="item.icon" class="w-4 h-4" />
            </span>
            <span>{{ t(`nav.${item.key}`) }}</span>

            <!-- Updatable badge for Installed page -->
            <span
              v-if="item.key === 'installed' && skillUpdateStore.updatableCount > 0"
              class="shrink-0 flex items-center justify-center min-w-[20px] h-[20px] px-1.5 ml-auto bg-red-500 text-white text-xs font-bold rounded-full shadow-lg shadow-red-500/30 animate-pulse font-mono"
            >
              {{
                skillUpdateStore.updatableCount > 99
                  ? "99+"
                  : skillUpdateStore.updatableCount
              }}
            </span>
          </div>
        </button>

        <!-- Tools Dropdown Menu -->
        <div class="relative">
          <button
            ref="toolsButtonRef"
            type="button"
            :class="[
              'w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 group cursor-pointer',
              effectiveCurrentPage === 'tools' ||
              effectiveCurrentPage === 'agents' ||
              effectiveCurrentPage === 'migration'
                ? 'bg-emerald-600/15 text-emerald-400 border border-emerald-500/30 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/80',
            ]"
            @click="isToolsExpanded = !isToolsExpanded"
          >
            <div class="flex items-center gap-3">
              <span
                :class="[
                  'transition-colors',
                  effectiveCurrentPage === 'tools' ||
                  effectiveCurrentPage === 'agents' ||
                  effectiveCurrentPage === 'migration'
                    ? 'text-emerald-400'
                    : 'text-slate-400 group-hover:text-slate-300',
                ]"
              >
                <MoreVertical class="w-4 h-4" />
              </span>
              <span>{{ t("nav.tools") }}</span>
            </div>
            <ChevronDown
              :class="[
                'w-3.5 h-3.5 text-slate-400 transition-transform duration-150',
                isToolsExpanded && 'rotate-180',
              ]"
            />
          </button>

          <!-- Dropdown Panel -->
          <div
            v-if="isToolsExpanded"
            class="absolute bottom-full left-0 right-0 mb-1 mx-3 rounded-xl bg-slate-900 border border-slate-700 shadow-xl shadow-slate-900/50 overflow-hidden z-30"
            data-tools-dropdown
          >
            <div class="py-1">
              <button
                v-for="toolItem in TOOLS_NAV_ITEMS"
                :key="toolItem.key"
                type="button"
                :class="[
                  'w-full flex items-center justify-between px-3 py-2.5 text-sm font-medium transition-all duration-150 cursor-pointer',
                  effectiveCurrentPage === toolItem.key
                    ? 'bg-emerald-600/20 text-emerald-300'
                    : 'text-slate-300 hover:bg-slate-800',
                ]"
                @click="
                  () => {
                    handleSelectPage(toolItem.key);
                    isToolsExpanded = false;
                  }
                "
              >
                <div class="flex items-center gap-2.5">
                  <component :is="toolItem.icon" class="w-4 h-4 shrink-0" />
                  <span>{{ t(`nav.${toolItem.key}`) }}</span>
                </div>
              </button>
            </div>
          </div>
        </div>

        <!-- Task Queue launcher button & panel -->
        <SkillInstallQueue />

        <!-- Settings (always at the bottom) -->
        <button
          type="button"
          :class="[
            'w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 group cursor-pointer',
            effectiveCurrentPage === 'settings'
              ? 'bg-emerald-600/15 text-emerald-400 border border-emerald-500/30 shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/80',
          ]"
          @click="handleSelectPage('settings')"
        >
          <div class="flex items-center gap-3">
            <span
              :class="[
                'transition-colors',
                effectiveCurrentPage === 'settings'
                  ? 'text-emerald-400'
                  : 'text-slate-400 group-hover:text-slate-300',
              ]"
            >
              <SettingsIcon class="w-4 h-4" />
            </span>
            <span>{{ t("nav.settings") }}</span>
          </div>
        </button>
      </nav>
    </div>
  </aside>
</template>
