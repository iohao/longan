<script setup lang="ts">
import { Link } from "lucide-vue-next";
import { cn } from "./cn";

export interface ReferenceCountProps {
  count?: number;
  countLabel: string;
  viewLabel: string;
  class?: string;
}

const props = withDefaults(defineProps<ReferenceCountProps>(), {
  count: undefined,
  class: "",
});

const emit = defineEmits<{
  (e: "view"): void;
}>();

function handleClick(event: MouseEvent) {
  event.stopPropagation();
  emit("view");
}
</script>

<template>
  <template v-if="count !== undefined">
    <button
      v-if="count > 0"
      type="button"
      :title="viewLabel"
      :aria-label="viewLabel"
      :class="
        cn(
          'group/reference flex shrink-0 cursor-pointer items-center gap-1 rounded px-1.5 py-1 text-xs text-emerald-400 transition-[background-color,color,transform] hover:bg-emerald-500/10 hover:text-emerald-300 active:scale-95 active:bg-emerald-500/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60 motion-reduce:transition-none motion-reduce:active:scale-100',
          props.class
        )
      "
      @click="handleClick"
      @keydown.stop
    >
      <Link
        aria-hidden="true"
        class="h-3 w-3 transition-transform group-hover/reference:scale-110 motion-reduce:transition-none"
      />
      <span aria-hidden="true">{{ count }}</span>
    </button>

    <span
      v-else
      :title="countLabel"
      :class="cn('flex shrink-0 items-center gap-1 px-1 text-xs text-slate-500', props.class)"
    >
      <Link aria-hidden="true" class="h-3 w-3" />
      <span aria-hidden="true">{{ count }}</span>
      <span class="sr-only">{{ countLabel }}</span>
    </span>
  </template>
</template>
