import { describe, it, expect } from "vitest";
import { parseSkillUrl, parseGitHubInput } from "./url";

describe("parseSkillUrl", () => {
  it("returns non-url for empty input", () => {
    expect(parseSkillUrl("")).toEqual({ isUrl: false, cleanQuery: "" });
  });

  it("passes plain text queries through", () => {
    const p = parseSkillUrl("brainstorming");
    expect(p.isUrl).toBe(false);
    expect(p.cleanQuery).toBe("brainstorming");
  });

  it("parses a full github url with tree/branch/path", () => {
    const p = parseSkillUrl("https://github.com/obra/superpowers/tree/main/skills/tdd");
    expect(p.isGitHubUrl).toBe(true);
    expect(p.owner).toBe("obra");
    expect(p.repo).toBe("superpowers");
    expect(p.skillId).toBe("skills");
    expect(p.targetId).toBe("obra/superpowers/skills");
  });

  it("parses owner/repo/skill github url", () => {
    const p = parseSkillUrl("https://github.com/o/r/my-skill");
    expect(p.isGitHubUrl).toBe(true);
    expect(p.targetId).toBe("o/r/my-skill");
  });

  it("keeps a two-segment github url as a repository query", () => {
    const p = parseSkillUrl("github.com/o/r");
    expect(p.isGitHubUrl).toBe(true);
    expect(p.skillId).toBeUndefined();
    expect(p.cleanQuery).toBe("o/r");
    expect(p.targetId).toBe("o/r");
  });

  it("strips a trailing SKILL.md path segment", () => {
    const p = parseSkillUrl("https://github.com/o/r/my-skill/SKILL.md");
    expect(p.targetId).toBe("o/r/my-skill");
  });

  it("parses skills.sh urls", () => {
    const p = parseSkillUrl("https://skills.sh/o/r/my-skill");
    expect(p.isUrl).toBe(true);
    expect(p.isGitHubUrl).toBe(false);
    expect(p.targetId).toBe("o/r/my-skill");
  });

  it("keeps bare owner/repo shorthand as a repository query", () => {
    const p = parseSkillUrl("o/r");
    expect(p.isUrl).toBe(true);
    expect(p.skillId).toBeUndefined();
    expect(p.cleanQuery).toBe("o/r");
    expect(p.targetId).toBe("o/r");
  });

  it("keeps a two-segment skills.sh url as a repository query", () => {
    const p = parseSkillUrl("https://skills.sh/o/r");
    expect(p.isUrl).toBe(true);
    expect(p.isGitHubUrl).toBe(false);
    expect(p.skillId).toBeUndefined();
    expect(p.cleanQuery).toBe("o/r");
    expect(p.targetId).toBe("o/r");
  });

  it("parses npx skills add CLI paste with --skill flag", () => {
    const p = parseSkillUrl("npx skills add https://github.com/o/r --skill my-skill");
    expect(p.isGitHubUrl).toBe(true);
    expect(p.skillId).toBe("my-skill");
    expect(p.targetId).toBe("o/r/my-skill");
  });
});

describe("parseGitHubInput", () => {
  it("returns structured result for valid input", () => {
    const p = parseGitHubInput("o/r/s");
    expect(p).toEqual({
      isValid: true,
      owner: "o",
      repo: "r",
      skillId: "s",
      source: "o/r",
      fullId: "o/r/s",
    });
  });

  it("returns null for plain text", () => {
    expect(parseGitHubInput("just words")).toBeNull();
  });

  it("keeps the repo-name fallback for two-segment direct installs", () => {
    expect(parseGitHubInput("o/r")).toEqual({
      isValid: true,
      owner: "o",
      repo: "r",
      skillId: "r",
      source: "o/r",
      fullId: "o/r/r",
    });
  });
});
