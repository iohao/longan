<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from "vue";
import { useI18n } from "vue-i18n";
import {
  AlertCircle,
  Ban,
  CheckCircle2,
  Clock3,
  Download,
  Loader2,
  RotateCcw,
  Square,
  Trash2,
  X,
  XCircle,
} from "lucide-vue-next";
import { useSkillInstallStore } from "@/stores/skillInstall";
import type { SkillInstallTask } from "@/types";
import SkillInstallProgress from "./SkillInstallProgress.vue";

const { t } = useI18n();
const store = useSkillInstallStore();

const triggerRef = ref<HTMLButtonElement | null>(null);
const panelRef = ref<HTMLElement | null>(null);

const tasks = computed(() => store.tasks);
const expanded = computed(() => store.expanded);

const activeCount = computed(
  () =>
    tasks.value.filter(
      (task) => task.status === "installing" || task.status === "cancelling",
    ).length,
);

const queuedCount = computed(
  () => tasks.value.filter((task) => task.status === "queued").length,
);

const clearable = computed(() =>
  tasks.value.some(
    (task) =>
      task.status === "completed" ||
      task.status === "failed" ||
      task.status === "cancelled",
  ),
);

const busyCount = computed(() => activeCount.value + queuedCount.value);

const failedCount = computed(
  () => tasks.value.filter((task) => task.status === "failed").length,
);

const finishedCount = computed(
  () =>
    tasks.value.filter(
      (task) =>
        task.status === "completed" ||
        task.status === "failed" ||
        task.status === "cancelled",
    ).length,
);

const summary = computed(() => {
  if (busyCount.value > 0) {
    return t("install.queue.summary", {
      active: activeCount.value,
      queued: queuedCount.value,
    });
  }
  if (failedCount.value > 0) {
    return t("install.queue.summaryFailed", {
      failed: failedCount.value,
      finished: finishedCount.value,
    });
  }
  return t("install.queue.summaryFinished", { finished: finishedCount.value });
});

const triggerLabel = computed(() =>
  expanded.value ? t("install.queue.title") : t("install.queue.open"),
);

function handlePointerDown(event: MouseEvent) {
  const target = event.target as Node;
  if (
    triggerRef.value?.contains(target) ||
    panelRef.value?.contains(target)
  ) {
    return;
  }
  store.setExpanded(false);
}

function handleKeyDown(event: KeyboardEvent) {
  if (event.key !== "Escape") return;
  store.setExpanded(false);
  requestAnimationFrame(() => triggerRef.value?.focus());
}

watch(expanded, (isExpanded) => {
  if (isExpanded) {
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
  } else {
    document.removeEventListener("mousedown", handlePointerDown);
    document.removeEventListener("keydown", handleKeyDown);
  }
});

onMounted(() => {
  if (expanded.value) {
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
  }
});

onUnmounted(() => {
  document.removeEventListener("mousedown", handlePointerDown);
  document.removeEventListener("keydown", handleKeyDown);
});

function getTaskStatusIcon(task: SkillInstallTask) {
  if (task.status === "queued") return Clock3;
  if (task.status === "completed") return CheckCircle2;
  if (task.status === "failed") return XCircle;
  if (task.status === "cancelled") return Ban;
  return Loader2;
}

function getTaskStatusIconColor(task: SkillInstallTask) {
  if (task.status === "queued") return "text-amber-400";
  if (task.status === "completed") return "text-emerald-400";
  if (task.status === "failed") return "text-rose-400";
  if (task.status === "cancelled") return "text-slate-500";
  return "text-cyan-400 animate-spin motion-reduce:animate-none";
}
</script>

<template>
  <template v-if="tasks.length > 0">
    <button
      ref="triggerRef"
      type="button"
      :class="[
        'relative flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-150 group cursor-pointer',
        expanded
          ? 'border border-emerald-500/30 bg-emerald-600/15 text-emerald-400 shadow-sm'
          : 'text-slate-400 hover:bg-slate-900/80 hover:text-slate-200',
      ]"
      :aria-label="triggerLabel"
      aria-controls="skill-install-queue-panel"
      :aria-expanded="expanded"
      :title="summary"
      @click="store.setExpanded(!expanded)"
    >
      <span class="flex min-w-0 items-center gap-3">
        <span
          :class="[
            'relative shrink-0 transition-colors',
            expanded ? 'text-emerald-400' : 'text-slate-400 group-hover:text-slate-300',
          ]"
        >
          <Download class="h-4 w-4" />
          <span
            v-if="failedCount > 0"
            class="absolute -right-1 -top-1 h-1.5 w-1.5 rounded-full bg-rose-400"
          />
        </span>
        <span class="truncate">{{ t("install.queue.title") }}</span>
      </span>

      <span class="flex shrink-0 items-center gap-1.5" aria-hidden="true">
        <span
          v-if="busyCount > 0"
          class="flex items-center gap-1 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-300 font-mono"
        >
          <Loader2 class="h-3 w-3 animate-spin motion-reduce:animate-none" />
          {{ busyCount > 99 ? "99+" : busyCount }}
        </span>

        <span
          v-if="failedCount > 0"
          class="flex items-center gap-1 rounded-full bg-rose-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-rose-300 font-mono"
        >
          <AlertCircle class="h-3 w-3" />
          {{ failedCount > 99 ? "99+" : failedCount }}
        </span>

        <span
          v-if="busyCount === 0 && failedCount === 0"
          class="flex items-center gap-1 rounded-full bg-slate-800 px-1.5 py-0.5 text-[10px] font-semibold text-slate-400 font-mono"
        >
          <CheckCircle2 class="h-3 w-3 text-emerald-400" />
          {{ finishedCount > 99 ? "99+" : finishedCount }}
        </span>
      </span>
    </button>

    <!-- Queue Panel Drawer -->
    <section
      v-if="expanded"
      id="skill-install-queue-panel"
      ref="panelRef"
      class="absolute bottom-3 left-[calc(100%+0.5rem)] z-50 flex max-h-[calc(100vh-1.5rem)] w-[380px] max-w-[calc(100vw-17rem)] min-w-[320px] flex-col overflow-hidden rounded-lg border border-slate-700 bg-slate-900 shadow-2xl shadow-black/55"
      :aria-label="t('install.queue.title')"
    >
      <header
        class="flex min-h-14 items-center gap-3 border-b border-slate-800 px-4 py-3 shrink-0"
      >
        <span
          class="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-emerald-500/10 text-emerald-400"
        >
          <Download class="h-4 w-4" />
        </span>
        <div class="min-w-0 flex-1">
          <h2 class="text-sm font-semibold text-slate-100">
            {{ t("install.queue.title") }}
          </h2>
          <p class="truncate text-xs text-slate-500">{{ summary }}</p>
        </div>
        <button
          v-if="clearable"
          type="button"
          class="flex h-8 w-8 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60 cursor-pointer"
          :aria-label="t('install.queue.clearFinished')"
          :title="t('install.queue.clearFinished')"
          @click="store.clearFinished"
        >
          <Trash2 class="h-4 w-4" />
        </button>
        <button
          type="button"
          class="flex h-8 w-8 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60 cursor-pointer"
          :aria-label="t('install.queue.collapse')"
          :title="t('install.queue.collapse')"
          @click="store.setExpanded(false)"
        >
          <X class="h-4 w-4" />
        </button>
      </header>

      <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain" aria-live="polite">
        <div
          v-for="task in tasks"
          :key="task.id"
          class="border-b border-slate-800/80 px-4 py-3 last:border-b-0"
        >
          <div class="flex items-start gap-3">
            <span
              class="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-slate-800/80"
            >
              <component
                :is="getTaskStatusIcon(task)"
                :class="['h-4 w-4', getTaskStatusIconColor(task)]"
              />
            </span>
            <div class="min-w-0 flex-1">
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <h3 class="truncate text-sm font-medium text-slate-100">
                    {{ task.name }}
                  </h3>
                  <p class="truncate font-mono text-[11px] text-slate-500">
                    {{ task.sourceId }}
                  </p>
                </div>
                <div class="flex shrink-0 items-center gap-1">
                  <!-- Retry button -->
                  <button
                    v-if="task.status === 'failed' || task.status === 'cancelled'"
                    type="button"
                    class="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-800 hover:text-emerald-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60 cursor-pointer"
                    :aria-label="t('install.queue.retry', { name: task.name })"
                    :title="t('install.queue.retry', { name: task.name })"
                    @click="store.retry(task.id)"
                  >
                    <RotateCcw class="h-3.5 w-3.5" />
                  </button>

                  <!-- Cancel button -->
                  <button
                    v-if="
                      task.status === 'installing' &&
                      task.phase !== 'registering' &&
                      task.phase !== 'syncing'
                    "
                    type="button"
                    class="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-800 hover:text-rose-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/60 cursor-pointer"
                    :aria-label="t('install.queue.cancel', { name: task.name })"
                    :title="t('install.queue.cancel', { name: task.name })"
                    @click="store.cancel(task.id)"
                  >
                    <Square class="h-3.5 w-3.5 fill-current" />
                  </button>

                  <!-- Remove button -->
                  <button
                    v-if="
                      task.status === 'queued' ||
                      task.status === 'failed' ||
                      task.status === 'cancelled' ||
                      task.status === 'completed'
                    "
                    type="button"
                    class="flex h-7 w-7 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-800 hover:text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500/60 cursor-pointer"
                    :aria-label="t('install.queue.remove', { name: task.name })"
                    :title="t('install.queue.remove', { name: task.name })"
                    @click="store.remove(task.id)"
                  >
                    <X class="h-4 w-4" />
                  </button>
                </div>
              </div>

              <SkillInstallProgress :task="task" />

              <p
                v-if="task.error"
                class="mt-2 break-words text-xs leading-relaxed text-rose-300"
              >
                {{ task.error }}
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  </template>
</template>
