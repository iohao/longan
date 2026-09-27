<script setup lang="ts">
import { ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { AlertCircle, FolderOpen, Loader2 } from "lucide-vue-next";
import { api, errorMessage } from "@/api";
import type { Preset, PresetProjectReference } from "@/types";
import Dialog from "@/components/ui/Dialog.vue";

export interface PresetReferenceModalProps {
  preset: Preset | null;
  isOpen: boolean;
}

const props = defineProps<PresetReferenceModalProps>();

const emit = defineEmits<{
  (e: "close"): void;
}>();

const { t } = useI18n();

const references = ref<PresetProjectReference[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);

async function loadReferences(presetId: number) {
  loading.value = true;
  error.value = null;
  try {
    const loaded = await api.presetProjectReferences(presetId);
    references.value = loaded;
  } catch (err) {
    references.value = [];
    error.value = errorMessage(err);
  } finally {
    loading.value = false;
  }
}

watch(
  () => [props.isOpen, props.preset?.id],
  ([open, id]) => {
    if (open && typeof id === "number") {
      void loadReferences(id);
    } else {
      references.value = [];
      error.value = null;
    }
  },
  { immediate: true },
);
</script>

<template>
  <Dialog
    :open="isOpen"
    :title="preset ? t('presets.referenceModalTitle', { name: preset.name }) : ''"
    size="lg"
    @close="emit('close')"
  >
    <div v-if="preset" class="space-y-4">
      <div
        v-if="loading"
        role="status"
        class="flex min-h-36 items-center justify-center gap-2 text-sm text-slate-400"
      >
        <Loader2 class="h-4 w-4 animate-spin text-emerald-400" />
        <span>{{ t("common.loading") }}</span>
      </div>

      <div
        v-else-if="error"
        role="alert"
        class="flex items-start gap-2 rounded-lg border border-rose-500/25 bg-rose-500/10 p-3 text-sm text-rose-300"
      >
        <AlertCircle class="mt-0.5 h-4 w-4 shrink-0" />
        <span class="min-w-0 break-words">
          {{ t("presets.referenceLoadFailed", { error }) }}
        </span>
      </div>

      <div
        v-else-if="references.length === 0"
        class="flex min-h-36 items-center justify-center rounded-lg border border-dashed border-slate-700/80 px-6 text-center"
      >
        <p className="text-sm text-slate-500">{{ t("presets.noProjectReferences") }}</p>
      </div>

      <template v-else>
        <div
          class="flex items-center justify-between gap-3 rounded-lg border border-slate-700/60 bg-slate-800/40 px-3 py-2.5"
        >
          <div class="flex min-w-0 items-center gap-2 text-sm text-slate-300">
            <FolderOpen class="h-4 w-4 shrink-0 text-emerald-400" />
            <span>{{ t("presets.referencedProjects") }}</span>
          </div>
          <span class="shrink-0 font-mono text-xs font-semibold text-emerald-400">
            {{ references.length }}
          </span>
        </div>

        <div class="max-h-[480px] space-y-2 overflow-y-auto pr-1 custom-scrollbar">
          <div
            v-for="reference in references"
            :key="reference.id"
            class="rounded-lg border border-slate-700/60 bg-slate-800/35 px-3 py-2.5 transition-colors hover:border-emerald-500/30"
          >
            <div class="flex min-w-0 items-center gap-2">
              <FolderOpen class="h-3.5 w-3.5 shrink-0 text-slate-500" />
              <span
                class="truncate text-sm font-medium text-slate-200"
                :title="reference.name"
              >
                {{ reference.name }}
              </span>
            </div>
            <p
              class="mt-1 truncate pl-5.5 font-mono text-xs text-slate-500"
              :title="reference.path"
            >
              {{ reference.path }}
            </p>
          </div>
        </div>

        <p class="text-xs text-slate-500">
          {{ t("presets.referenceSummary", { count: references.length }) }}
        </p>
      </template>
    </div>
  </Dialog>
</template>
