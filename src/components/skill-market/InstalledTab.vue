<script setup lang="ts">
import { ref, computed } from "vue";
import { useI18n } from "vue-i18n";
import {
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  FolderTree,
  Globe,
  HardDrive,
  LayoutList,
  Loader2,
  Search,
  Sparkles,
  X,
  XCircle,
} from "lucide-vue-next";
import type { ListedSkill, Skill, SkillUpdateTask } from "@/types";
import Button from "@/components/ui/Button.vue";
import Input from "@/components/ui/Input.vue";
import EmptyState from "@/components/ui/EmptyState.vue";
import Alert from "@/components/ui/Alert.vue";
import Card from "@/components/ui/Card.vue";
import VirtualizedList from "@/components/ui/VirtualizedList.vue";
import SkillCard from "./components/SkillCard.vue";
import RepoGroupCard from "./components/RepoGroupCard.vue";
import { useDebounce } from "@/utils/debounce";
import { groupSkillsByRepo } from "@/utils/skillGrouping";

export type InstalledFilterKey = "all" | "net" | "local";
export type InstalledViewMode = "tree" | "flat";

export interface InstalledTabProps {
  skills: ListedSkill[];
  searchQuery: string;
  filter: InstalledFilterKey;
  notice: string | null;
  error: string | null;
  updateTasks: Record<number, SkillUpdateTask>;
  updatesAtCapacity: boolean;
  batchUpdating: boolean;
  batchSkillIds: number[];
}

const props = defineProps<InstalledTabProps>();

const emit = defineEmits<{
  (e: "update:searchQuery", value: string): void;
  (e: "update:filter", value: InstalledFilterKey): void;
  (e: "clearError"): void;
  (e: "actionError", message: string): void;
  (e: "update", skill: Skill): void;
  (e: "updateGroup", skillIds: number[]): void;
  (e: "delete", skill: Skill): void;
  (e: "goExplore"): void;
  (e: "dismissBatch"): void;
  (e: "viewReferences", skill: Skill): void;
}>();

const { t } = useI18n();

const viewMode = ref<InstalledViewMode>(
  (() => {
    try {
      return localStorage.getItem("longan_installed_view_mode") === "flat" ? "flat" : "tree";
    } catch {
      return "tree";
    }
  })(),
);

const collapsedGroups = ref<Set<string>>(new Set());

function toggleViewMode(mode: InstalledViewMode) {
  viewMode.value = mode;
  try {
    localStorage.setItem("longan_installed_view_mode", mode);
  } catch {}
}

const updatableCount = computed(
  () => props.skills.filter((s) => s.status === "update_available").length,
);
const netCount = computed(() => props.skills.filter((s) => s.source_type === "net").length);
const localCount = computed(() => props.skills.filter((s) => s.source_type === "local").length);

const batchTasks = computed(() =>
  props.batchSkillIds.map((id) => props.updateTasks[id]).filter(Boolean),
);
const batchCompleted = computed(
  () => batchTasks.value.filter((task) => task.status === "success").length,
);
const batchFailed = computed(
  () => batchTasks.value.filter((task) => task.status === "failed").length,
);
const batchWaiting = computed(
  () => props.batchSkillIds.length - batchCompleted.value - batchFailed.value,
);
const batchProgress = computed(() =>
  props.batchSkillIds.length > 0
    ? Math.round(
        batchTasks.value.reduce((total, task) => total + task.progress, 0) /
          props.batchSkillIds.length,
      )
    : 0,
);
const batchProgressIndeterminate = computed(() =>
  batchTasks.value.some(
    (task) =>
      task.status === "updating" &&
      (task.phase === "retrying" || (task.phase === "downloading" && task.totalBytes === null)),
  ),
);

const debouncedQuery = useDebounce(
  computed(() => props.searchQuery),
  300,
);

const groupedSkills = computed(() =>
  groupSkillsByRepo(props.skills, props.filter, debouncedQuery.value),
);

const filteredSkills = computed(() => groupedSkills.value.flatMap((group) => group.skills));

const allCollapsed = computed(
  () =>
    groupedSkills.value.length > 0 &&
    groupedSkills.value.every((g) => collapsedGroups.value.has(g.key)),
);

function handleToggleCollapse(groupKey: string) {
  const next = new Set(collapsedGroups.value);
  if (next.has(groupKey)) {
    next.delete(groupKey);
  } else {
    next.add(groupKey);
  }
  collapsedGroups.value = next;
}

function handleToggleExpandCollapseAll() {
  if (allCollapsed.value) {
    collapsedGroups.value = new Set();
  } else {
    collapsedGroups.value = new Set(groupedSkills.value.map((g) => g.key));
  }
}

function isGroupCollapsed(groupKey: string) {
  if (debouncedQuery.value.trim()) return false;
  return collapsedGroups.value.has(groupKey);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
</script>

<template>
  <div class="space-y-6">
    <!-- Action & Filter Bar -->
    <div class="space-y-3">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div class="flex-1 max-w-md">
          <Input
            v-if="skills.length > 0"
            :placeholder="t('library.searchPlaceholder')"
            :model-value="searchQuery"
            @update:model-value="(val) => emit('update:searchQuery', val)"
          >
            <template #icon>
              <Search class="w-4 h-4 text-slate-400" />
            </template>
            <template v-if="searchQuery" #right>
              <button
                type="button"
                class="text-slate-500 hover:text-slate-300 transition-colors focus:outline-none cursor-pointer"
                @click="emit('update:searchQuery', '')"
              >
                <X class="w-4 h-4" />
              </button>
            </template>
          </Input>
        </div>

        <div v-if="skills.length > 0" class="flex items-center gap-2 self-start sm:self-auto">
          <!-- Expand / Collapse All (Tree mode) -->
          <button
            v-if="viewMode === 'tree' && groupedSkills.length > 0"
            type="button"
            :title="allCollapsed ? t('library.expandAll') : t('library.collapseAll')"
            :aria-label="allCollapsed ? t('library.expandAll') : t('library.collapseAll')"
            class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-slate-200 bg-slate-900/60 hover:bg-slate-800 border border-slate-800/80 transition-colors cursor-pointer"
            @click="handleToggleExpandCollapseAll"
          >
            <ChevronDown v-if="allCollapsed" class="w-3.5 h-3.5" />
            <ChevronRight v-else class="w-3.5 h-3.5" />
            <span>{{ allCollapsed ? t("library.expandAll") : t("library.collapseAll") }}</span>
          </button>

          <!-- View Mode Switcher -->
          <div
            role="group"
            aria-label="View Mode"
            class="inline-flex rounded-lg border border-slate-800/80 bg-slate-950/50 p-0.5"
          >
            <button
              type="button"
              :aria-pressed="viewMode === 'tree'"
              :aria-label="t('library.viewModeTree')"
              :title="t('library.viewModeTree')"
              :class="[
                'flex h-7 items-center gap-1.5 rounded-md px-2 text-xs font-medium transition-colors cursor-pointer',
                viewMode === 'tree'
                  ? 'bg-slate-800 text-emerald-400 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200',
              ]"
              @click="toggleViewMode('tree')"
            >
              <FolderTree class="w-3.5 h-3.5" />
              <span class="hidden sm:inline">{{ t("library.viewModeTree") }}</span>
            </button>
            <button
              type="button"
              :aria-pressed="viewMode === 'flat'"
              :aria-label="t('library.viewModeFlat')"
              :title="t('library.viewModeFlat')"
              :class="[
                'flex h-7 items-center gap-1.5 rounded-md px-2 text-xs font-medium transition-colors cursor-pointer',
                viewMode === 'flat'
                  ? 'bg-slate-800 text-emerald-400 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200',
              ]"
              @click="toggleViewMode('flat')"
            >
              <LayoutList class="w-3.5 h-3.5" />
              <span class="hidden sm:inline">{{ t("library.viewModeFlat") }}</span>
            </button>
          </div>
        </div>
      </div>

      <!-- Filter Chips Bar -->
      <div v-if="skills.length > 0" class="flex items-center gap-2 overflow-x-auto pb-1 pt-1">
        <button
          type="button"
          :class="[
            'px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 shrink-0 cursor-pointer',
            filter === 'all'
              ? 'bg-emerald-600/20 text-emerald-300 border border-emerald-500/40 shadow-sm'
              : 'bg-slate-900/60 text-slate-400 hover:text-slate-200 border border-slate-800/80 hover:border-slate-700',
          ]"
          @click="emit('update:filter', 'all')"
        >
          <span>{{ t("library.filter.all") }}</span>
          <span
            :class="[
              'text-[10px] px-1.5 py-0.5 rounded-full font-mono',
              filter === 'all'
                ? 'bg-emerald-500/30 text-emerald-200'
                : 'bg-slate-800 text-slate-500',
            ]"
          >
            {{ skills.length }}
          </span>
        </button>

        <button
          type="button"
          :class="[
            'px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 shrink-0 cursor-pointer',
            filter === 'net'
              ? 'bg-emerald-600/20 text-emerald-300 border border-emerald-500/40 shadow-sm'
              : 'bg-slate-900/60 text-slate-400 hover:text-slate-200 border border-slate-800/80 hover:border-slate-700',
          ]"
          @click="emit('update:filter', 'net')"
        >
          <Globe class="w-3.5 h-3.5 text-emerald-400" />
          <span>{{ t("library.filter.net") }}</span>
          <span
            :class="[
              'text-[10px] px-1.5 py-0.5 rounded-full font-mono',
              filter === 'net'
                ? 'bg-emerald-500/30 text-emerald-200'
                : 'bg-slate-800 text-slate-500',
            ]"
          >
            {{ netCount }}
          </span>
        </button>

        <button
          type="button"
          :class="[
            'px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 shrink-0 cursor-pointer',
            filter === 'local'
              ? 'bg-emerald-600/20 text-emerald-300 border border-emerald-500/40 shadow-sm'
              : 'bg-slate-900/60 text-slate-400 hover:text-slate-200 border border-slate-800/80 hover:border-slate-700',
          ]"
          @click="emit('update:filter', 'local')"
        >
          <HardDrive class="w-3.5 h-3.5 text-slate-400" />
          <span>{{ t("library.filter.local") }}</span>
          <span
            :class="[
              'text-[10px] px-1.5 py-0.5 rounded-full font-mono',
              filter === 'local'
                ? 'bg-emerald-500/30 text-emerald-200'
                : 'bg-slate-800 text-slate-500',
            ]"
          >
            {{ localCount }}
          </span>
        </button>
      </div>

      <!-- Batch Update Progress Card -->
      <Card v-if="batchSkillIds.length > 0" class="bg-slate-900/60 border-amber-500/40" aria-live="polite">
        <div class="space-y-3">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <span class="font-semibold text-sm text-amber-300">
              {{ t("library.batchProgress") }}
            </span>
            <div class="flex gap-4 text-xs text-slate-400">
              <span>{{ t("library.batchSuccess", { count: batchCompleted }) }}</span>
              <span>{{ t("library.batchFailed", { count: batchFailed }) }}</span>
              <span>{{ t("library.batchWaiting", { count: batchWaiting }) }}</span>
            </div>
          </div>

          <div
            class="h-2 overflow-hidden rounded-full bg-slate-800"
            role="progressbar"
            :aria-label="t('library.batchProgress')"
            :aria-valuemin="0"
            :aria-valuemax="100"
            :aria-valuenow="batchProgressIndeterminate ? undefined : batchProgress"
          >
            <div
              :class="[
                'h-full rounded-full bg-amber-500 transition-[width] duration-300',
                batchProgressIndeterminate && 'w-full animate-shimmer',
              ]"
              :style="batchProgressIndeterminate ? undefined : { width: `${batchProgress}%` }"
            />
          </div>

          <div class="max-h-48 space-y-1.5 overflow-y-auto pr-1 custom-scrollbar">
            <div
              v-for="task in batchTasks"
              :key="task.skillId"
              class="flex items-center gap-2 rounded bg-slate-950/40 px-2.5 py-2 text-xs"
            >
              <CheckCircle2 v-if="task.status === 'success'" class="h-3.5 w-3.5 shrink-0 text-emerald-400" />
              <XCircle v-else-if="task.status === 'failed'" class="h-3.5 w-3.5 shrink-0 text-rose-400" />
              <Loader2 v-else-if="task.status === 'updating'" class="h-3.5 w-3.5 shrink-0 animate-spin text-amber-400" />
              <span v-else class="h-2 w-2 shrink-0 rounded-full bg-slate-600" />

              <span class="min-w-0 flex-1 truncate text-slate-300">{{ task.name }}</span>
              <span class="shrink-0 text-slate-500">
                {{
                  task.status === "queued"
                    ? t("library.updateQueued")
                    : task.phase
                      ? t(`library.updatePhase.${task.phase}`)
                      : ""
                }}
              </span>
              <span class="w-16 shrink-0 text-right font-mono text-slate-500">
                {{
                  task.phase === "downloading" && task.totalBytes === null
                    ? task.downloadedBytes === null
                      ? ""
                      : formatBytes(task.downloadedBytes)
                    : task.phase === "retrying"
                      ? ""
                      : `${task.progress}%`
                }}
              </span>
            </div>
          </div>

          <div v-if="!batchUpdating" class="flex justify-end pt-1">
            <Button variant="outline" size="sm" @click="emit('dismissBatch')">
              {{ t("common.close") }}
            </Button>
          </div>
        </div>
      </Card>

      <!-- Batch update prompt -->
      <div
        v-if="updatableCount > 0 && !batchUpdating && batchSkillIds.length === 0"
        class="flex items-center justify-between py-2 bg-amber-500/5 rounded-lg p-3"
      >
        <div class="text-xs text-amber-400">
          {{ t("library.batchUpdatePrompt", { count: updatableCount }) }}
        </div>
      </div>
    </div>

    <!-- Feedback Messages -->
    <Alert v-if="notice" type="success" :message="notice" :duration="3000" />
    <Alert v-if="error" type="error" :message="error" @close="emit('clearError')" />

    <!-- Empty States & Lists -->
    <EmptyState
      v-if="skills.length === 0"
      :title="t('library.noInstalledSkills')"
      :description="t('library.localHint')"
    >
      <template #icon>
        <BookOpen class="w-8 h-8 text-slate-500" />
      </template>
      <template #action>
        <Button variant="primary" size="sm" @click="emit('goExplore')">
          <Sparkles class="w-3.5 h-3.5" />
          <span>{{ t("library.goToMarket") }}</span>
        </Button>
      </template>
    </EmptyState>

    <EmptyState
      v-else-if="(viewMode === 'tree' ? groupedSkills.length === 0 : filteredSkills.length === 0)"
      :title="t('library.noSearchResults')"
      :description="t('library.noSearchResultsDesc')"
    >
      <template #icon>
        <Search class="w-8 h-8 text-amber-400" />
      </template>
      <template #action>
        <Button
          v-if="filter !== 'all' || searchQuery"
          variant="outline"
          size="sm"
          @click="
            emit('update:filter', 'all');
            emit('update:searchQuery', '');
          "
        >
          {{ t("library.resetFilters") }}
        </Button>
      </template>
    </EmptyState>

    <!-- Tree View -->
    <div
      v-else-if="viewMode === 'tree'"
      class="space-y-4"
      role="list"
      :aria-label="t('nav.installed')"
    >
      <RepoGroupCard
        v-for="group in groupedSkills"
        :key="group.key"
        :group="group"
        :is-collapsed="isGroupCollapsed(group.key)"
        :update-tasks="updateTasks"
        :updates-at-capacity="updatesAtCapacity"
        :batch-updating="batchUpdating"
        :search-query="debouncedQuery"
        @toggle-collapse="handleToggleCollapse"
        @update="(s) => emit('update', s)"
        @update-group="(ids) => emit('updateGroup', ids)"
        @delete="(s) => emit('delete', s)"
        @view-references="(s) => emit('viewReferences', s)"
        @action-error="(msg) => emit('actionError', msg)"
      />
    </div>

    <!-- Flat View with VirtualizedList -->
    <VirtualizedList
      v-else
      :items="filteredSkills"
      :get-item-key="(skill) => skill.id"
      :aria-label="t('nav.installed')"
      :reset-key="`${filter}:${debouncedQuery}`"
      class="grid grid-cols-1 gap-3"
      v-slot="{ item: skill }"
    >
      <SkillCard
        :skill="skill"
        view-mode="flat"
        :update-task="updateTasks[skill.id]"
        :update-disabled="!updateTasks[skill.id] && updatesAtCapacity"
        :search-query="debouncedQuery"
        @update="(s) => emit('update', s)"
        @delete="(s) => emit('delete', s)"
        @view-references="(s) => emit('viewReferences', s)"
        @action-error="(msg) => emit('actionError', msg)"
      />
    </VirtualizedList>
  </div>
</template>
