<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { Download, Loader2, ArrowUpCircle, X } from "lucide-vue-next";
import { useAppUpdateStore } from "@/stores/appUpdate";

const { t } = useI18n();
const store = useAppUpdateStore();

const availableUpdate = computed(() => store.availableUpdate);
const isInstallingUpdate = computed(() => store.isInstallingUpdate);
const updateDownloadedBytes = computed(() => store.updateDownloadedBytes);
const updateContentLength = computed(() => store.updateContentLength);

function formatByteCount(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

const pubDate = computed(() => {
  if (!availableUpdate.value?.date) return null;
  return new Date(availableUpdate.value.date).toLocaleDateString();
});
</script>

<template>
  <div
    v-if="availableUpdate"
    class="relative shrink-0 overflow-hidden bg-gradient-to-r from-emerald-600/15 via-emerald-500/10 to-teal-500/15 border-b border-emerald-500/30 px-6 py-2.5 text-slate-100 backdrop-blur-md flex flex-wrap items-center justify-between gap-4 z-30"
  >
    <div class="flex items-center gap-3 min-w-0">
      <div
        class="p-2 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 shrink-0"
      >
        <ArrowUpCircle class="w-5 h-5 animate-pulse text-emerald-400" />
      </div>
      <div class="min-w-0">
        <div class="flex items-center gap-2 flex-wrap">
          <span class="font-semibold text-sm text-slate-100 truncate">
            {{ t("settings.appUpdateAvailableBanner", { version: availableUpdate.version }) }}
          </span>
          <span
            class="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-medium shrink-0"
          >
            New
          </span>
        </div>
        <p v-if="pubDate" class="text-xs text-slate-400 mt-0.5">
          {{ t("settings.publishedAt") }}: {{ pubDate }}
        </p>
      </div>
    </div>

    <div class="flex items-center gap-3 shrink-0">
      <!-- Download progress -->
      <div
        v-if="isInstallingUpdate && updateContentLength"
        class="flex items-center gap-3 text-xs text-slate-300"
      >
        <div
          class="w-32 sm:w-40 bg-slate-900 rounded-full h-2 overflow-hidden border border-emerald-500/30"
        >
          <div
            class="bg-emerald-400 h-full transition-all duration-300"
            :style="{
              width: `${Math.min(
                100,
                Math.round((updateDownloadedBytes / updateContentLength) * 100)
              )}%`,
            }"
          />
        </div>
        <span class="font-mono">
          {{ formatByteCount(updateDownloadedBytes) }} / {{ formatByteCount(updateContentLength) }}
        </span>
      </div>

      <button
        type="button"
        :disabled="isInstallingUpdate"
        class="flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 active:from-emerald-700 active:to-teal-700 text-white shadow-md shadow-emerald-900/30 border border-emerald-500/30 transition-all disabled:opacity-50 cursor-pointer shrink-0"
        @click="store.installUpdate"
      >
        <template v-if="isInstallingUpdate">
          <Loader2 class="w-3.5 h-3.5 animate-spin" />
          <span>{{ t("settings.installingUpdate") }}</span>
        </template>
        <template v-else>
          <Download class="w-3.5 h-3.5" />
          <span>{{ t("settings.downloadAndInstall") }}</span>
        </template>
      </button>

      <button
        v-if="!isInstallingUpdate"
        type="button"
        class="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 transition-colors cursor-pointer shrink-0"
        :title="t('common.close')"
        :aria-label="t('common.close')"
        @click="store.dismissBanner"
      >
        <X class="w-4 h-4" />
      </button>
    </div>
  </div>
</template>
