<script setup lang="ts">
import { computed } from "vue";
import { cn } from "./cn";

export interface SkeletonProps {
  variant?: "text" | "line" | "rectangle" | "circle";
  width?: string | number;
  height?: string | number;
  class?: string;
}

const props = withDefaults(defineProps<SkeletonProps>(), {
  variant: "text",
  width: undefined,
  height: undefined,
  class: "",
});

const variantClasses = {
  text: "h-4 w-full",
  line: "h-4 w-full",
  rectangle: "w-full",
  circle: "rounded-full h-8 w-8",
};

const style = computed(() => ({
  width: props.width
    ? typeof props.width === "number"
      ? `${props.width}px`
      : props.width
    : undefined,
  height: props.height
    ? typeof props.height === "number"
      ? `${props.height}px`
      : props.height
    : undefined,
}));

const skeletonClasses = computed(() =>
  cn(
    "animate-pulse rounded bg-slate-700/50",
    variantClasses[props.variant],
    props.class,
  ),
);
</script>

<template>
  <div :class="skeletonClasses" :style="style" role="status" aria-label="Loading...">
    <slot />
  </div>
</template>
