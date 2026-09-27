<script setup lang="ts">
import { computed } from "vue";
import { cn } from "./cn";

export interface CardProps {
  hoverEffect?: boolean;
  class?: string;
}

const props = withDefaults(defineProps<CardProps>(), {
  hoverEffect: true,
  class: "",
});

const cardClasses = computed(() =>
  cn(
    "glass-card rounded-xl overflow-hidden",
    props.hoverEffect && "transition-all duration-200",
    props.class,
  ),
);
</script>

<template>
  <div :class="cardClasses">
    <div v-if="$slots.header" class="px-5 py-4 border-b border-slate-800/80">
      <slot name="header" />
    </div>
    <div class="p-5">
      <slot />
    </div>
    <div v-if="$slots.footer" class="px-5 py-3 bg-slate-900/40 border-t border-slate-800/80">
      <slot name="footer" />
    </div>
  </div>
</template>
