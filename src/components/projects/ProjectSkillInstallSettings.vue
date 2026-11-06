<script setup lang="ts">
import { shallowRef, watch } from "vue";
import { useI18n } from "vue-i18n";
import { Settings2 } from "lucide-vue-next";
import type { SkillInstallMode } from "@/types";
import Button from "@/components/ui/Button.vue";
import Card from "@/components/ui/Card.vue";

const props = defineProps<{
  mode: SkillInstallMode;
  pathExists: boolean;
  saving: boolean;
}>();
const emit = defineEmits<{ apply: [mode: SkillInstallMode] }>();
const { t } = useI18n();
const selectedMode = shallowRef<SkillInstallMode>(props.mode);
watch(() => props.mode, (mode) => { selectedMode.value = mode; });
</script>

<template>
  <Card :hover-effect="false">
    <div class="mb-4 flex items-center gap-2 border-b border-slate-800/80 pb-3">
      <Settings2 class="h-4 w-4 text-emerald-400" aria-hidden="true" />
      <h2 class="text-sm font-semibold text-slate-100">{{ t("nav.settings") }}</h2>
    </div>
    <form class="space-y-4" :aria-busy="saving" @submit.prevent="emit('apply', selectedMode)">
      <fieldset :disabled="saving || !pathExists" class="space-y-3">
        <legend class="mb-1 text-sm font-medium text-slate-100">
          {{ t("projects.installMode") }}
        </legend>
        <p class="text-xs leading-relaxed text-slate-400">{{ t("projects.installModeScope") }}</p>
        <label
          v-for="modeOption in (['symlink', 'copy'] as const)"
          :key="modeOption"
          class="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-800 bg-slate-900/40 p-3 text-sm focus-within:ring-2 focus-within:ring-emerald-400/70"
        >
          <input
            v-model="selectedMode"
            type="radio"
            name="skill-install-mode"
            :value="modeOption"
            class="mt-1 accent-emerald-400"
          />
          <span class="space-y-1">
            <span class="block font-medium text-slate-100">
              {{ modeOption === 'symlink' ? t("projects.symlinkMode") : t("projects.copyMode") }}
            </span>
            <span class="block text-xs leading-relaxed text-slate-400">
              {{ modeOption === 'symlink' ? t("projects.symlinkModeDesc") : t("projects.copyModeDesc") }}
            </span>
          </span>
        </label>
      </fieldset>
      <p class="text-xs leading-relaxed text-slate-400">{{ t("projects.installModeConversionHint") }}</p>
      <p v-if="!pathExists" class="text-xs text-amber-300">{{ t("projects.installModePathMissing") }}</p>
      <Button
        type="submit"
        size="sm"
        :loading="saving"
        :disabled="saving || !pathExists || selectedMode === mode"
      >
        {{ saving ? t("projects.convertingMode") : t("projects.applyInstallMode") }}
      </Button>
    </form>
  </Card>
</template>
