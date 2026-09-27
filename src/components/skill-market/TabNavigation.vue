<script setup lang="ts">
import type { Component } from "vue";
import GithubIcon from "@/components/icons/GithubIcon.vue";

export interface TabItem {
  key: string;
  icon: Component;
  count: number | null;
  label: string;
  highlight: boolean;
  pulse?: boolean;
}

export interface TabNavigationProps {
  activeTab: string;
  tabs: TabItem[];
}

defineProps<TabNavigationProps>();

const emit = defineEmits<{
  (e: "change", tabKey: string): void;
  (e: "update:activeTab", tabKey: string): void;
}>();

function handleClick(tabKey: string) {
  emit("change", tabKey);
  emit("update:activeTab", tabKey);
}
</script>

<template>
  <div class="flex items-center bg-slate-900/90 p-1 rounded-xl border border-slate-800/80 shrink-0">
    <button
      v-for="tab in tabs"
      :key="tab.key"
      type="button"
      :class="[
        'flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium transition-all cursor-pointer',
        activeTab === tab.key
          ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30'
          : 'text-slate-400 hover:text-slate-200',
      ]"
      @click="handleClick(tab.key)"
    >
      <component
        :is="tab.icon"
        :class="[
          'w-3.5 h-3.5',
          tab.icon === GithubIcon
            ? 'text-slate-300'
            : tab.highlight
              ? 'text-emerald-300'
              : '',
        ]"
      />
      <span>{{ tab.label }}</span>
      <span
        v-if="tab.count !== null && tab.count > 0"
        :class="[
          'text-[10px] font-mono px-1.5 py-0.5 rounded-full',
          activeTab === tab.key
            ? 'bg-emerald-700/80 text-white'
            : 'bg-slate-800 text-slate-400',
        ]"
      >
        {{ tab.count }}
      </span>
      <span
        v-if="tab.pulse && activeTab === tab.key"
        class="w-2 h-2 rounded-full bg-amber-400 animate-pulse ml-1"
      />
    </button>
  </div>
</template>
