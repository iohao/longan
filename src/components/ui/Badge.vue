<script setup lang="ts">
import { computed } from "vue";
import { cn } from "./cn";

export interface BadgeProps {
  variant?: "success" | "warning" | "danger" | "info" | "neutral";
  pulse?: boolean;
  class?: string;
}

const props = withDefaults(defineProps<BadgeProps>(), {
  variant: "neutral",
  pulse: false,
  class: "",
});

const variantClasses = {
  success: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  warning: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  danger: "bg-rose-500/10 text-rose-400 border-rose-500/20",
  info: "bg-sky-500/10 text-sky-400 border-sky-500/20",
  neutral: "bg-slate-800 text-slate-400 border-slate-700/60",
};

const pulseColors = {
  success: "bg-emerald-400",
  warning: "bg-amber-400",
  danger: "bg-rose-400",
  info: "bg-sky-400",
  neutral: "bg-slate-400",
};

const badgeClasses = computed(() => {
  const base =
    "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium border";
  return cn(base, variantClasses[props.variant], props.class);
});
</script>

<template>
  <span :class="badgeClasses">
    <span v-if="pulse" class="relative flex h-1.5 w-1.5 shrink-0" aria-hidden="true">
      <span
        :class="[
          'animate-ping absolute inline-flex h-full w-full rounded-full opacity-75',
          pulseColors[variant],
        ]"
      />
      <span
        :class="['relative inline-flex rounded-full h-1.5 w-1.5', pulseColors[variant]]"
      />
    </span>
    <slot name="icon" />
    <slot />
  </span>
</template>
