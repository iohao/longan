<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import type { SkillTriggerMode } from "@/types";
import { resolveSkillTriggerMode } from "@/utils/skillTrigger";
import { cn } from "./cn";

export interface TriggerBadgeProps {
  skill?: { trigger_mode?: string | null; description?: string | null } | null;
  mode?: SkillTriggerMode;
  class?: string;
}

const props = withDefaults(defineProps<TriggerBadgeProps>(), {
  skill: undefined,
  mode: undefined,
  class: "",
});

const { t } = useI18n();

const effectiveMode = computed<SkillTriggerMode>(() => {
  if (props.mode) return props.mode;
  return resolveSkillTriggerMode(props.skill);
});

const modeClass = computed(() => {
  switch (effectiveMode.value) {
    case "command":
      return "bg-orange-500/20 text-orange-300";
    case "intent":
      return "bg-purple-500/20 text-purple-300";
    case "hybrid":
    default:
      return "bg-transparent text-slate-200";
  }
});
</script>

<template>
  <span
    :class="
      cn(
        'inline-flex shrink-0 items-center overflow-hidden rounded border border-slate-700/60 text-[10px] font-medium leading-none',
        props.class,
      )
    "
  >
    <span
      class="border-r border-emerald-500/30 bg-emerald-500/20 px-1.5 py-0.5 text-emerald-300"
    >
      {{ t("library.trigger.prefix") }}
    </span>
    <span :class="['px-1.5 py-0.5', modeClass]">
      {{ t(`library.trigger.${effectiveMode}`) }}
    </span>
  </span>
</template>
