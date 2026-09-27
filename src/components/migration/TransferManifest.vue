<script setup lang="ts">
import { ArrowRight, Database, FileJson } from "lucide-vue-next";
import { useI18n } from "vue-i18n";

export interface TransferManifestProps {
  direction: "export" | "import";
  filename: string;
}

defineProps<TransferManifestProps>();

const { t } = useI18n();
</script>

<template>
  <div
    class="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 border-b border-slate-800 bg-slate-950/30 px-5 py-4 sm:gap-5 sm:px-6"
  >
    <!-- Left component -->
    <div v-if="direction === 'export'" class="flex min-w-0 items-center gap-3">
      <span
        class="flex size-10 shrink-0 items-center justify-center rounded-lg border border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
      >
        <Database class="size-5" aria-hidden="true" />
      </span>
      <div class="min-w-0">
        <p class="text-xs text-slate-500">{{ t("migration.libraryLabel") }}</p>
        <p class="truncate text-sm font-medium text-slate-100">Longan</p>
      </div>
    </div>
    <div v-else class="flex min-w-0 items-center gap-3">
      <span
        class="flex size-10 shrink-0 items-center justify-center rounded-lg border border-sky-500/20 bg-sky-500/10 text-sky-400"
      >
        <FileJson class="size-5" aria-hidden="true" />
      </span>
      <div class="min-w-0">
        <p class="text-xs text-slate-500">{{ t("migration.profileFileLabel") }}</p>
        <p class="truncate font-mono text-sm text-slate-100">{{ filename }}</p>
      </div>
    </div>

    <!-- Arrow in middle -->
    <ArrowRight class="size-4 shrink-0 text-slate-600" aria-hidden="true" />

    <!-- Right component -->
    <div v-if="direction === 'export'" class="flex min-w-0 items-center gap-3">
      <span
        class="flex size-10 shrink-0 items-center justify-center rounded-lg border border-sky-500/20 bg-sky-500/10 text-sky-400"
      >
        <FileJson class="size-5" aria-hidden="true" />
      </span>
      <div class="min-w-0">
        <p class="text-xs text-slate-500">{{ t("migration.profileFileLabel") }}</p>
        <p class="truncate font-mono text-sm text-slate-100">{{ filename }}</p>
      </div>
    </div>
    <div v-else class="flex min-w-0 items-center gap-3">
      <span
        class="flex size-10 shrink-0 items-center justify-center rounded-lg border border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
      >
        <Database class="size-5" aria-hidden="true" />
      </span>
      <div class="min-w-0">
        <p class="text-xs text-slate-500">{{ t("migration.libraryLabel") }}</p>
        <p class="truncate text-sm font-medium text-slate-100">Longan</p>
      </div>
    </div>
  </div>
</template>
