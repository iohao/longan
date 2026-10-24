import type { SkillTriggerMode } from "@/types";

const COMMAND_PATTERNS = [
  "manual-only",
  "never trigger implicitly",
  "only when the user explicitly invokes",
  "when user types /",
  "when the user types /",
  "用户主动调用",
  "手动调用",
  "需用户主动",
];

const INTENT_PATTERNS = [
  "must be used for",
  "always apply",
  "passive",
  "静默生效",
  "自动触发",
  "被动触发",
];

export function resolveSkillTriggerMode(
  skill?: { trigger_mode?: string | null; description?: string | null } | null,
): SkillTriggerMode {
  if (!skill) return "hybrid";

  if (
    skill.trigger_mode === "command" ||
    skill.trigger_mode === "intent" ||
    skill.trigger_mode === "hybrid"
  ) {
    return skill.trigger_mode;
  }

  if (skill.description) {
    const desc = skill.description.toLowerCase();
    if (COMMAND_PATTERNS.some((p) => desc.includes(p))) {
      return "command";
    }
    if (INTENT_PATTERNS.some((p) => desc.includes(p))) {
      return "intent";
    }
  }

  return "hybrid";
}

export function getTriggerBadgeVariant(
  mode: SkillTriggerMode,
): "warning" | "info" | "neutral" {
  switch (mode) {
    case "command":
      return "warning";
    case "intent":
      return "info";
    case "hybrid":
    default:
      return "neutral";
  }
}
