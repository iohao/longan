import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import Button from "./Button.vue";

describe("Button.vue", () => {
  it("renders with default primary variant and md size", () => {
    const wrapper = mount(Button, {
      slots: {
        default: "Click me",
      },
    });

    expect(wrapper.text()).toBe("Click me");
    expect(wrapper.classes()).toContain("bg-emerald-600");
    expect(wrapper.classes()).toContain("h-9");
  });

  it("renders with loading spinner and disabled when loading is true", () => {
    const wrapper = mount(Button, {
      props: {
        loading: true,
      },
      slots: {
        default: "Submit",
      },
    });

    expect(wrapper.attributes("disabled")).toBeDefined();
    const spinner = wrapper.find(".animate-spin");
    expect(spinner.exists()).toBe(true);
  });

  it("renders different variants properly", () => {
    const danger = mount(Button, { props: { variant: "danger" } });
    expect(danger.classes()).toContain("bg-rose-600/90");

    const outline = mount(Button, { props: { variant: "outline" } });
    expect(outline.classes()).toContain("border-slate-700");

    const ghost = mount(Button, { props: { variant: "ghost" } });
    expect(ghost.classes()).toContain("bg-transparent");
  });
});
