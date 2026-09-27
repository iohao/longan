<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, type Component } from "vue";
import SettingsSection from "./SettingsSection.vue";
import { cn } from "./cn";

export interface AnchoredSection {
  id: string;
  label: string;
  icon: Component;
  dot?: boolean;
  specialEffect?: "default" | "strong" | "doctor";
}

export interface AnchoredSectionTabsProps {
  sections: AnchoredSection[];
  defaultActiveId?: string;
  class?: string;
}

const props = withDefaults(defineProps<AnchoredSectionTabsProps>(), {
  defaultActiveId: "",
  class: "",
});

const activeId = ref<string>(
  props.defaultActiveId || (props.sections.length > 0 ? props.sections[0].id : ""),
);
const isClickScrolling = ref(false);

const domId = (id: string) => `section-${id}`;

let observer: IntersectionObserver | null = null;

function setupObserver() {
  observer?.disconnect();

  if (typeof IntersectionObserver === "undefined") return;

  observer = new IntersectionObserver(
    (entries) => {
      if (isClickScrolling.value) return;
      for (const entry of entries) {
        if (entry.isIntersecting) {
          activeId.value = entry.target.id.replace("section-", "");
        }
      }
    },
    {
      rootMargin: "-15% 0px -65% 0px",
      threshold: 0,
    },
  );

  for (const section of props.sections) {
    const el = document.getElementById(domId(section.id));
    if (el) observer.observe(el);
  }
}

onMounted(() => {
  setupObserver();
});

watch(
  () => props.sections.map((s) => s.id).join("|"),
  () => {
    setupObserver();
  },
);

onUnmounted(() => {
  observer?.disconnect();
});

function scrollToSection(id: string) {
  activeId.value = id;
  isClickScrolling.value = true;

  const el = document.getElementById(domId(id));
  el?.scrollIntoView({ behavior: "smooth", block: "start" });

  setTimeout(() => {
    isClickScrolling.value = false;
  }, 600);
}
</script>

<template>
  <div :class="cn('flex flex-col md:flex-row gap-6 items-start', props.class)">
    <!-- Sticky Vertical Sidebar Navigation -->
    <nav
      class="w-full md:w-56 shrink-0 flex md:flex-col gap-1 overflow-x-auto pb-2 md:pb-0 scrollbar-none border-b md:border-b-0 border-slate-800/80 md:sticky md:top-6 self-start z-10 bg-slate-950/80 md:bg-transparent backdrop-blur-md md:backdrop-blur-none"
    >
      <button
        v-for="section in sections"
        :key="section.id"
        type="button"
        :class="[
          'flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl text-xs font-medium transition-all text-left shrink-0 cursor-pointer select-none',
          activeId === section.id
            ? 'bg-emerald-600/15 text-emerald-400 border border-emerald-500/30 shadow-sm shadow-emerald-500/10 font-semibold'
            : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60 border border-transparent',
        ]"
        @click="scrollToSection(section.id)"
      >
        <div class="flex items-center gap-2.5 min-w-0">
          <component
            :is="section.icon"
            :class="[
              'w-4 h-4 shrink-0',
              activeId === section.id ? 'text-emerald-400' : 'text-slate-400',
            ]"
          />
          <span class="truncate">{{ section.label }}</span>
        </div>
        <span
          v-if="section.dot"
          class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0"
        />
      </button>
    </nav>

    <!-- Continuous Scroll Main Panel Area -->
    <main class="flex-1 min-w-0 space-y-6 w-full">
      <SettingsSection
        v-for="section in sections"
        :key="section.id"
        :id="domId(section.id)"
        :is-active="activeId === section.id"
        :special-effect="section.specialEffect"
      >
        <slot :name="section.id" />
      </SettingsSection>
    </main>
  </div>
</template>
