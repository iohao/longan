<script setup lang="ts">
import { computed } from "vue";
import { FolderOpen } from "lucide-vue-next";
import { cn } from "./cn";

export interface EmptyStateProps {
  title: string;
  description?: string;
  class?: string;
}

const props = withDefaults(defineProps<EmptyStateProps>(), {
  description: "",
  class: "",
});

const containerClasses = computed(() =>
  cn(
    "flex flex-col items-center justify-center p-12 text-center border border-dashed border-slate-800 rounded-2xl bg-slate-900/30",
    props.class,
  ),
);
</script>

<template>
  <div :class="containerClasses">
    <div class="p-3 bg-slate-900 rounded-xl border border-slate-800 mb-3 shadow-inner">
      <slot name="icon">
        <FolderOpen class="w-8 h-8 text-slate-500" />
      </slot>
    </div>
    <h3 class="text-sm font-semibold text-slate-200 mb-1">{{ title }}</h3>
    <p v-if="description" class="text-xs text-slate-400 max-w-sm mb-4 leading-relaxed">
      {{ description }}
    </p>
    <div v-if="$slots.action" class="mt-2">
      <slot name="action" />
    </div>
  </div>
</template>
