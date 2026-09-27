<script setup lang="ts">
import { computed } from "vue";
import { cn } from "./cn";

export interface SettingsSectionProps {
  id: string;
  isActive?: boolean;
  specialEffect?: "default" | "strong" | "doctor";
  class?: string;
}

const props = withDefaults(defineProps<SettingsSectionProps>(), {
  isActive: false,
  specialEffect: "default",
  class: "",
});

const shadowClass = computed(() => {
  switch (props.specialEffect) {
    case "strong":
      return "shadow-[0_0_48px_-12px_rgba(16,185,129,0.6)]";
    case "doctor":
      return "shadow-[0_0_56px_-12px_rgba(16,185,129,0.7)]";
    case "default":
    default:
      return "shadow-[0_0_32px_-8px_rgba(16,185,129,0.4)]";
  }
});

const heightClass = computed(() => {
  switch (props.specialEffect) {
    case "strong":
      return "h-1.5";
    case "default":
    case "doctor":
    default:
      return "h-1";
  }
});
</script>

<template>
  <div :id="id" class="scroll-mt-6">
    <div
      :class="
        cn(
          'relative overflow-hidden transition-all duration-500',
          isActive && ['border-emerald-500', shadowClass],
          props.class
        )
      "
    >
      <!-- Active glow effect -->
      <template v-if="isActive">
        <div
          :class="[
            'absolute top-0 left-0 right-0 bg-gradient-to-r from-transparent via-emerald-500 to-transparent opacity-75 animate-shimmer',
            heightClass,
          ]"
        />
        <div
          class="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-transparent pointer-events-none"
        />
        <div
          v-if="specialEffect === 'doctor'"
          class="absolute bottom-0 left-0 right-0 h-px bg-emerald-500/30"
        />
      </template>

      <slot />
    </div>
  </div>
</template>
