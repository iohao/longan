<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from "vue";
import { useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import { HardDrive, Loader2, MoreHorizontal, RefreshCw, Sparkles, Store } from "lucide-vue-next";
import {
  api,
  errorMessage,
  listenForSkillsChanged,
  listenForSkillUpdateProgress,
} from "@/api";
import type { ListedSkill, Skill, SkillUpdateTask } from "@/types";
import InstalledTab, { type InstalledFilterKey } from "@/components/skill-market/InstalledTab.vue";
import DeleteConfirmModal from "@/components/skill-market/components/DeleteConfirmModal.vue";
import SkillReferenceModal from "@/components/skill-market/components/SkillReferenceModal.vue";
import { useSkillUpdateStore } from "@/stores/skillUpdate";
import { reportFrontendError } from "@/logging";

const MAX_CONCURRENT_UPDATES = 2;

function queuedTask(skill: Skill): SkillUpdateTask {
  return {
    skillId: skill.id,
    name: skill.name,
    status: "queued",
    phase: null,
    progress: 0,
    downloadedBytes: null,
    totalBytes: null,
    error: null,
  };
}

const router = useRouter();
const { t } = useI18n();
const skillUpdateStore = useSkillUpdateStore();

const skills = ref<ListedSkill[]>([]);
const installedSearchQuery = ref("");
const installedFilter = ref<InstalledFilterKey>("all");
const notice = ref<string | null>(null);
const installedError = ref<string | null>(null);
const deleting = ref<Skill | null>(null);
const deleteRefs = ref<[string[], string[]] | null>(null);
const viewingReferences = ref<Skill | null>(null);
const updateTasks = ref<Record<number, SkillUpdateTask>>({});
const batchSkillIds = ref<number[]>([]);
const batchUpdating = ref(false);
const runningUpdateCount = ref(0);
const checkingUpdates = ref(false);
const rescanningLocal = ref(false);
const actionsMenuOpen = ref(false);

const lockedUpdateIds = new Set<number>();
const runningUpdateIds = new Set<number>();
let batchUpdatingFlag = false;
let checkingUpdatesFlag = false;
let rescanningLocalFlag = false;
let reloadGeneration = 0;

const actionsMenuRef = ref<HTMLDivElement | null>(null);
const actionsMenuButtonRef = ref<HTMLButtonElement | null>(null);

async function reloadSkills() {
  const generation = ++reloadGeneration;
  try {
    const loadedSkills = await api.listSkills();
    if (generation !== reloadGeneration) return;
    skills.value = loadedSkills;
  } catch (error) {
    if (generation === reloadGeneration) {
      installedError.value = errorMessage(error);
    }
  }
}

let cleanupSkillsChanged: (() => void) | undefined;
let cleanupUpdateProgress: (() => void) | undefined;

function maintenanceBlocked(): boolean {
  return (
    checkingUpdatesFlag ||
    rescanningLocalFlag ||
    batchUpdatingFlag ||
    lockedUpdateIds.size > 0 ||
    runningUpdateIds.size > 0
  );
}

async function checkForUpdates() {
  if (maintenanceBlocked()) return;

  checkingUpdatesFlag = true;
  checkingUpdates.value = true;
  installedError.value = null;
  notice.value = null;
  try {
    const count = await api.checkUpdates();
    await reloadSkills();
    notice.value =
      count > 0
        ? t("installed.updatesFound", { count })
        : t("installed.noUpdates");
  } catch (error) {
    installedError.value = errorMessage(error);
  } finally {
    checkingUpdatesFlag = false;
    checkingUpdates.value = false;
  }
}

async function rescanLocalSkills() {
  if (maintenanceBlocked()) return;

  rescanningLocalFlag = true;
  rescanningLocal.value = true;
  actionsMenuOpen.value = false;
  actionsMenuButtonRef.value?.focus();
  installedError.value = null;
  notice.value = null;
  try {
    await api.rescanLocal();
    await reloadSkills();
    notice.value = t("installed.localRescanned");
  } catch (error) {
    installedError.value = errorMessage(error);
  } finally {
    rescanningLocalFlag = false;
    rescanningLocal.value = false;
  }
}

function setTaskRunning(skill: Skill) {
  runningUpdateIds.add(skill.id);
  runningUpdateCount.value = runningUpdateIds.size;
  updateTasks.value = {
    ...updateTasks.value,
    [skill.id]: { ...queuedTask(skill), status: "updating", phase: "checking" },
  };
}

async function runUpdateRequest(skill: Skill): Promise<"updated" | "unchanged" | "failed"> {
  setTaskRunning(skill);
  try {
    const updatedSkill = await api.updateSkill(skill.id);
    skills.value = skills.value.map((existing) =>
      existing.id === updatedSkill.id
        ? { ...updatedSkill, reference_count: existing.reference_count }
        : existing,
    );
    updateTasks.value = {
      ...updateTasks.value,
      [skill.id]: {
        ...updateTasks.value[skill.id],
        status: "success",
        phase: "completed",
        progress: 100,
        error: null,
      },
    };
    return updatedSkill.latest_sha === skill.latest_sha &&
      updatedSkill.tree_sha === skill.tree_sha
      ? "unchanged"
      : "updated";
  } catch (error) {
    const message = errorMessage(error);
    installedError.value = message;
    updateTasks.value = {
      ...updateTasks.value,
      [skill.id]: {
        ...updateTasks.value[skill.id],
        status: "failed",
        phase: "failed",
        error: message,
      },
    };
    return "failed";
  } finally {
    runningUpdateIds.delete(skill.id);
    runningUpdateCount.value = runningUpdateIds.size;
  }
}

async function update(skill: Skill) {
  if (
    batchUpdatingFlag ||
    lockedUpdateIds.has(skill.id) ||
    runningUpdateIds.size >= MAX_CONCURRENT_UPDATES
  ) {
    return;
  }

  lockedUpdateIds.add(skill.id);
  installedError.value = null;
  notice.value = null;
  updateTasks.value = { ...updateTasks.value, [skill.id]: queuedTask(skill) };

  const outcome = await runUpdateRequest(skill);
  lockedUpdateIds.delete(skill.id);
  if (outcome !== "failed") {
    notice.value =
      outcome === "unchanged"
        ? t("library.updateSkipped", { name: skill.name })
        : t("library.updateSuccess", { name: skill.name });
  }
}

async function runBatchUpdate(targetSkills: ListedSkill[]) {
  if (batchUpdatingFlag || lockedUpdateIds.size > 0) return;
  if (targetSkills.length === 0) return;

  batchUpdatingFlag = true;
  batchUpdating.value = true;
  batchSkillIds.value = targetSkills.map((s) => s.id);
  installedError.value = null;
  notice.value = null;

  for (const s of targetSkills) lockedUpdateIds.add(s.id);
  const nextTasks = { ...updateTasks.value };
  for (const s of targetSkills) nextTasks[s.id] = queuedTask(s);
  updateTasks.value = nextTasks;

  try {
    const updatedSkills = await api.updateSkills(targetSkills.map((s) => s.id));
    const updatedById = new Map(updatedSkills.map((s) => [s.id, s]));
    skills.value = skills.value.map((skill) => {
      const updated = updatedById.get(skill.id);
      return updated ? { ...updated, reference_count: skill.reference_count } : skill;
    });

    const finishTasks = { ...updateTasks.value };
    for (const skill of targetSkills) {
      const task = updateTasks.value[skill.id] ?? queuedTask(skill);
      finishTasks[skill.id] = updatedById.has(skill.id)
        ? {
            ...task,
            status: "success",
            phase: "completed",
            progress: 100,
            error: null,
          }
        : task.status === "failed"
          ? task
          : {
              ...task,
              status: "failed",
              phase: "failed",
              error: task.error ?? t("library.updatePhase.failed"),
            };
    }
    updateTasks.value = finishTasks;
  } catch (error) {
    const message = errorMessage(error);
    installedError.value = message;
    const failTasks = { ...updateTasks.value };
    for (const skill of targetSkills) {
      const task = updateTasks.value[skill.id] ?? queuedTask(skill);
      failTasks[skill.id] =
        task.status === "success" || task.status === "failed"
          ? task
          : {
              ...task,
              status: "failed",
              phase: "failed",
              error: message,
            };
    }
    updateTasks.value = failTasks;
  }

  for (const s of targetSkills) lockedUpdateIds.delete(s.id);
  batchUpdatingFlag = false;
  batchUpdating.value = false;
  await reloadSkills();
}

async function updateAllUpdatableSkills() {
  const updatableSkills = skills.value.filter(
    (s) => s.status === "update_available" && s.source_type === "net",
  );
  await runBatchUpdate(updatableSkills);
}

async function updateSkillsGroup(targetIds: number[]) {
  const targetSet = new Set(targetIds);
  const targetSkills = skills.value.filter(
    (s) => targetSet.has(s.id) && s.status === "update_available" && s.source_type === "net",
  );
  await runBatchUpdate(targetSkills);
}

async function askDelete(skill: Skill) {
  deleting.value = skill;
  deleteRefs.value = null;
  try {
    deleteRefs.value = await api.skillReferences(skill.id);
  } catch (error) {
    installedError.value = errorMessage(error);
  }
}

async function confirmDelete() {
  if (!deleting.value) return;
  installedError.value = null;
  try {
    await api.deleteSkill(deleting.value.id);
    deleting.value = null;
    await reloadSkills();
  } catch (error) {
    installedError.value = errorMessage(error);
  }
}

function handleOutsideClick(event: PointerEvent) {
  if (actionsMenuOpen.value && !actionsMenuRef.value?.contains(event.target as Node)) {
    actionsMenuOpen.value = false;
  }
}

function handleEscapeKey(event: KeyboardEvent) {
  if (actionsMenuOpen.value && event.key === "Escape") {
    actionsMenuOpen.value = false;
    actionsMenuButtonRef.value?.focus();
  }
}

watch(
  skills,
  (currentSkills) => {
    const count = currentSkills.filter((skill) => skill.status === "update_available").length;
    skillUpdateStore.setUpdatableCount(count);
  },
  { immediate: true },
);

onMounted(async () => {
  await reloadSkills();

  try {
    cleanupSkillsChanged = await listenForSkillsChanged(() => {
      void reloadSkills();
    });
  } catch (error) {
    reportFrontendError("Failed to listen for skill changes", error, "InstalledPage");
  }

  try {
    cleanupUpdateProgress = await listenForSkillUpdateProgress((progress) => {
      const task = updateTasks.value[progress.skillId];
      if (!task) return;
      if (task.status === "success") return;
      if (task.status === "failed" && progress.phase !== "failed") return;

      updateTasks.value = {
        ...updateTasks.value,
        [progress.skillId]: {
          ...task,
          status:
            progress.phase === "completed"
              ? "success"
              : progress.phase === "failed"
                ? "failed"
                : "updating",
          phase: progress.phase,
          progress: progress.progress,
          downloadedBytes: progress.downloadedBytes,
          totalBytes: progress.totalBytes,
          error: progress.error,
        },
      };
    });
  } catch (error) {
    reportFrontendError("Failed to listen for update progress", error, "InstalledPage");
  }

  window.addEventListener("pointerdown", handleOutsideClick);
  window.addEventListener("keydown", handleEscapeKey);
});

onUnmounted(() => {
  cleanupSkillsChanged?.();
  cleanupUpdateProgress?.();
  window.removeEventListener("pointerdown", handleOutsideClick);
  window.removeEventListener("keydown", handleEscapeKey);
});

const updatableCount = computed(
  () =>
    skills.value.filter((s) => s.status === "update_available" && s.source_type === "net").length,
);

const updatesAtCapacity = computed(() => runningUpdateCount.value >= MAX_CONCURRENT_UPDATES);
const batchBlocked = computed(() => batchUpdating.value || lockedUpdateIds.size > 0);
const maintenanceActionBlocked = computed(
  () =>
    checkingUpdates.value ||
    rescanningLocal.value ||
    batchBlocked.value ||
    runningUpdateCount.value > 0,
);

const checkUpdatesLabel = computed(() =>
  checkingUpdates.value ? t("installed.checkingUpdates") : t("installed.checkUpdates"),
);
const moreActionsLabel = computed(() =>
  rescanningLocal.value ? t("installed.rescanningLocal") : t("installed.moreActions"),
);
</script>

<template>
  <div class="max-w-7xl space-y-8">
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <div class="flex items-center gap-2 text-emerald-400 text-xs font-semibold uppercase tracking-wider mb-1">
          <Store class="w-3.5 h-3.5" />
          <span>{{ t("installed.header") }}</span>
        </div>
        <h1 class="text-2xl font-bold text-slate-100 tracking-tight">
          {{ t("nav.installed") }}
        </h1>
      </div>

      <div class="flex flex-wrap items-center gap-2 self-start sm:self-auto">
        <button
          type="button"
          :disabled="maintenanceActionBlocked"
          :aria-label="checkUpdatesLabel"
          :aria-busy="checkingUpdates"
          :title="checkUpdatesLabel"
          class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-700 bg-slate-900/70 text-slate-300 transition-colors hover:border-emerald-500/50 hover:text-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60 disabled:cursor-not-allowed disabled:opacity-50"
          @click="checkForUpdates"
        >
          <RefreshCw :class="['h-4 w-4', checkingUpdates ? 'animate-spin' : '']" />
        </button>

        <div ref="actionsMenuRef" class="relative">
          <button
            ref="actionsMenuButtonRef"
            type="button"
            :disabled="maintenanceActionBlocked"
            :aria-label="moreActionsLabel"
            aria-haspopup="menu"
            :aria-expanded="actionsMenuOpen"
            :aria-busy="rescanningLocal"
            :title="moreActionsLabel"
            class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-700 bg-slate-900/70 text-slate-300 transition-colors hover:border-slate-600 hover:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60 disabled:cursor-not-allowed disabled:opacity-50"
            @click="actionsMenuOpen = !actionsMenuOpen"
          >
            <Loader2 v-if="rescanningLocal" class="h-4 w-4 animate-spin" />
            <MoreHorizontal v-else class="h-4 w-4" />
          </button>

          <div
            v-if="actionsMenuOpen"
            role="menu"
            class="absolute right-0 top-full z-30 mt-2 w-56 overflow-hidden rounded-lg border border-slate-700 bg-slate-900 p-1 shadow-xl shadow-slate-950/50"
          >
            <button
              type="button"
              role="menuitem"
              class="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm text-slate-300 transition-colors hover:bg-slate-800 hover:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-500/60"
              @click="rescanLocalSkills"
            >
              <HardDrive class="h-4 w-4 shrink-0 text-slate-400" />
              <span>{{ t("installed.rescanLocal") }}</span>
            </button>
          </div>
        </div>

        <button
          v-if="updatableCount > 0"
          type="button"
          :disabled="batchBlocked || checkingUpdates || rescanningLocal"
          :title="t('installed.updatesFound', { count: updatableCount })"
          class="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white text-sm font-medium rounded-lg transition-all duration-200 cursor-pointer shadow-lg shadow-amber-600/20 flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:bg-amber-600"
          @click="updateAllUpdatableSkills"
        >
          <Loader2 v-if="batchUpdating" class="w-4 h-4 animate-spin" />
          <Sparkles v-else class="w-4 h-4" />
          <span>{{ batchUpdating ? t("library.updating") : t("installed.batchUpdateNow") }}</span>
          <span
            class="shrink-0 flex items-center justify-center min-w-[20px] h-[20px] px-1.5 bg-white/20 text-white text-xs font-bold rounded-full"
          >
            {{ updatableCount > 99 ? "99+" : updatableCount }}
          </span>
        </button>
      </div>
    </div>

    <InstalledTab
      :skills="skills"
      :search-query="installedSearchQuery"
      :filter="installedFilter"
      :notice="notice"
      :error="installedError"
      :update-tasks="updateTasks"
      :updates-at-capacity="updatesAtCapacity"
      :batch-updating="batchUpdating"
      :batch-skill-ids="batchSkillIds"
      @update:search-query="(val) => (installedSearchQuery = val)"
      @update:filter="(val) => (installedFilter = val)"
      @clear-error="installedError = null"
      @action-error="(msg) => (installedError = msg)"
      @update="(skill) => void update(skill)"
      @update-group="(ids) => void updateSkillsGroup(ids)"
      @delete="askDelete"
      @view-references="(skill) => (viewingReferences = skill)"
      @go-explore="router.push({ name: 'market' })"
      @dismiss-batch="batchSkillIds = []"
    />

    <DeleteConfirmModal
      :skill="deleting"
      :delete-refs="deleteRefs"
      @close="deleting = null"
      @confirm="confirmDelete"
    />

    <SkillReferenceModal
      :skill="viewingReferences"
      :is-open="viewingReferences !== null"
      @close="viewingReferences = null"
    />
  </div>
</template>
