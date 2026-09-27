import { beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";
import { useDebugModeStore } from "@/stores/debugMode";
import PageIdBadge from "./PageIdBadge.vue";

vi.mock("vue-router", () => ({
  useRoute: () => ({ name: "installed", path: "/installed" }),
}));

describe("PageIdBadge", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it("is hidden when debug mode is disabled", () => {
    const debugStore = useDebugModeStore();
    debugStore.debugMode = false;

    const wrapper = mount(PageIdBadge, {
      props: { pageId: "installed-page" },
    });

    expect(wrapper.find("div").exists()).toBe(false);
  });

  it("renders the page id when debug mode is enabled", () => {
    const debugStore = useDebugModeStore();
    debugStore.debugMode = true;

    const wrapper = mount(PageIdBadge, {
      props: { pageId: "installed-page" },
    });

    expect(wrapper.text()).toContain("installed-page");
  });

  it("copies the id to the clipboard on click and shows Copied", async () => {
    const debugStore = useDebugModeStore();
    debugStore.debugMode = true;

    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    const wrapper = mount(PageIdBadge, {
      props: { pageId: "installed-page" },
    });

    const copyBtn = wrapper.find("button");
    expect(copyBtn.exists()).toBe(true);

    await copyBtn.trigger("click");

    expect(writeText).toHaveBeenCalledWith("installed-page");
    expect(wrapper.text()).toContain("Copied");
  });
});
