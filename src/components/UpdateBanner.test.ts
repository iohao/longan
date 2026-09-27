import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { i18n } from "@/i18n";
import { useAppUpdateStore } from "@/stores/appUpdate";
import type { PendingAppUpdate } from "@/api/updater";
import UpdateBanner from "./UpdateBanner.vue";

const mockUpdate = {
  version: "1.3.0",
  currentVersion: "1.2.0",
  date: "2026-09-20",
  body: "New features and fixes",
} as unknown as PendingAppUpdate;

describe("UpdateBanner.vue", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("does not render when there is no available update", () => {
    const wrapper = mount(UpdateBanner, {
      global: {
        plugins: [i18n],
      },
    });

    expect(wrapper.find("div").exists()).toBe(false);
  });

  it("renders update information when an update is available", () => {
    const store = useAppUpdateStore();
    store.availableUpdate = mockUpdate;

    const wrapper = mount(UpdateBanner, {
      global: {
        plugins: [i18n],
      },
    });

    expect(wrapper.text()).toContain("1.3.0");
    expect(wrapper.find("button[aria-label]").exists()).toBe(true);
  });

  it("dismisses the banner when the close button is clicked", async () => {
    const store = useAppUpdateStore();
    store.availableUpdate = mockUpdate;

    const wrapper = mount(UpdateBanner, {
      global: {
        plugins: [i18n],
      },
    });

    const closeBtn = wrapper.find("button[aria-label]");
    expect(closeBtn.exists()).toBe(true);
    await closeBtn.trigger("click");

    expect(store.availableUpdate).toBeNull();
  });

  it("calls installUpdate when download button is clicked", async () => {
    const store = useAppUpdateStore();
    store.availableUpdate = mockUpdate;
    const installSpy = vi.spyOn(store, "installUpdate").mockImplementation(async () => {});

    const wrapper = mount(UpdateBanner, {
      global: {
        plugins: [i18n],
      },
    });

    const downloadBtn = wrapper.findAll("button")[0];
    await downloadBtn.trigger("click");

    expect(installSpy).toHaveBeenCalledTimes(1);
  });
});
