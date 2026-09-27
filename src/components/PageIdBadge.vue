<script setup lang="ts">
import { ref, computed } from "vue";
import { useRoute } from "vue-router";
import { Copy, Check } from "lucide-vue-next";
import { useDebugModeStore } from "@/stores/debugMode";
import { reportFrontendError } from "@/logging";

export interface PageIdBadgeProps {
  pageId?: string;
}

const props = defineProps<PageIdBadgeProps>();
const route = useRoute();
const debugStore = useDebugModeStore();

const PAGE_FILE_MAP: Record<string, string> = {
  market: "src/pages/SkillMarketPage.vue",
  installed: "src/pages/InstalledPage.vue",
  presets: "src/pages/PresetsPage.vue",
  agents: "src/pages/AgentsPage.vue",
  migration: "src/pages/MigrationPage.vue",
  projects: "src/pages/ProjectsPage.vue",
  "project-detail": "src/pages/ProjectDetailPage.vue",
  "project-groups": "src/pages/ProjectGroupsPage.vue",
  settings: "src/pages/SettingsPage.vue",
};

const displayPageId = computed(() => {
  if (props.pageId) return props.pageId;
  const routeName = String(route?.name || "");
  if (PAGE_FILE_MAP[routeName]) {
    return PAGE_FILE_MAP[routeName];
  }
  const cleanPath = route?.path?.replace(/^\//, "") || "market";
  return PAGE_FILE_MAP[cleanPath] || `src/pages/${cleanPath}.vue`;
});

const copied = ref(false);
let copiedTimer: ReturnType<typeof setTimeout> | undefined;

async function handleCopy() {
  try {
    await navigator.clipboard.writeText(displayPageId.value);
    copied.value = true;
    if (copiedTimer) clearTimeout(copiedTimer);
    copiedTimer = setTimeout(() => {
      copied.value = false;
    }, 2000);
  } catch (err) {
    reportFrontendError("Failed to copy page ID", err, "PageIdBadge");
  }
}
</script>

<template>
  <div
    v-if="debugStore.debugMode"
    class="inline-flex items-center gap-2 px-3 py-1 bg-slate-900/90 border border-slate-800 rounded-lg text-xs font-mono text-slate-400 transition-colors hover:border-slate-700"
  >
    <span class="text-slate-500 select-none">ID:</span>
    <span class="font-semibold text-slate-200 select-all">{{ displayPageId }}</span>
    <button
      type="button"
      class="ml-1 p-1 text-slate-400 hover:text-emerald-400 hover:bg-slate-800/80 rounded transition-colors focus:outline-none cursor-pointer"
      title="Copy Page ID"
      @click="handleCopy"
    >
      <span v-if="copied" class="flex items-center gap-1 text-emerald-400 font-medium font-sans">
        <Check class="w-3.5 h-3.5" />
        <span class="text-[11px]">Copied</span>
      </span>
      <Copy v-else class="w-3.5 h-3.5" />
    </button>
  </div>
</template>
