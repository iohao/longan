<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    class?: string;
  }>(),
  {
    class: "h-3.5 w-3.5",
  },
);
</script>

<template>
  <svg
    :class="props.class"
    viewBox="0 0 16 16"
    aria-hidden="true"
  >
    <path
      fill="currentColor"
      fill-rule="evenodd"
      clip-rule="evenodd"
      d="M8 1L16 15H0L8 1Z"
    />
  </svg>
</template>
