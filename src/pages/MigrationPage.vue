<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import { ArrowLeftRight, Download, Upload } from "lucide-vue-next";
import { useI18n } from "vue-i18n";
import ProfileExportPanel from "@/components/migration/ProfileExportPanel.vue";
import ProfileImportPanel from "@/components/migration/ProfileImportPanel.vue";

export interface MigrationPageProps {
  onProfileImported?: () => void | Promise<void>;
  onGoToPresets?: () => void;
}

const props = withDefaults(defineProps<MigrationPageProps>(), {
  onProfileImported: undefined,
  onGoToPresets: undefined,
});

const emit = defineEmits<{
  (e: "profileImported"): void;
  (e: "goToPresets"): void;
}>();

const { t } = useI18n();
const router = useRouter();

type TransferMode = "export" | "import";

const mode = ref<TransferMode>("export");
const importBusy = ref(false);

function handleGoToPresets() {
  if (props.onGoToPresets) {
    props.onGoToPresets();
  }
  emit("goToPresets");
  router.push({ name: "presets" }).catch(() => {});
}

async function handleProfileImported() {
  await props.onProfileImported?.();
  emit("profileImported");
}
</script>

<template>
  <div class="w-full max-w-5xl space-y-6">
    <header class="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
      <div class="min-w-0">
        <div class="flex items-center gap-3">
          <span
            class="flex size-10 shrink-0 items-center justify-center rounded-lg border border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
          >
            <ArrowLeftRight class="size-5" aria-hidden="true" />
          </span>
          <h1 class="text-2xl font-bold text-slate-100">
            {{ t("nav.migration") }}
          </h1>
        </div>
        <p class="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
          {{ t("migration.pageDesc") }}
        </p>
      </div>

      <div
        class="grid min-h-11 shrink-0 grid-cols-2 rounded-lg border border-slate-700 bg-slate-900/70 p-1"
        role="group"
        :aria-label="t('migration.modeLabel')"
      >
        <button
          type="button"
          :aria-pressed="mode === 'export'"
          aria-controls="migration-export-panel"
          :disabled="importBusy"
          :class="[
            'inline-flex min-h-9 cursor-pointer items-center justify-center gap-2 rounded-md px-4 text-sm font-medium transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/70 disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none',
            mode === 'export'
              ? 'bg-slate-700 text-slate-50 shadow-sm'
              : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200',
          ]"
          @click="mode = 'export'"
        >
          <Download class="size-4" aria-hidden="true" />
          <span>{{ t("migration.exportMode") }}</span>
        </button>

        <button
          type="button"
          :aria-pressed="mode === 'import'"
          aria-controls="migration-import-panel"
          :disabled="importBusy"
          :class="[
            'inline-flex min-h-9 cursor-pointer items-center justify-center gap-2 rounded-md px-4 text-sm font-medium transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/70 disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none',
            mode === 'import'
              ? 'bg-slate-700 text-slate-50 shadow-sm'
              : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200',
          ]"
          @click="mode = 'import'"
        >
          <Upload class="size-4" aria-hidden="true" />
          <span>{{ t("migration.importMode") }}</span>
        </button>
      </div>
    </header>

    <div class="overflow-hidden rounded-lg border border-slate-800 bg-slate-900/60 shadow-sm">
      <div id="migration-export-panel" :hidden="mode !== 'export'">
        <ProfileExportPanel />
      </div>
      <div id="migration-import-panel" :hidden="mode !== 'import'">
        <ProfileImportPanel
          @busy-change="(b) => importBusy = b"
          @profile-imported="handleProfileImported"
          @go-to-presets="handleGoToPresets"
        />
      </div>
    </div>
  </div>
</template>
