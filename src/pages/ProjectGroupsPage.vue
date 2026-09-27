<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { useI18n } from "vue-i18n";
import {
  AlertCircle,
  ArrowDownToLine,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  FolderInput,
  FolderTree,
  FolderX,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-vue-next";
import { api, errorMessage } from "@/api";
import type { Project, ProjectGroup } from "@/types";
import Badge from "@/components/ui/Badge.vue";
import Button from "@/components/ui/Button.vue";
import Input from "@/components/ui/Input.vue";
import Dialog from "@/components/ui/Dialog.vue";
import { useProjectStore } from "@/stores/project";
import { useDebounce } from "@/utils/debounce";

export interface ProjectGroupsPageProps {
  projects?: Project[];
  projectGroups?: ProjectGroup[];
  onReloadProjects?: () => Promise<void>;
}

const props = withDefaults(defineProps<ProjectGroupsPageProps>(), {
  projects: undefined,
  projectGroups: undefined,
  onReloadProjects: undefined,
});

const emit = defineEmits<{
  (e: "reloadProjects"): void;
}>();

const { t } = useI18n();
const projectStore = useProjectStore();

const effectiveProjects = computed(() => props.projects ?? projectStore.projects);
const effectiveProjectGroups = computed(
  () => props.projectGroups ?? projectStore.projectGroups,
);

const manageableGroups = computed(() =>
  effectiveProjectGroups.value.filter((group) => !group.is_system),
);

const activeGroupId = ref<number | null>(null);

// Initialize active group
watch(
  manageableGroups,
  (groups) => {
    if (activeGroupId.value === null && groups.length > 0) {
      activeGroupId.value = groups[0].id;
    } else if (
      activeGroupId.value !== null &&
      !groups.some((g) => g.id === activeGroupId.value)
    ) {
      activeGroupId.value = groups.length > 0 ? groups[0].id : null;
    }
  },
  { immediate: true },
);

const activeGroup = computed(() => {
  if (activeGroupId.value === null) return manageableGroups.value[0] ?? null;
  return (
    manageableGroups.value.find((group) => group.id === activeGroupId.value) ??
    manageableGroups.value[0] ??
    null
  );
});

const activeGroupName = computed(() => (activeGroup.value ? groupLabel(activeGroup.value) : ""));

const searchQuery = ref("");
const debouncedSearch = useDebounce(searchQuery, 150);

const selectedInsideIds = ref<Set<number>>(new Set());
const selectedUngroupedIds = ref<Set<number>>(new Set());

const pendingAction = ref<string | null>(null);
const busy = computed(() => pendingAction.value !== null);
const error = ref<string | null>(null);
const announcement = ref("");

type GroupModal =
  | { mode: "create" }
  | { mode: "edit"; group: ProjectGroup };

const groupModal = ref<GroupModal | null>(null);
const groupName = ref("");
const deleteGroupTarget = ref<ProjectGroup | null>(null);

const groupsById = computed(
  () => new Map(effectiveProjectGroups.value.map((group) => [group.id, group])),
);

function groupLabel(group: ProjectGroup): string {
  return group.is_system ? t("projectGroups.ungrouped") : group.name ?? "";
}

const normalizedSearch = computed(() => debouncedSearch.value.trim().toLocaleLowerCase());

const filteredProjects = computed(() => {
  const query = normalizedSearch.value;
  if (!query) return effectiveProjects.value;
  return effectiveProjects.value.filter((project) => {
    const group = groupsById.value.get(project.group_id);
    const gName = group
      ? group.is_system
        ? t("projectGroups.ungrouped")
        : group.name ?? ""
      : "";
    return [project.name, project.path, gName].some((value) =>
      value.toLocaleLowerCase().includes(query),
    );
  });
});

const insideProjects = computed(() => {
  if (!activeGroup.value) return [];
  return filteredProjects.value.filter(
    (project) => project.group_id === activeGroup.value!.id,
  );
});

const ungroupedProjects = computed(() =>
  filteredProjects.value.filter((project) => project.group_id === 0),
);

const projectCountByGroup = computed(() => {
  const counts = new Map<number, number>();
  for (const project of effectiveProjects.value) {
    counts.set(project.group_id, (counts.get(project.group_id) ?? 0) + 1);
  }
  return counts;
});

const allInsideSelected = computed(
  () =>
    insideProjects.value.length > 0 &&
    insideProjects.value.every(({ id }) => selectedInsideIds.value.has(id)),
);

const someInsideSelected = computed(() =>
  insideProjects.value.some(({ id }) => selectedInsideIds.value.has(id)),
);

const allUngroupedSelected = computed(
  () =>
    ungroupedProjects.value.length > 0 &&
    ungroupedProjects.value.every(({ id }) => selectedUngroupedIds.value.has(id)),
);

const someUngroupedSelected = computed(() =>
  ungroupedProjects.value.some(({ id }) => selectedUngroupedIds.value.has(id)),
);

function changeActiveGroup(groupId: number | null) {
  activeGroupId.value = groupId;
  selectedInsideIds.value = new Set();
  selectedUngroupedIds.value = new Set();
  error.value = null;
  announcement.value = "";
}

function toggleInside(projectId: number) {
  const next = new Set(selectedInsideIds.value);
  if (next.has(projectId)) next.delete(projectId);
  else next.add(projectId);
  selectedInsideIds.value = next;
}

function toggleUngrouped(projectId: number) {
  const next = new Set(selectedUngroupedIds.value);
  if (next.has(projectId)) next.delete(projectId);
  else next.add(projectId);
  selectedUngroupedIds.value = next;
}

function toggleAllInside(allSelected: boolean) {
  const next = new Set(selectedInsideIds.value);
  for (const project of insideProjects.value) {
    if (allSelected) next.delete(project.id);
    else next.add(project.id);
  }
  selectedInsideIds.value = next;
}

function toggleAllUngrouped(allSelected: boolean) {
  const next = new Set(selectedUngroupedIds.value);
  for (const project of ungroupedProjects.value) {
    if (allSelected) next.delete(project.id);
    else next.add(project.id);
  }
  selectedUngroupedIds.value = next;
}

async function reload() {
  if (props.onReloadProjects) {
    await props.onReloadProjects();
  } else {
    await projectStore.reloadProjects();
  }
  emit("reloadProjects");
}

async function runAction(
  key: string,
  action: () => Promise<unknown>,
  refresh = true,
): Promise<boolean> {
  if (pendingAction.value !== null) return false;
  error.value = null;
  announcement.value = "";
  pendingAction.value = key;
  try {
    await action();
    if (refresh) await reload();
    return true;
  } catch (actionError) {
    error.value = errorMessage(actionError);
    return false;
  } finally {
    pendingAction.value = null;
  }
}

async function moveProjects(
  selectedIds: ReadonlySet<number>,
  targetGroupId: number,
  key: string,
) {
  const orderedIds = effectiveProjects.value
    .filter(({ id }) => selectedIds.has(id))
    .map(({ id }) => id);
  if (orderedIds.length === 0) return;

  let moved = 0;
  const success = await runAction(key, async () => {
    moved = await api.setProjectsGroup(orderedIds, targetGroupId);
  });
  if (!success) return;

  selectedInsideIds.value = new Set();
  selectedUngroupedIds.value = new Set();
  announcement.value = t("projectGroups.movedAnnouncement", { count: moved });
}

function openCreateGroup() {
  groupName.value = "";
  groupModal.value = { mode: "create" };
}

function openEditGroup(group: ProjectGroup) {
  groupName.value = group.name ?? "";
  groupModal.value = { mode: "edit", group };
}

async function submitGroup() {
  if (!groupModal.value || !groupName.value.trim()) return;
  const currentModal = groupModal.value;
  const success = await runAction("save-group", async () => {
    if (currentModal.mode === "create") {
      await api.createProjectGroup(groupName.value.trim());
    } else {
      await api.updateProjectGroup(currentModal.group.id, groupName.value.trim());
    }
  });
  if (!success) return;
  groupModal.value = null;
}

async function deleteGroup() {
  if (!deleteGroupTarget.value) return;
  const deletedId = deleteGroupTarget.value.id;
  const success = await runAction("delete-group", () =>
    api.deleteProjectGroup(deletedId),
  );
  if (!success) return;
  deleteGroupTarget.value = null;
  if (activeGroup.value?.id === deletedId) {
    const fallback = manageableGroups.value.find(({ id }) => id !== deletedId);
    changeActiveGroup(fallback?.id ?? null);
  }
}

const groupActionButtonClass =
  "flex h-6 w-6 cursor-pointer items-center justify-center rounded p-1 text-slate-400 transition-colors duration-150 hover:bg-slate-800/60 hover:text-emerald-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60 disabled:cursor-not-allowed disabled:opacity-25 motion-reduce:transition-none";
</script>

<template>
  <div class="space-y-4">
    <div
      v-if="error"
      role="alert"
      class="flex items-center gap-2 border-y border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300"
    >
      <AlertCircle class="h-4 w-4 shrink-0" />
      <span>{{ error }}</span>
    </div>

    <p aria-live="polite" class="sr-only">{{ announcement }}</p>

    <div
      v-if="activeGroup"
      class="grid min-h-[34rem] grid-cols-1 gap-4 lg:grid-cols-[296px_minmax(0,1fr)]"
    >
      <!-- Groups Sidebar -->
      <aside :aria-label="t('projectGroups.manageTab')" class="border border-slate-800/80 bg-slate-950/25">
        <div class="flex min-h-14 items-center justify-between border-b border-slate-800/80 px-3">
          <h2 class="text-sm font-semibold text-slate-200">
            {{ t("projectGroups.groupsTitle") }}
          </h2>
          <Button
            variant="ghost"
            size="sm"
            :aria-label="t('projectGroups.create')"
            :title="t('projectGroups.create')"
            class="h-9 w-9 p-0"
            @click="openCreateGroup"
          >
            <template #icon>
              <Plus class="h-4 w-4" />
            </template>
          </Button>
        </div>

        <ul class="max-h-[38rem] space-y-2 overflow-y-auto py-3">
          <li
            v-for="group in manageableGroups"
            :key="group.id"
            :class="[
              'group/group-item relative h-[90px] w-full rounded-xl border p-3.5 transition-all duration-150 focus-within:border-emerald-500/40 motion-reduce:transition-none',
              group.id === activeGroup.id
                ? 'border-emerald-500/30 bg-slate-900/60 hover:border-emerald-500/40'
                : 'border-slate-800/80 bg-slate-950/40 hover:border-slate-700 hover:bg-slate-900/60',
            ]"
          >
            <div
              v-if="group.id === activeGroup.id"
              class="absolute bottom-2 left-0 top-2 w-1 rounded-r-full bg-emerald-500/60"
            />
            <div class="absolute right-3.5 top-3.5">
              <Badge
                :variant="group.id === activeGroup.id ? 'info' : 'neutral'"
                class="px-1.5 py-0 text-[10px]"
              >
                {{ projectCountByGroup.get(group.id) ?? 0 }}
              </Badge>
            </div>

            <button
              type="button"
              :aria-label="groupLabel(group)"
              :aria-pressed="group.id === activeGroup.id"
              class="flex min-h-7 w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1 pr-9 text-left transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60 motion-reduce:transition-none"
              @click="changeActiveGroup(group.id)"
            >
              <EyeOff v-if="group.hidden" class="h-4 w-4 shrink-0 text-slate-500" />
              <FolderTree
                v-else
                :class="[
                  'h-4 w-4 shrink-0',
                  group.id === activeGroup.id ? 'text-emerald-400' : 'text-slate-500',
                ]"
              />
              <span
                :class="[
                  'min-w-0 flex-1 truncate text-sm',
                  group.id === activeGroup.id
                    ? 'font-semibold text-slate-100'
                    : 'text-slate-300',
                ]"
                :title="groupLabel(group)"
              >
                {{ groupLabel(group) }}
              </span>
            </button>

            <!-- Group Actions -->
            <div
              v-if="!group.is_system"
              role="group"
              :aria-label="t('projectGroups.operations', { name: groupLabel(group) })"
              class="mt-2 flex min-h-6 flex-wrap items-center gap-0.5 pl-1 opacity-0 transition-opacity group-hover/group-item:opacity-100 group-focus-within/group-item:opacity-100 [@media(hover:none)]:opacity-100 motion-reduce:transition-none"
            >
              <button
                type="button"
                :title="t('projects.moveUp')"
                :aria-label="t('projects.moveUp')"
                :disabled="
                  manageableGroups.filter((c) => c.hidden === group.hidden).findIndex((c) => c.id === group.id) <= 0 ||
                  busy
                "
                :class="groupActionButtonClass"
                @click="void runAction('move-group', () => api.moveProjectGroup(group.id, 'up'))"
              >
                <ChevronUp class="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                :title="t('projects.moveDown')"
                :aria-label="t('projects.moveDown')"
                :disabled="
                  manageableGroups.filter((c) => c.hidden === group.hidden).findIndex((c) => c.id === group.id) ===
                    manageableGroups.filter((c) => c.hidden === group.hidden).length - 1 ||
                  busy
                "
                :class="groupActionButtonClass"
                @click="void runAction('move-group', () => api.moveProjectGroup(group.id, 'down'))"
              >
                <ChevronDown class="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                :title="t(group.hidden ? 'projectGroups.showInSidebar' : 'projectGroups.hideFromSidebar')"
                :aria-label="t(group.hidden ? 'projectGroups.showInSidebar' : 'projectGroups.hideFromSidebar')"
                :disabled="busy"
                :class="groupActionButtonClass"
                @click="void runAction('hide-group', () => api.setProjectGroupHidden(group.id, !group.hidden))"
              >
                <EyeOff v-if="group.hidden" class="h-3.5 w-3.5" />
                <Eye v-else class="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                :title="t('common.edit')"
                :aria-label="t('common.edit')"
                :class="groupActionButtonClass"
                @click="openEditGroup(group)"
              >
                <Pencil class="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                :title="t('common.delete')"
                :aria-label="t('common.delete')"
                :class="[groupActionButtonClass, 'hover:bg-rose-500/10 hover:text-rose-300']"
                @click="deleteGroupTarget = group"
              >
                <Trash2 class="h-3.5 w-3.5" />
              </button>
            </div>
          </li>
        </ul>
      </aside>

      <!-- Active Group Detail Area -->
      <section aria-labelledby="active-project-group-heading" class="min-w-0 space-y-4">
        <div class="flex flex-col gap-3 border-y border-slate-800/80 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div class="min-w-0">
            <h2 id="active-project-group-heading" class="truncate text-base font-semibold text-slate-100">
              {{ activeGroupName }}
            </h2>
            <p class="mt-0.5 text-xs tabular-nums text-slate-500">
              {{ t("projectGroups.projectCount", { count: projectCountByGroup.get(activeGroup.id) ?? 0 }) }}
            </p>
          </div>

          <div class="w-full sm:max-w-sm">
            <Input
              v-model="searchQuery"
              :placeholder="t('projectGroups.searchPlaceholder')"
              :aria-label="t('projectGroups.searchPlaceholder')"
            >
              <template #icon>
                <Search class="h-4 w-4" />
              </template>
              <template v-if="searchQuery" #rightElement>
                <button
                  type="button"
                  class="cursor-pointer text-xs text-slate-400 hover:text-slate-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60"
                  @click="searchQuery = ''"
                >
                  {{ t("common.clear") }}
                </button>
              </template>
            </Input>
          </div>
        </div>

        <div class="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <!-- Inside Projects Column -->
          <section aria-labelledby="inside-projects-heading" class="min-w-0 border border-slate-800/80 bg-slate-950/20">
            <div class="flex min-h-14 items-center gap-3 border-b border-slate-800/80 px-3">
              <input
                type="checkbox"
                :checked="allInsideSelected"
                :disabled="insideProjects.length === 0 || busy"
                :aria-label="t('projectGroups.selectAllInside')"
                class="h-4 w-4 shrink-0 cursor-pointer rounded border-slate-600 bg-slate-900 accent-emerald-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/70 disabled:cursor-not-allowed disabled:opacity-40"
                :ref="(el) => { if (el) (el as HTMLInputElement).indeterminate = !allInsideSelected && someInsideSelected }"
                @change="toggleAllInside(allInsideSelected)"
              />
              <h3 id="inside-projects-heading" class="min-w-0 flex-1 truncate text-sm font-semibold text-slate-200">
                {{ t("projectGroups.insideTitle", { name: activeGroupName }) }}
              </h3>
              <span class="font-mono text-xs tabular-nums text-slate-500">
                {{ insideProjects.length }}
              </span>
            </div>

            <div class="h-[25rem] overflow-y-auto">
              <p
                v-if="insideProjects.length === 0"
                class="px-4 py-10 text-center text-sm text-slate-500"
              >
                {{ normalizedSearch ? t("projectGroups.noSearchResults") : t("projectGroups.noInsideProjects") }}
              </p>
              <label
                v-for="project in insideProjects"
                :key="project.id"
                :class="[
                  'flex min-h-16 cursor-pointer items-center gap-3 border-b border-slate-800/70 px-3 py-2.5 transition-colors duration-150 last:border-b-0 hover:bg-slate-900/55 motion-reduce:transition-none',
                  selectedInsideIds.has(project.id) ? 'bg-emerald-500/[0.07]' : '',
                  busy ? 'cursor-not-allowed opacity-60' : '',
                ]"
              >
                <input
                  type="checkbox"
                  :checked="selectedInsideIds.has(project.id)"
                  :disabled="busy"
                  :aria-label="project.name"
                  class="h-4 w-4 shrink-0 cursor-pointer rounded border-slate-600 bg-slate-900 accent-emerald-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/70 disabled:cursor-not-allowed disabled:opacity-40"
                  @change="toggleInside(project.id)"
                />
                <div class="min-w-0 flex-1">
                  <div class="flex min-w-0 flex-wrap items-center gap-1.5">
                    <span class="truncate text-sm font-medium text-slate-200">
                      {{ project.name }}
                    </span>
                    <Badge v-if="project.hidden" variant="neutral">
                      {{ t("projects.hiddenFromSidebar") }}
                    </Badge>
                    <Badge v-if="!project.path_exists" variant="danger">
                      <FolderX class="h-3 w-3" />
                      <span>{{ t("projects.pathMissing") }}</span>
                    </Badge>
                  </div>
                  <p class="mt-1 truncate font-mono text-xs text-slate-500" :title="project.path">
                    {{ project.path }}
                  </p>
                </div>
              </label>
            </div>

            <div class="flex min-h-14 items-center justify-between gap-2 border-t border-slate-800/80 px-3 py-2">
              <span class="text-xs tabular-nums text-slate-500">
                {{ t("projectGroups.selectedCount", { count: selectedInsideIds.size }) }}
              </span>
              <Button
                variant="outline"
                size="sm"
                :loading="pendingAction === 'move-to-ungrouped'"
                :disabled="selectedInsideIds.size === 0 || busy"
                @click="void moveProjects(selectedInsideIds, 0, 'move-to-ungrouped')"
              >
                <template #icon>
                  <ArrowDownToLine class="h-4 w-4" />
                </template>
                {{ t("projectGroups.moveToUngrouped", { count: selectedInsideIds.size }) }}
              </Button>
            </div>
          </section>

          <!-- Ungrouped Projects Column -->
          <section aria-labelledby="ungrouped-projects-heading" class="min-w-0 border border-slate-800/80 bg-slate-950/20">
            <div class="flex min-h-14 items-center gap-3 border-b border-slate-800/80 px-3">
              <input
                type="checkbox"
                :checked="allUngroupedSelected"
                :disabled="ungroupedProjects.length === 0 || busy"
                :aria-label="t('projectGroups.selectAllUngrouped')"
                class="h-4 w-4 shrink-0 cursor-pointer rounded border-slate-600 bg-slate-900 accent-emerald-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/70 disabled:cursor-not-allowed disabled:opacity-40"
                :ref="(el) => { if (el) (el as HTMLInputElement).indeterminate = !allUngroupedSelected && someUngroupedSelected }"
                @change="toggleAllUngrouped(allUngroupedSelected)"
              />
              <h3 id="ungrouped-projects-heading" class="min-w-0 flex-1 truncate text-sm font-semibold text-slate-200">
                {{ t("projectGroups.ungroupedProjectsTitle") }}
              </h3>
              <span class="font-mono text-xs tabular-nums text-slate-500">
                {{ ungroupedProjects.length }}
              </span>
            </div>

            <div class="h-[25rem] overflow-y-auto">
              <p
                v-if="ungroupedProjects.length === 0"
                class="px-4 py-10 text-center text-sm text-slate-500"
              >
                {{ normalizedSearch ? t("projectGroups.noSearchResults") : t("projectGroups.noUngroupedProjects") }}
              </p>
              <label
                v-for="project in ungroupedProjects"
                :key="project.id"
                :class="[
                  'flex min-h-16 cursor-pointer items-center gap-3 border-b border-slate-800/70 px-3 py-2.5 transition-colors duration-150 last:border-b-0 hover:bg-slate-900/55 motion-reduce:transition-none',
                  selectedUngroupedIds.has(project.id) ? 'bg-emerald-500/[0.07]' : '',
                  busy ? 'cursor-not-allowed opacity-60' : '',
                ]"
              >
                <input
                  type="checkbox"
                  :checked="selectedUngroupedIds.has(project.id)"
                  :disabled="busy"
                  :aria-label="project.name"
                  class="h-4 w-4 shrink-0 cursor-pointer rounded border-slate-600 bg-slate-900 accent-emerald-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/70 disabled:cursor-not-allowed disabled:opacity-40"
                  @change="toggleUngrouped(project.id)"
                />
                <div class="min-w-0 flex-1">
                  <div class="flex min-w-0 flex-wrap items-center gap-1.5">
                    <span class="truncate text-sm font-medium text-slate-200">
                      {{ project.name }}
                    </span>
                    <Badge v-if="project.hidden" variant="neutral">
                      {{ t("projects.hiddenFromSidebar") }}
                    </Badge>
                    <Badge v-if="!project.path_exists" variant="danger">
                      <FolderX class="h-3 w-3" />
                      <span>{{ t("projects.pathMissing") }}</span>
                    </Badge>
                  </div>
                  <p class="mt-1 truncate font-mono text-xs text-slate-500" :title="project.path">
                    {{ project.path }}
                  </p>
                </div>
              </label>
            </div>

            <div class="flex min-h-14 items-center justify-between gap-2 border-t border-slate-800/80 px-3 py-2">
              <span class="text-xs tabular-nums text-slate-500">
                {{ t("projectGroups.selectedCount", { count: selectedUngroupedIds.size }) }}
              </span>
              <Button
                variant="primary"
                size="sm"
                :loading="pendingAction === 'move-into-group'"
                :disabled="selectedUngroupedIds.size === 0 || busy"
                @click="void moveProjects(selectedUngroupedIds, activeGroup.id, 'move-into-group')"
              >
                <template #icon>
                  <FolderInput class="h-4 w-4" />
                </template>
                {{ t("projectGroups.moveIntoGroup", { count: selectedUngroupedIds.size, name: activeGroupName }) }}
              </Button>
            </div>
          </section>
        </div>
      </section>
    </div>

    <!-- Empty State -->
    <div
      v-else
      class="flex min-h-[34rem] flex-col items-center justify-center gap-4 border-y border-slate-800/70 px-6 text-center"
    >
      <FolderTree class="h-8 w-8 text-slate-500" />
      <p class="text-sm text-slate-400">{{ t("projectGroups.noGroups") }}</p>
      <Button variant="primary" @click="openCreateGroup">
        <template #icon>
          <Plus class="h-4 w-4" />
        </template>
        {{ t("projectGroups.create") }}
      </Button>
    </div>

    <!-- Group Create / Edit Dialog -->
    <Dialog
      :open="groupModal !== null"
      :title="t(groupModal?.mode === 'edit' ? 'projectGroups.editTitle' : 'projectGroups.createTitle')"
      @close="groupModal = null"
    >
      <div class="space-y-3">
        <label for="managed-project-group-name" class="block text-xs font-medium text-slate-400">
          {{ t("projectGroups.name") }}
        </label>
        <Input
          id="managed-project-group-name"
          v-model="groupName"
          maxlength="50"
          autofocus
          :placeholder="t('projectGroups.namePlaceholder')"
          @keydown.enter="void submitGroup()"
        />
      </div>

      <template #footer>
        <Button variant="ghost" @click="groupModal = null">
          {{ t("common.cancel") }}
        </Button>
        <Button
          variant="primary"
          :loading="pendingAction === 'save-group'"
          :disabled="!groupName.trim()"
          @click="submitGroup"
        >
          {{ t(groupModal?.mode === 'edit' ? 'common.save' : 'common.create') }}
        </Button>
      </template>
    </Dialog>

    <!-- Delete Confirmation Dialog -->
    <Dialog
      :open="deleteGroupTarget !== null"
      :title="t('projectGroups.deleteTitle')"
      @close="deleteGroupTarget = null"
    >
      <p v-if="deleteGroupTarget" class="text-sm leading-relaxed text-slate-300">
        {{
          t("projectGroups.deleteConfirm", {
            name: groupLabel(deleteGroupTarget),
            count: projectCountByGroup.get(deleteGroupTarget.id) ?? 0,
          })
        }}
      </p>

      <template #footer>
        <Button variant="ghost" @click="deleteGroupTarget = null">
          {{ t("common.cancel") }}
        </Button>
        <Button
          variant="danger"
          :loading="pendingAction === 'delete-group'"
          @click="deleteGroup"
        >
          <template #icon>
            <Trash2 class="h-4 w-4" />
          </template>
          {{ t("common.delete") }}
        </Button>
      </template>
    </Dialog>
  </div>
</template>
