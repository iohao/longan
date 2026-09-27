<script setup lang="ts">
import { ref, onMounted, onUnmounted, provide } from "vue";
import { useRouter } from "vue-router";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { exit } from "@tauri-apps/plugin-process";
import Sidebar from "@/components/Sidebar.vue";
import UpdateBanner from "@/components/UpdateBanner.vue";
import PageIdBadge from "@/components/PageIdBadge.vue";
import AppErrorBoundary from "@/components/AppErrorBoundary.vue";
import { useDebugModeStore } from "@/stores/debugMode";
import { useProjectStore } from "@/stores/project";
import { useAppUpdateStore } from "@/stores/appUpdate";
import { useSkillUpdateStore } from "@/stores/skillUpdate";
import { api } from "@/api";
import { initTheme } from "@/utils/theme";
import { registerNavigationShortcuts } from "@/utils/navigation";

const scrollContainerRef = ref<HTMLElement | null>(null);
provide("appScrollElement", scrollContainerRef);

const router = useRouter();
const debugStore = useDebugModeStore();
const projectStore = useProjectStore();
const appUpdateStore = useAppUpdateStore();
const skillUpdateStore = useSkillUpdateStore();

let cleanupCloseListener: (() => void) | undefined;
let cleanupShortcuts: (() => void) | undefined;
let cleanupAppUpdate: (() => void) | undefined;
let cleanupDebugListener: (() => void) | undefined;
let isClosing = false;

function handleNavigateToProject(event: Event) {
  const customEvt = event as CustomEvent<number>;
  if (customEvt.detail !== undefined) {
    router.push({ name: "project-detail", params: { id: customEvt.detail } }).catch(() => {});
  }
}

function handleNavigateToAgents() {
  router.push({ name: "agents" }).catch(() => {});
}

onMounted(async () => {
  initTheme();
  cleanupAppUpdate = appUpdateStore.init();
  cleanupDebugListener = debugStore.initStorageListener();
  skillUpdateStore.initEventListener();
  await projectStore.reloadProjects();

  cleanupShortcuts = registerNavigationShortcuts((pageKey) => {
    router.push({ name: pageKey }).catch(() => {});
  });

  window.addEventListener("navigateToProject", handleNavigateToProject);
  window.addEventListener("navigateToAgents", handleNavigateToAgents);

  if ("__TAURI_INTERNALS__" in window) {
    const appWindow = getCurrentWindow();
    cleanupCloseListener = await appWindow.onCloseRequested(async (event) => {
      if (isClosing) return;
      event.preventDefault();
      isClosing = true;
      try {
        await appWindow.hide();
      } catch {}
      try {
        await Promise.all([
          api.cancelSkillInstalls(),
          api.cancelSkillUpdates(),
        ]);
      } catch {}
      try {
        await exit(0);
      } catch {
        await appWindow.destroy();
      }
    });
  }
});

onUnmounted(() => {
  cleanupCloseListener?.();
  cleanupShortcuts?.();
  cleanupAppUpdate?.();
  cleanupDebugListener?.();
  window.removeEventListener("navigateToProject", handleNavigateToProject);
  window.removeEventListener("navigateToAgents", handleNavigateToAgents);
});
</script>

<template>
  <AppErrorBoundary>
    <div class="flex flex-col h-screen bg-slate-950 text-slate-100 font-sans overflow-hidden">
      <UpdateBanner />

      <div class="flex flex-1 min-h-0 overflow-hidden">
        <Sidebar />

        <main
          ref="scrollContainerRef"
          class="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-y-none bg-gradient-to-b from-slate-950 via-slate-900/60 to-slate-950"
        >
          <div
            v-if="debugStore.debugMode"
            class="px-8 py-3 border-b border-slate-800/60 bg-slate-950/80 backdrop-blur-md sticky top-0 z-20 flex items-center justify-between shrink-0"
          >
            <PageIdBadge />
          </div>

          <div class="flex-1 p-8 flex flex-col">
            <router-view v-slot="{ Component }">
              <transition name="fade" mode="out-in">
                <component :is="Component" />
              </transition>
            </router-view>
          </div>
        </main>
      </div>
    </div>
  </AppErrorBoundary>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
