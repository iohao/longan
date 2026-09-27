<script setup lang="ts">
import { cn } from "./cn";

export interface HoverActionGroupProps {
  class?: string;
}

const props = withDefaults(defineProps<HoverActionGroupProps>(), {
  class: "",
});
</script>

<template>
  <span
    :class="
      cn(
        'flex shrink-0 items-center gap-1.5 opacity-0 pointer-events-none transition-opacity duration-200 group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto [@media(hover:none)]:opacity-100 [@media(hover:none)]:pointer-events-auto',
        props.class
      )
    "
  >
    <slot />
  </span>
</template>
