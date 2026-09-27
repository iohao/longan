<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import type { SkillInstallTask } from "@/types";

export interface SkillInstallProgressProps {
  task: SkillInstallTask;
}

const props = defineProps<SkillInstallProgressProps>();
const { t } = useI18n();

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const hasDownloadTotal = computed(() =>
  props.task.phase === "downloading" &&
  props.task.downloadedBytes !== null &&
  props.task.totalBytes !== null &&
  props.task.totalBytes > 0,
);

const downloadPercent = computed(() => {
  if (props.task.phase !== "downloading") return null;
  if (props.task.progressPercent !== null && props.task.progressPercent !== undefined) {
    return props.task.progressPercent;
  }
  if (hasDownloadTotal.value) {
    return Math.min(
      100,
      Math.round((props.task.downloadedBytes! * 100) / props.task.totalBytes!),
    );
  }
  return null;
});

const isCompleted = computed(() => props.task.phase === "completed");
const isTerminal = computed(
  () =>
    isCompleted.value ||
    props.task.phase === "failed" ||
    props.task.phase === "cancelled",
);
const isIndeterminate = computed(
  () => downloadPercent.value === null && !isTerminal.value,
);

const phaseTextClass = computed(() => {
  switch (props.task.phase) {
    case "failed":
      return "text-rose-300";
    case "completed":
      return "text-emerald-300";
    case "cancelled":
      return "text-slate-500";
    default:
      return "text-amber-300";
  }
});
</script>

<template>
  <!-- Queued state -->
  <div v-if="task.status === 'queued'" class="space-y-1.5 pt-2">
    <div class="text-xs text-amber-300">{{ t("install.queue.queued") }}</div>
    <div class="h-1.5 overflow-hidden rounded-full bg-slate-800" />
  </div>

  <!-- Cancelling state -->
  <div v-else-if="task.status === 'cancelling'" class="space-y-1.5 pt-2" aria-live="polite">
    <div class="text-xs text-slate-400">{{ t("install.queue.cancelling") }}</div>
    <div class="h-1.5 overflow-hidden rounded-full bg-slate-800">
      <div
        class="h-full w-full animate-shimmer rounded-full bg-slate-500 motion-reduce:animate-none"
      />
    </div>
  </div>

  <!-- Active or finished phases -->
  <div v-else-if="task.phase" class="space-y-1.5 pt-2" aria-live="polite">
    <div class="flex items-center justify-between gap-3 text-xs">
      <span :class="['truncate', phaseTextClass]">
        {{ t(`install.progressPhase.${task.phase}`) }}
      </span>

      <span
        v-if="
          task.phase === 'downloading' &&
          (downloadPercent !== null || (task.downloadedBytes ?? 0) > 0)
        "
        class="shrink-0 text-right font-mono text-slate-500"
      >
        <template v-if="hasDownloadTotal">
          {{
            t("install.downloadProgress", {
              downloaded: formatBytes(task.downloadedBytes!),
              total: formatBytes(task.totalBytes!),
              percent: downloadPercent,
            })
          }}
        </template>
        <template v-else-if="downloadPercent !== null && (task.downloadedBytes ?? 0) > 0">
          {{
            t("install.downloadProgressPercent", {
              downloaded: formatBytes(task.downloadedBytes!),
              percent: downloadPercent,
            })
          }}
        </template>
        <template v-else-if="downloadPercent !== null">
          {{ downloadPercent }}%
        </template>
        <template v-else>
          {{
            t("install.downloadProgressUnknown", {
              downloaded: formatBytes(task.downloadedBytes!),
            })
          }}
        </template>
      </span>
    </div>

    <div
      class="h-1.5 overflow-hidden rounded-full bg-slate-800"
      role="progressbar"
      :aria-label="t('install.skillInstallProgress', { name: task.name })"
      :aria-valuemin="0"
      :aria-valuemax="100"
      :aria-valuenow="
        isIndeterminate || (!isCompleted && downloadPercent === null)
          ? undefined
          : isCompleted
            ? 100
            : downloadPercent!
      "
    >
      <div
        :class="[
          'h-full rounded-full bg-amber-500 transition-[width] duration-300',
          isIndeterminate && 'w-full animate-shimmer',
        ]"
        :style="
          isIndeterminate
            ? undefined
            : { width: `${isCompleted ? 100 : downloadPercent ?? 0}%` }
        "
      />
    </div>
  </div>
</template>
