import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import ReferenceCount from "./ReferenceCount.vue";

describe("ReferenceCount.vue", () => {
  it("renders nothing when count is unavailable", () => {
    const wrapper = mount(ReferenceCount, {
      props: {
        count: undefined,
        countLabel: "Reference count unavailable",
        viewLabel: "View references",
      },
    });

    expect(wrapper.find("button").exists()).toBe(false);
    expect(wrapper.find("span").exists()).toBe(false);
  });

  it("renders zero as a static accessible indicator", () => {
    const wrapper = mount(ReferenceCount, {
      props: {
        count: 0,
        countLabel: "Referenced 0 time(s)",
        viewLabel: "View references",
      },
    });

    const indicator = wrapper.find("span[title='Referenced 0 time(s)']");
    expect(indicator.exists()).toBe(true);
    expect(indicator.text()).toContain("0");
    expect(wrapper.find("button").exists()).toBe(false);
  });

  it("renders positive counts as an interactive button without bubbling", async () => {
    const parentClickHandler = vi.fn();
    const wrapper = mount({
      components: { ReferenceCount },
      setup() {
        return { parentClickHandler };
      },
      template: `
        <div @click="parentClickHandler">
          <ReferenceCount
            :count="3"
            count-label="Referenced 3 time(s)"
            view-label="View references for Example"
          />
        </div>
      `,
    });

    const button = wrapper.find("button");
    expect(button.exists()).toBe(true);
    expect(button.attributes("title")).toBe("View references for Example");
    expect(button.classes()).toContain("hover:bg-emerald-500/10");
    expect(button.classes()).toContain("active:scale-95");

    await button.trigger("click");

    expect(parentClickHandler).not.toHaveBeenCalled();
  });
});
