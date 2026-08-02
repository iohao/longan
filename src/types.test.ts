import { describe, it, expect } from "vitest";
import { getProjectSkillCount } from "./types";
import type { Project, Preset } from "./types";

function project(overrides: Partial<Project> = {}): Project {
  return {
    id: 1,
    name: "p",
    path: "/p",
    created_at: "",
    path_exists: true,
    group_id: 0,
    hidden: false,
    preset_ids: [],
    skill_ids: [],
    agent_ids: [],
    ...overrides,
  };
}

function preset(id: number, skillIds: number[]): Preset {
  return {
    id,
    name: `preset-${id}`,
    description: null,
    created_at: "",
    skill_ids: skillIds,
    direct_skill_ids: skillIds,
    included_preset_ids: [],
    reference_count: 0,
  };
}

describe("getProjectSkillCount", () => {
  it("counts direct skills only", () => {
    expect(getProjectSkillCount(project({ skill_ids: [1, 2, 3] }))).toBe(3);
  });

  it("counts skills from linked presets", () => {
    const p = project({ preset_ids: [10] });
    expect(getProjectSkillCount(p, [preset(10, [1, 2])])).toBe(2);
  });

  it("dedupes direct and preset skills", () => {
    const p = project({ skill_ids: [1, 2], preset_ids: [10] });
    expect(getProjectSkillCount(p, [preset(10, [2, 3])])).toBe(3);
  });

  it("ignores unknown preset ids", () => {
    const p = project({ skill_ids: [1], preset_ids: [99] });
    expect(getProjectSkillCount(p, [preset(10, [2])])).toBe(1);
  });
});
