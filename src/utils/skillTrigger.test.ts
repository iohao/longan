import { describe, it, expect } from "vitest";
import { resolveSkillTriggerMode, getTriggerBadgeVariant } from "./skillTrigger";

describe("skillTrigger", () => {
  it("uses explicit trigger_mode when available", () => {
    expect(resolveSkillTriggerMode({ trigger_mode: "command" })).toBe("command");
    expect(resolveSkillTriggerMode({ trigger_mode: "intent" })).toBe("intent");
    expect(resolveSkillTriggerMode({ trigger_mode: "hybrid" })).toBe("hybrid");
  });

  it("identifies command trigger from description keywords", () => {
    expect(
      resolveSkillTriggerMode({
        description: "Manual-only workflow. Never trigger implicitly.",
      }),
    ).toBe("command");
    expect(
      resolveSkillTriggerMode({
        description: "Use this skill when user types /commit.",
      }),
    ).toBe("command");
    expect(
      resolveSkillTriggerMode({
        description: "该技能需用户主动调用进行发布",
      }),
    ).toBe("command");
  });

  it("identifies intent trigger from description keywords", () => {
    expect(
      resolveSkillTriggerMode({
        description: "MUST be used for Vue.js tasks and best practices.",
      }),
    ).toBe("intent");
    expect(
      resolveSkillTriggerMode({
        description: "代码规范，静默生效",
      }),
    ).toBe("intent");
  });

  it("defaults to hybrid for general descriptions or missing info", () => {
    expect(resolveSkillTriggerMode(null)).toBe("hybrid");
    expect(resolveSkillTriggerMode({})).toBe("hybrid");
    expect(
      resolveSkillTriggerMode({
        description: "Helpful utility for managing git branches.",
      }),
    ).toBe("hybrid");
  });

  it("maps variants correctly", () => {
    expect(getTriggerBadgeVariant("command")).toBe("warning");
    expect(getTriggerBadgeVariant("intent")).toBe("info");
    expect(getTriggerBadgeVariant("hybrid")).toBe("neutral");
  });
});
