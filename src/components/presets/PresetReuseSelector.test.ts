import { beforeEach, describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import { defineComponent, ref } from "vue";
import i18n from "@/i18n";
import type { Preset, PresetReuseMode } from "@/types";
import PresetReuseSelector from "./PresetReuseSelector.vue";

function createPreset(
  id: number,
  name: string,
  skillIds: number[],
  includedPresetIds: number[] = [],
): Preset {
  return {
    id,
    name,
    description: null,
    created_at: "",
    skill_ids: skillIds,
    direct_skill_ids: skillIds,
    included_preset_ids: includedPresetIds,
    reference_count: 0,
  };
}

const Harness = defineComponent({
  components: { PresetReuseSelector },
  props: {
    presets: {
      type: Array as () => Preset[],
      required: true,
    },
    target: {
      type: Object as () => Preset,
      required: true,
    },
  },
  setup(props) {
    const mode = ref<PresetReuseMode>("copy");
    const selectedIds = ref<number[]>([]);
    return { props, mode, selectedIds };
  },
  template: `
    <PresetReuseSelector
      :presets="props.presets"
      :target-preset="props.target"
      v-model:mode="mode"
      v-model:selected-ids="selectedIds"
    />
  `,
});

describe("PresetReuseSelector", () => {
  beforeEach(async () => {
    (i18n.global.locale as any).value = "en";
  });

  it("previews unique direct skills copied from selected presets", async () => {
    const target = createPreset(3, "target", [1]);
    const frontend = createPreset(1, "frontend", [1, 2]);

    const wrapper = mount(Harness, {
      props: {
        presets: [frontend, target],
        target,
      },
      global: { plugins: [i18n] },
    });

    const checkbox = wrapper.find('input[type="checkbox"]');
    expect(checkbox.exists()).toBe(true);

    await checkbox.setValue(true);

    expect(wrapper.text()).toContain("1 direct skill(s)");
  });

  it("disables a linked source that would create an indirect cycle", async () => {
    const target = createPreset(3, "target", []);
    const source = createPreset(1, "source", [], [3]);

    const wrapper = mount(Harness, {
      props: {
        presets: [source, target],
        target,
      },
      global: { plugins: [i18n] },
    });

    // Switch to link mode
    const linkButton = wrapper.findAll("button")[0];
    await linkButton.trigger("click");

    const checkbox = wrapper.find('input[type="checkbox"]');
    expect(checkbox.attributes("disabled")).toBeDefined();
    expect(wrapper.text()).toContain("Would create a cycle");
  });
});
