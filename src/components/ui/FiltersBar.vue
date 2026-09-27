<script setup lang="ts">
import { Search, X } from "lucide-vue-next";
import Input from "./Input.vue";
import { cn } from "./cn";

export interface FilterChip {
  key: string;
  label: string;
  count?: number;
}

export interface FiltersBarProps {
  searchPlaceholder?: string;
  searchTerm?: string;
  filters?: FilterChip[];
  activeFilter?: string;
  showClearButton?: boolean;
  class?: string;
}

const props = withDefaults(defineProps<FiltersBarProps>(), {
  searchPlaceholder: "搜索...",
  searchTerm: "",
  filters: () => [],
  activeFilter: "",
  showClearButton: true,
  class: "",
});

const emit = defineEmits<{
  (e: "update:searchTerm", value: string): void;
  (e: "searchChange", value: string): void;
  (e: "update:activeFilter", key: string): void;
  (e: "filterChange", key: string): void;
}>();

function handleSearchInput(value: string) {
  emit("update:searchTerm", value);
  emit("searchChange", value);
}

function handleClear() {
  handleSearchInput("");
}

function handleFilterClick(key: string) {
  if (key !== props.activeFilter) {
    emit("update:activeFilter", key);
    emit("filterChange", key);
  }
}
</script>

<template>
  <div :class="cn('space-y-3', props.class)">
    <!-- Search Bar -->
    <div class="flex-1 min-w-0">
      <Input
        :model-value="searchTerm"
        :placeholder="searchPlaceholder"
        class="w-full"
        @update:model-value="handleSearchInput"
      >
        <template #icon>
          <Search class="w-4 h-4 text-slate-400" />
        </template>
        <template v-if="searchTerm && showClearButton" #rightElement>
          <button
            type="button"
            aria-label="清除搜索"
            class="p-0.5 rounded hover:bg-slate-700/50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60 cursor-pointer"
            @click="handleClear"
          >
            <X class="w-4 h-4 text-slate-500 hover:text-slate-300" />
          </button>
        </template>
      </Input>
    </div>

    <!-- Filter Chips -->
    <div v-if="filters && filters.length > 0" class="flex flex-wrap gap-2">
      <button
        v-for="filter in filters"
        :key="filter.key"
        type="button"
        :class="[
          'text-xs font-medium px-3 py-1.5 rounded-lg transition-all cursor-pointer select-none',
          activeFilter === filter.key
            ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20'
            : 'bg-slate-800/80 text-slate-400 hover:text-slate-200 hover:bg-slate-700/80',
        ]"
        @click="handleFilterClick(filter.key)"
      >
        <span>{{ filter.label }}</span>
        <span
          v-if="filter.count !== undefined && filter.count > 0"
          class="ml-1.5 text-[10px] opacity-90 font-mono"
        >
          {{ filter.count }}
        </span>
      </button>
    </div>
  </div>
</template>
