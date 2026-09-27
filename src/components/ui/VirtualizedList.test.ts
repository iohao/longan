import { beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { ref } from "vue";
import VirtualizedList, { VIRTUALIZATION_THRESHOLD } from "./VirtualizedList.vue";

const mocks = vi.hoisted(() => ({
  useVirtualizer: vi.fn(),
  scrollToIndex: vi.fn(),
  measureElement: vi.fn(),
}));

vi.mock("@tanstack/vue-virtual", () => ({
  useVirtualizer: mocks.useVirtualizer,
}));

interface Item {
  id: number;
  name: string;
}

function createItems(count: number): Item[] {
  return Array.from({ length: count }, (_, index) => ({
    id: index + 1,
    name: `Skill ${index + 1}`,
  }));
}

beforeEach(() => {
  mocks.scrollToIndex.mockReset();
  mocks.measureElement.mockReset();
  mocks.useVirtualizer.mockImplementation((optionsComputed: any) => {
    return ref({
      getTotalSize: () => {
        const opts = optionsComputed.value;
        return opts.count * 100;
      },
      getVirtualItems: () => {
        const opts = optionsComputed.value;
        return Array.from({ length: Math.min(opts.count, 12) }, (_, index) => ({
          index,
          key: opts.getItemKey(index),
          start: index * 100,
        }));
      },
      measureElement: mocks.measureElement,
      scrollToIndex: mocks.scrollToIndex,
    });
  });
});

describe("VirtualizedList", () => {
  it("renders every item at the virtualization threshold", () => {
    const items = createItems(VIRTUALIZATION_THRESHOLD);
    const wrapper = mount(VirtualizedList, {
      props: {
        items,
        getItemKey: (item: any) => item.id,
        ariaLabel: "Skills",
      },
      slots: {
        default: `<template #default="{ item }"><span>{{ item.name }}</span></template>`,
      },
    });

    const listItems = wrapper.findAll('[role="listitem"]');
    expect(listItems).toHaveLength(VIRTUALIZATION_THRESHOLD);
    expect(wrapper.text()).toContain("Skill 1");
    expect(wrapper.text()).toContain(`Skill ${VIRTUALIZATION_THRESHOLD}`);
  });

  it("keeps a 500 item list bounded to the virtual window", async () => {
    const items = createItems(500);
    const scrollEl = document.createElement("div");
    const wrapper = mount(VirtualizedList, {
      props: {
        items,
        getItemKey: (item: any) => item.id,
        scrollElement: scrollEl,
        resetKey: "all",
      },
      slots: {
        default: `<template #default="{ item }"><span>{{ item.name }}</span></template>`,
      },
    });

    const listItems = wrapper.findAll('[role="listitem"]');
    expect(listItems).toHaveLength(12);
    expect(listItems[0].attributes("aria-setsize")).toBe("500");
  });

  it("scrolls to the first item when the reset key changes", async () => {
    const items = createItems(500);
    const scrollEl = document.createElement("div");
    const wrapper = mount(VirtualizedList, {
      props: {
        items,
        getItemKey: (item: any) => item.id,
        scrollElement: scrollEl,
        resetKey: "all",
      },
      slots: {
        default: `<template #default="{ item }"><span>{{ item.name }}</span></template>`,
      },
    });

    await wrapper.setProps({ resetKey: "net" });

    expect(mocks.scrollToIndex).toHaveBeenCalledWith(0, { align: "start" });
  });
});
