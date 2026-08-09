import { describe, expect, it } from "vitest";

import type { Preset } from "../types";
import {
  buildInheritedSkillGroups,
  buildPresetSkillSourceGroups,
  parsePresetOrder,
  replacePresetDirectSkills,
  sortPresets,
} from "./presets";

function preset(
  id: number,
  name: string,
  directSkillIds: number[],
  includedPresetIds: number[] = [],
  effectiveSkillIds: number[] = directSkillIds,
): Preset {
  return {
    id,
    name,
    description: null,
    created_at: "",
    skill_ids: effectiveSkillIds,
    direct_skill_ids: directSkillIds,
    included_preset_ids: includedPresetIds,
    reference_count: 0,
  };
}

describe("buildInheritedSkillGroups", () => {
  it("groups inherited skills by their direct owner with deeper sources first", () => {
    const presets = [
      preset(1, "A", [], [2], [21, 22, 31, 32]),
      preset(2, "B", [21, 22], [3], [21, 22, 31, 32]),
      preset(3, "C", [31, 32]),
    ];

    expect(buildInheritedSkillGroups(presets, 1)).toEqual([
      { presetId: 3, presetName: "C", depth: 2, skillIds: [31, 32] },
      { presetId: 2, presetName: "B", depth: 1, skillIds: [21, 22] },
    ]);
  });

  it("keeps a multi-source skill in every owning preset group", () => {
    const presets = [
      preset(1, "A", [], [2, 3], [10, 20, 30]),
      preset(3, "C", [10, 30]),
      preset(2, "B", [10, 20]),
    ];

    expect(buildInheritedSkillGroups(presets, 1)).toEqual([
      { presetId: 3, presetName: "C", depth: 1, skillIds: [10, 30] },
      { presetId: 2, presetName: "B", depth: 1, skillIds: [10, 20] },
    ]);
  });

  it("excludes active direct skills and ignores missing references and cycles", () => {
    const presets = [
      preset(1, "A", [10], [2, 999], [10, 20]),
      preset(2, "B", [10, 20], [1], [10, 20]),
    ];

    expect(buildInheritedSkillGroups(presets, 1)).toEqual([
      { presetId: 2, presetName: "B", depth: 1, skillIds: [20] },
    ]);
  });
});

describe("buildPresetSkillSourceGroups", () => {
  it("includes roots and orders concrete owners from deepest to shallowest", () => {
    const presets = [
      preset(1, "A", [11], [2], [11, 21, 31]),
      preset(2, "B", [21], [3], [21, 31]),
      preset(3, "C", [31]),
    ];

    expect(buildPresetSkillSourceGroups(presets, [1])).toEqual([
      { presetId: 3, presetName: "C", depth: 2, skillIds: [31] },
      { presetId: 2, presetName: "B", depth: 1, skillIds: [21] },
      { presetId: 1, presetName: "A", depth: 0, skillIds: [11] },
    ]);
  });

  it("keeps multi-source skills in each owner group across multiple roots", () => {
    const presets = [
      preset(1, "A", [], [3], [10, 30]),
      preset(2, "B", [10, 20]),
      preset(3, "C", [10, 30]),
    ];

    expect(buildPresetSkillSourceGroups(presets, [1, 2])).toEqual([
      { presetId: 3, presetName: "C", depth: 1, skillIds: [10, 30] },
      { presetId: 2, presetName: "B", depth: 0, skillIds: [10, 20] },
    ]);
  });

  it("ignores missing roots and protects against unexpected cycles", () => {
    const presets = [
      preset(1, "A", [10], [2]),
      preset(2, "B", [20], [1, 999]),
    ];

    expect(buildPresetSkillSourceGroups(presets, [1, 404])).toEqual([
      { presetId: 2, presetName: "B", depth: 1, skillIds: [20] },
      { presetId: 1, presetName: "A", depth: 0, skillIds: [10] },
    ]);
  });
});

describe("replacePresetDirectSkills", () => {
  it("updates effective skills in every dependent preset", () => {
    const presets = [
      preset(1, "common", [1, 2, 3]),
      preset(2, "common-code", [4], [1]),
      preset(3, "app", [5], [2]),
    ];

    const updated = replacePresetDirectSkills(presets, 1, [1, 2]);

    expect(updated.map((item) => item.skill_ids)).toEqual([
      [1, 2],
      [1, 2, 4],
      [1, 2, 4, 5],
    ]);
    expect(presets[1].skill_ids).toEqual([4]);
  });
});

describe("parsePresetOrder", () => {
  it("returns an empty array on invalid or missing JSON", () => {
    expect(parsePresetOrder(null)).toEqual([]);
    expect(parsePresetOrder("")).toEqual([]);
    expect(parsePresetOrder("not json")).toEqual([]);
    expect(parsePresetOrder("{}")).toEqual([]);
  });

  it("filters out non-numbers and filters against preset list when provided", () => {
    const list = [preset(1, "A", []), preset(3, "C", [])];
    expect(parsePresetOrder(JSON.stringify([3, "foo", 2, 1]), list)).toEqual([3, 1]);
    expect(parsePresetOrder(JSON.stringify([3, 2, 1]))).toEqual([3, 2, 1]);
  });
});

describe("sortPresets", () => {
  it("preserves original array when order is empty", () => {
    const list = [preset(1, "A", []), preset(2, "B", []), preset(3, "C", [])];
    expect(sortPresets(list, [])).toEqual(list);
  });

  it("sorts presets based on presetOrder and appends unlisted presets at the end", () => {
    const list = [preset(1, "A", []), preset(2, "B", []), preset(3, "C", [])];
    expect(sortPresets(list, [3, 1])).toEqual([list[2], list[0], list[1]]);
  });
});
