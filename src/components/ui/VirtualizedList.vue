<script lang="ts">
export const VIRTUALIZATION_THRESHOLD = 50;

export interface VirtualizedListProps<ItemType> {
  items: readonly ItemType[];
  getItemKey: (item: ItemType) => string | number;
  ariaLabel?: string;
  "aria-label"?: string;
  resetKey?: unknown;
  estimateSize?: number;
  gap?: number;
  overscan?: number;
  class?: string;
  scrollElement?: HTMLElement | null;
}
</script>

<script setup lang="ts" generic="T">
import { ref, watch, onMounted, onUnmounted, computed, inject, type Ref } from "vue";
import { useVirtualizer } from "@tanstack/vue-virtual";

const props = withDefaults(defineProps<VirtualizedListProps<T>>(), {
  ariaLabel: "",
  "aria-label": "",
  resetKey: undefined,
  estimateSize: 88,
  gap: 12,
  overscan: 6,
  class: "",
  scrollElement: undefined,
});

defineSlots<{
  default?(props: { item: T; index: number }): any;
  item?(props: { item: T; index: number }): any;
}>();

const effectiveAriaLabel = computed(() => props.ariaLabel || props["aria-label"] || "");

const injectedScrollRef = inject<Ref<HTMLElement | null> | null>("appScrollElement", null);

const effectiveScrollElement = computed<HTMLElement | null>(() => {
  if (props.scrollElement !== undefined) {
    return props.scrollElement;
  }
  return injectedScrollRef?.value ?? null;
});

const listRef = ref<HTMLDivElement | null>(null);
const scrollMargin = ref(0);

const shouldVirtualize = computed(() => {
  return props.items.length > VIRTUALIZATION_THRESHOLD && effectiveScrollElement.value !== null;
});

function measureScrollMargin() {
  const listEl = listRef.value;
  const scrollEl = effectiveScrollElement.value;
  if (!listEl || !scrollEl) return;

  const nextMargin =
    listEl.getBoundingClientRect().top -
    scrollEl.getBoundingClientRect().top +
    scrollEl.scrollTop;

  if (scrollMargin.value !== nextMargin) {
    scrollMargin.value = nextMargin;
  }
}

let resizeObserver: ResizeObserver | null = null;

function setupResizeObserver() {
  resizeObserver?.disconnect();
  measureScrollMargin();

  const scrollEl = effectiveScrollElement.value;
  const listEl = listRef.value;
  if (scrollEl && listEl && typeof ResizeObserver !== "undefined") {
    resizeObserver = new ResizeObserver(() => {
      measureScrollMargin();
    });
    resizeObserver.observe(scrollEl);
    resizeObserver.observe(listEl);
  }
}

onMounted(() => {
  setupResizeObserver();
  window.addEventListener("resize", measureScrollMargin);
});

watch(
  () => effectiveScrollElement.value,
  () => {
    setupResizeObserver();
  },
);

onUnmounted(() => {
  resizeObserver?.disconnect();
  window.removeEventListener("resize", measureScrollMargin);
});

const virtualizer = useVirtualizer(
  computed(() => ({
    count: shouldVirtualize.value ? props.items.length : 0,
    getScrollElement: () => effectiveScrollElement.value,
    estimateSize: () => props.estimateSize,
    getItemKey: (index) => props.getItemKey(props.items[index]),
    measureElement: (element) =>
      element ? element.getBoundingClientRect().height : props.estimateSize,
    overscan: props.overscan,
    gap: props.gap,
    scrollMargin: scrollMargin.value,
  })),
);

watch(
  () => props.resetKey,
  () => {
    if (props.items.length === 0) return;
    if (shouldVirtualize.value) {
      virtualizer.value.scrollToIndex(0, { align: "start" });
    } else {
      effectiveScrollElement.value?.scrollTo({ top: scrollMargin.value });
    }
  },
);
</script>

<template>
  <!-- Fallback to plain DOM when item count <= 50 or scroll element not available -->
  <div
    v-if="!shouldVirtualize"
    ref="listRef"
    role="list"
    :aria-label="effectiveAriaLabel"
    :class="props.class"
  >
    <div
      v-for="(item, index) in items"
      :key="getItemKey(item)"
      role="listitem"
      :aria-posinset="index + 1"
      :aria-setsize="items.length"
    >
      <slot name="item" :item="item" :index="index">
        <slot :item="item" :index="index" />
      </slot>
    </div>
  </div>

  <!-- TanStack Virtual list for high item counts -->
  <div
    v-else
    ref="listRef"
    role="list"
    :aria-label="effectiveAriaLabel"
    :class="['relative w-full', props.class]"
    :style="{ height: `${virtualizer.getTotalSize()}px` }"
  >
    <div
      v-for="virtualItem in virtualizer.getVirtualItems()"
      :key="String(virtualItem.key)"
      :ref="(el) => virtualizer.measureElement(el as HTMLElement)"
      :data-index="virtualItem.index"
      role="listitem"
      :aria-posinset="virtualItem.index + 1"
      :aria-setsize="items.length"
      class="absolute left-0 top-0 w-full"
      :style="{
        transform: `translateY(${virtualItem.start - scrollMargin}px)`,
      }"
    >
      <slot
        name="item"
        :item="items[virtualItem.index]"
        :index="virtualItem.index"
      >
        <slot :item="items[virtualItem.index]" :index="virtualItem.index" />
      </slot>
    </div>
  </div>
</template>
