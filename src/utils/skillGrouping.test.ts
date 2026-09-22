import { describe, expect, it } from "vitest";
import type { ListedSkill } from "../types";
import { groupSkillsByRepo, matchesSkillSearch } from "./skillGrouping";

const sampleSkills: ListedSkill[] = [
  {
    id: 1,
    name: "golang-testing",
    source_type: "net",
    owner: "samber",
    repo: "cc-skills-golang",
    dir_path: "net/samber/cc-skills-golang/golang-testing",
    description: "Testing best practices in Go",
    latest_sha: "sha1",
    status: "update_available",
    updated_at: "2026-09-01",
    reference_count: 0,
  },
  {
    id: 2,
    name: "golang-security",
    source_type: "net",
    owner: "samber",
    repo: "cc-skills-golang",
    dir_path: "net/samber/cc-skills-golang/golang-security",
    description: "Security checks for Go",
    latest_sha: "sha2",
    status: "ok",
    updated_at: "2026-09-02",
    reference_count: 2,
  },
  {
    id: 3,
    name: "react-query",
    source_type: "net",
    owner: "tanstack",
    repo: "query-skills",
    dir_path: "net/tanstack/query-skills/react-query",
    description: "Data fetching for React",
    latest_sha: "sha3",
    status: "ok",
    updated_at: "2026-09-03",
    reference_count: 1,
  },
  {
    id: 4,
    name: "custom-script",
    source_type: "local",
    owner: null,
    repo: null,
    dir_path: "local/custom-script",
    description: "Local utility skill",
    latest_sha: null,
    status: "ok",
    updated_at: "2026-09-04",
    reference_count: 0,
  },
];

describe("skillGrouping", () => {
  it("groups skills by repository (owner/repo) and bundles local skills", () => {
    const groups = groupSkillsByRepo(sampleSkills, "all", "");

    expect(groups).toHaveLength(3);

    // samber/cc-skills-golang should come first because it has an update available
    const samberGroup = groups[0];
    expect(samberGroup.key).toBe("net:samber/cc-skills-golang");
    expect(samberGroup.title).toBe("samber/cc-skills-golang");
    expect(samberGroup.owner).toBe("samber");
    expect(samberGroup.repo).toBe("cc-skills-golang");
    expect(samberGroup.githubUrl).toBe("https://github.com/samber/cc-skills-golang");
    expect(samberGroup.skills).toHaveLength(2);
    expect(samberGroup.skills.map((s) => s.name)).toEqual(["golang-testing", "golang-security"]);
    expect(samberGroup.updatableCount).toBe(1);

    // tanstack/query-skills
    const tanstackGroup = groups[1];
    expect(tanstackGroup.key).toBe("net:tanstack/query-skills");
    expect(tanstackGroup.title).toBe("tanstack/query-skills");
    expect(tanstackGroup.skills).toHaveLength(1);
    expect(tanstackGroup.updatableCount).toBe(0);

    // local skills group
    const localGroup = groups[2];
    expect(localGroup.key).toBe("local:skills");
    expect(localGroup.sourceType).toBe("local");
    expect(localGroup.skills).toHaveLength(1);
    expect(localGroup.skills[0].name).toBe("custom-script");
  });

  it("filters by source_type (net vs local)", () => {
    const netGroups = groupSkillsByRepo(sampleSkills, "net", "");
    expect(netGroups.every((g) => g.sourceType === "net")).toBe(true);
    expect(netGroups).toHaveLength(2);

    const localGroups = groupSkillsByRepo(sampleSkills, "local", "");
    expect(localGroups).toHaveLength(1);
    expect(localGroups[0].sourceType).toBe("local");
  });

  it("filters by search query matching skill name or description", () => {
    const groups = groupSkillsByRepo(sampleSkills, "all", "security");
    expect(groups).toHaveLength(1);
    expect(groups[0].title).toBe("samber/cc-skills-golang");
    expect(groups[0].skills).toHaveLength(1);
    expect(groups[0].skills[0].name).toBe("golang-security");
  });

  it("matches all skills when repo name is searched", () => {
    const groups = groupSkillsByRepo(sampleSkills, "all", "samber");
    expect(groups).toHaveLength(1);
    expect(groups[0].title).toBe("samber/cc-skills-golang");
    expect(groups[0].skills).toHaveLength(2);
  });

  it("matches search with URL targetId format", () => {
    const matches = matchesSkillSearch(sampleSkills[0], "samber/cc-skills-golang/golang-testing");
    expect(matches).toBe(true);
  });
});
