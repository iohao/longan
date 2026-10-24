import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import TriggerBadge from "./TriggerBadge.vue";
import { i18n } from "@/i18n";

describe("TriggerBadge", () => {
  it("renders command mode with orange styling and active text", () => {
    const wrapper = mount(TriggerBadge, {
      props: { mode: "command" },
      global: { plugins: [i18n] },
    });
    expect(wrapper.text()).toContain("触发");
    expect(wrapper.text()).toContain("主动");
    expect(wrapper.html()).toContain("bg-orange-500/20");
    expect(wrapper.html()).toContain("text-orange-300");
  });

  it("renders intent mode with light purple styling and passive text", () => {
    const wrapper = mount(TriggerBadge, {
      props: { mode: "intent" },
      global: { plugins: [i18n] },
    });
    expect(wrapper.text()).toContain("触发");
    expect(wrapper.text()).toContain("被动");
    expect(wrapper.html()).toContain("bg-purple-500/20");
    expect(wrapper.html()).toContain("text-purple-300");
  });

  it("renders hybrid mode with transparent styling and hybrid text", () => {
    const wrapper = mount(TriggerBadge, {
      props: { mode: "hybrid" },
      global: { plugins: [i18n] },
    });
    expect(wrapper.text()).toContain("触发");
    expect(wrapper.text()).toContain("混合");
    expect(wrapper.html()).toContain("bg-transparent");
    expect(wrapper.html()).toContain("text-slate-200");
  });

  it("resolves trigger mode from skill prop", () => {
    const wrapper = mount(TriggerBadge, {
      props: {
        skill: {
          description: "Manual-only workflow. Never trigger implicitly.",
        },
      },
      global: { plugins: [i18n] },
    });
    expect(wrapper.text()).toContain("主动");
  });
});
