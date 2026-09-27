<script setup lang="ts">
import { ref, onErrorCaptured } from "vue";
import { useI18n } from "vue-i18n";
import { reportFrontendError } from "@/logging";

const { t } = useI18n();
const hasFailed = ref(false);

onErrorCaptured((error, instance, info) => {
  reportFrontendError(
    `Vue render failed (${info})`,
    error,
    "vue.error-boundary",
  );
  hasFailed.value = true;
  return false; // prevent further propagation
});

function reloadApp() {
  window.location.reload();
}
</script>

<template>
  <slot v-if="!hasFailed" />

  <main
    v-else
    class="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-slate-100"
  >
    <div class="max-w-md text-center">
      <h1 class="text-lg font-semibold">{{ t("errors.appCrashedTitle") }}</h1>
      <p class="mt-2 text-sm text-slate-400">{{ t("errors.appCrashedHint") }}</p>
      <button
        type="button"
        class="mt-5 rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-400 cursor-pointer"
        @click="reloadApp"
      >
        {{ t("errors.reloadApp") }}
      </button>
    </div>
  </main>
</template>
