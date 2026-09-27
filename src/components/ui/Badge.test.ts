import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import Badge from "./Badge.vue";

describe("Badge.vue", () => {
  it("renders with default neutral variant", () => {
    const wrapper = mount(Badge, {
      slots: {
        default: "Tag",
      },
    });

    expect(wrapper.text()).toBe("Tag");
    expect(wrapper.classes()).toContain("bg-slate-800");
  });

  it("renders with pulse indicator when pulse is true", () => {
    const wrapper = mount(Badge, {
      props: {
        variant: "success",
        pulse: true,
      },
      slots: {
        default: "Active",
      },
    });

    expect(wrapper.find(".animate-ping").exists()).toBe(true);
    expect(wrapper.classes()).toContain("text-emerald-400");
  });
});
