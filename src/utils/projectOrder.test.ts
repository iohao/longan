import { describe, expect, it } from "vitest";

import type { Project, ProjectGroup } from "../types";
import {
  buildProjectGroupSections,
  orderProjectGroups,
  parseProjectHiddenPreview,
} from "./projectOrder";

function project(id: number, groupId: number, hidden = false): Project {
  return {
    id,
    name: `Project ${id}`,
    path: `/projects/${id}`,
    created_at: "",
    path_exists: true,
    group_id: groupId,
    hidden,
    preset_ids: [],
    skill_ids: [],
    agent_ids: [],
  };
}

function group(
  id: number,
  sortOrder: number,
  hidden = false,
  isSystem = false,
): ProjectGroup {
  return {
    id,
    name: isSystem ? null : `Group ${id}`,
    is_system: isSystem,
    hidden,
    sort_order: sortOrder,
  };
}

describe("project group display order", () => {
  it("orders visible groups before hidden groups and keeps hidden system group first", () => {
    const groups = [
      group(3, 3, true),
      group(2, 2),
      group(0, 0, true, true),
      group(1, 1),
    ];

    expect(orderProjectGroups(groups).map(({ id }) => id)).toEqual([1, 2, 0, 3]);
  });

  it("partitions hidden projects at the end of their own group", () => {
    const sections = buildProjectGroupSections(
      [group(0, 0, false, true), group(1, 1)],
      [project(1, 0), project(2, 1, true), project(3, 1), project(4, 0, true)],
    );

    expect(
      sections.map(({ group: item, visibleProjects, hiddenProjects }) => ({
        groupId: item.id,
        visible: visibleProjects.map(({ id }) => id),
        hidden: hiddenProjects.map(({ id }) => id),
      })),
    ).toEqual([
      { groupId: 0, visible: [1], hidden: [4] },
      { groupId: 1, visible: [3], hidden: [2] },
    ]);
  });
});

describe("hidden project preview", () => {
  it("only enables preview for the persisted true value", () => {
    expect([
      parseProjectHiddenPreview("true"),
      parseProjectHiddenPreview("false"),
      parseProjectHiddenPreview(null),
    ]).toEqual([true, false, false]);
  });
});
