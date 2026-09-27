<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { GitMerge, Link2, X } from "lucide-vue-next";
import type { Preset } from "@/types";
import Button from "@/components/ui/Button.vue";
import Card from "@/components/ui/Card.vue";

export interface PresetSummaryPanelProps {
  preset: Preset;
  sourcePresets: Preset[];
  directCount: number;
  inheritedCount: number;
  effectiveCount: number;
  isSubmitting: boolean;
}

defineProps<PresetSummaryPanelProps>();

const emit = defineEmits<{
  (e: "reuse"): void;
  (e: "removeSource", presetId: number): void;
}>();

const { t } = useI18n();
</script>

<template>
  <section aria-labelledby="active-preset-summary-title">
    <Card :hover-effect="false">
      <div class="min-w-0">
        <h2
          id="active-preset-summary-title"
          class="text-xl font-bold text-slate-100 break-words"
        >
          {{ preset.name }}
        </h2>
        <p
          v-if="preset.description"
          class="mt-1.5 max-w-3xl text-sm leading-relaxed text-slate-400 break-words"
        >
          {{ preset.description }}
        </p>
        <p v-else class="mt-1.5 text-xs italic text-slate-500">
          {{ t("presets.noDescription") }}
        </p>
      </div>

      <div
        role="group"
        :aria-label="t('presets.skillComposition')"
        class="mt-5 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 border-y border-slate-800/80 py-4"
      >
        <div class="flex min-w-0 flex-col items-center gap-0.5 text-center">
          <span class="order-2 text-[11px] font-medium text-slate-500">
            {{ t("presets.directSkills") }}
          </span>
          <span
            class="order-1 font-mono text-lg font-semibold tabular-nums text-emerald-300"
          >
            {{ directCount }}
          </span>
        </div>
        <span aria-hidden="true" class="text-base font-medium text-slate-600">+</span>
        <div class="flex min-w-0 flex-col items-center gap-0.5 text-center">
          <span class="order-2 text-[11px] font-medium text-slate-500">
            {{ t("presets.inheritedSkills") }}
          </span>
          <span class="order-1 font-mono text-lg font-semibold tabular-nums text-sky-300">
            {{ inheritedCount }}
          </span>
        </div>
        <span aria-hidden="true" class="text-base font-medium text-slate-600">=</span>
        <div class="flex min-w-0 flex-col items-center gap-0.5 text-center">
          <span class="order-2 text-[11px] font-medium text-slate-400">
            {{ t("presets.effectiveSkills") }}
          </span>
          <span
            class="order-1 font-mono text-lg font-semibold tabular-nums text-slate-100"
          >
            {{ effectiveCount }}
          </span>
        </div>
      </div>

      <div
        class="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
      >
        <div class="min-w-0 flex-1">
          <p class="text-xs font-semibold text-slate-300">
            {{ t("presets.composedFrom") }}
          </p>
          <div class="mt-2 flex min-w-0 flex-wrap items-center gap-2">
            <template v-if="sourcePresets.length > 0">
              <span
                v-for="source in sourcePresets"
                :key="source.id"
                class="inline-flex min-h-8 min-w-0 max-w-full items-center gap-1 rounded-md border border-sky-500/25 bg-sky-500/10 pl-2.5 pr-1 text-xs text-sky-300"
              >
                <Link2 aria-hidden="true" class="h-3.5 w-3.5 shrink-0" />
                <span class="min-w-0 truncate" :title="source.name">
                  {{ source.name }}
                </span>
                <button
                  type="button"
                  :disabled="isSubmitting"
                  :title="t('presets.unlinkSource', { name: source.name })"
                  :aria-label="t('presets.unlinkSource', { name: source.name })"
                  class="ml-0.5 inline-flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded text-sky-400 transition-colors hover:bg-sky-500/20 hover:text-sky-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/70 disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none"
                  @click="emit('removeSource', source.id)"
                >
                  <X aria-hidden="true" class="h-3.5 w-3.5" />
                </button>
              </span>
            </template>
            <span v-else class="text-xs text-slate-500">
              {{ t("presets.noComposedSources") }}
            </span>
          </div>
        </div>

        <Button
          variant="secondary"
          size="sm"
          :disabled="isSubmitting"
          class="w-full shrink-0 sm:w-auto"
          @click="emit('reuse')"
        >
          <GitMerge aria-hidden="true" class="h-3.5 w-3.5" />
          <span>{{ t("presets.reusePreset") }}</span>
        </Button>
      </div>
    </Card>
  </section>
</template>
