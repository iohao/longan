<script setup lang="ts">
import { computed } from "vue";
import { Loader2 } from "lucide-vue-next";
import { cn } from "./cn";

export interface ButtonProps {
  variant?: "primary" | "secondary" | "outline" | "ghost" | "danger" | "amber";
  size?: "sm" | "md" | "lg" | "icon";
  type?: "button" | "submit" | "reset";
  loading?: boolean;
  disabled?: boolean;
  class?: string;
}

const props = withDefaults(defineProps<ButtonProps>(), {
  variant: "primary",
  size: "md",
  type: "button",
  loading: false,
  disabled: false,
  class: "",
});

const emit = defineEmits<{
  (e: "click", event: MouseEvent): void;
}>();

const buttonClasses = computed(() => {
  const base =
    "inline-flex cursor-pointer items-center justify-center font-medium rounded-lg transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-950 disabled:opacity-50 disabled:cursor-not-allowed select-none active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100";

  const variants = {
    primary:
      "bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-600/20 focus:ring-emerald-500 border border-emerald-500/30",
    secondary:
      "bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700/60 focus:ring-slate-500",
    outline:
      "bg-transparent hover:bg-slate-800/40 text-slate-300 border border-slate-700 hover:border-slate-500 focus:ring-slate-500",
    ghost:
      "bg-transparent hover:bg-slate-800/60 text-slate-300 hover:text-slate-100 focus:ring-slate-500",
    danger:
      "bg-rose-600/90 hover:bg-rose-500 text-white shadow-md shadow-rose-600/20 border border-rose-500/30 focus:ring-rose-500",
    amber:
      "bg-amber-600 hover:bg-amber-500 text-white shadow-md shadow-amber-600/20 border border-amber-500/30 focus:ring-amber-500",
  };

  const sizes = {
    sm: "h-8 px-2.5 text-xs gap-1.5",
    md: "h-9 px-3.5 text-sm gap-2",
    lg: "h-10 px-5 text-base gap-2.5",
    icon: "h-8 w-8 p-0 text-sm",
  };

  return cn(base, variants[props.variant], sizes[props.size], props.class);
});
</script>

<template>
  <button
    :type="type"
    :class="buttonClasses"
    :disabled="disabled || loading"
    @click="(e) => emit('click', e)"
  >
    <Loader2 v-if="loading" class="w-4 h-4 animate-spin shrink-0 motion-reduce:animate-none" />
    <slot v-else name="icon" />
    <slot />
  </button>
</template>
