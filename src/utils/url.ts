export interface ParsedSkillQuery {
  isUrl: boolean;
  isGitHubUrl?: boolean;
  cleanQuery: string;
  targetId?: string;
  owner?: string;
  repo?: string;
  skillId?: string;
}

export interface ParsedGitHubInput {
  isValid: boolean;
  owner: string;
  repo: string;
  skillId: string;
  source: string; // e.g. "owner/repo"
  fullId: string; // e.g. "owner/repo/skillId"
}

/**
 * Parses a search input that might be a name, skill ID, full URL (skills.sh or GitHub),
 * or CLI command format like `npx skills add https://github.com/owner/repo --skill skill-id`.
 */
export function parseSkillUrl(input: string): ParsedSkillQuery {
  let trimmed = input.trim();
  if (!trimmed) {
    return { isUrl: false, cleanQuery: "" };
  }

  // Handle CLI command copy-paste e.g. `npx skills add <url_or_repo> [--skill <skillId>]`
  let explicitSkillId: string | undefined = undefined;
  const cliMatch = trimmed.match(/(?:npx\s+)?skills\s+add\s+(.*)/i);
  if (cliMatch) {
    let rest = cliMatch[1].trim();
    const skillFlagMatch = rest.match(/--skill\s+([^\s]+)/i);
    if (skillFlagMatch) {
      explicitSkillId = skillFlagMatch[1];
      rest = rest.replace(/--skill\s+[^\s]+/i, "").trim();
    }
    trimmed = rest;
  }

  const isUrlLike =
    /^https?:\/\//i.test(trimmed) ||
    /^(www\.|skills\.sh|github\.com)/i.test(trimmed) ||
    trimmed.includes("skills.sh/") ||
    trimmed.includes("github.com/");

  let urlStr = trimmed;
  if (isUrlLike && !/^https?:\/\//i.test(urlStr)) {
    urlStr = `https://${urlStr}`;
  }

  if (isUrlLike) {
    try {
      const url = new URL(urlStr);
      const hostname = url.hostname.toLowerCase();
      const rawPath = url.pathname;
      const segments = rawPath.split("/").filter(Boolean);

      // Remove trailing SKILL.md or readme.md if present in path
      if (
        segments.length > 0 &&
        (segments[segments.length - 1].toLowerCase() === "skill.md" ||
          segments[segments.length - 1].toLowerCase() === "readme.md")
      ) {
        segments.pop();
      }

      if (hostname.includes("github.com")) {
        const treeIdx = segments.findIndex((s) => s === "tree" || s === "blob");
        if (treeIdx !== -1) {
          const owner = segments[0];
          const repo = segments[1];
          const pathSegments = segments.slice(treeIdx + 2); // path after branch name
          const skillId = explicitSkillId || pathSegments[0] || repo;
          const targetId = `${owner}/${repo}/${skillId}`;
          return {
            isUrl: true,
            isGitHubUrl: true,
            cleanQuery: targetId,
            targetId,
            owner,
            repo,
            skillId,
          };
        } else if (segments.length >= 3) {
          const owner = segments[0];
          const repo = segments[1];
          const skillId = explicitSkillId || segments[2];
          const targetId = `${owner}/${repo}/${skillId}`;
          return {
            isUrl: true,
            isGitHubUrl: true,
            cleanQuery: targetId,
            targetId,
            owner,
            repo,
            skillId,
          };
        } else if (segments.length === 2) {
          const owner = segments[0];
          const repo = segments[1];
          const skillId = explicitSkillId;
          const targetId = skillId ? `${owner}/${repo}/${skillId}` : `${owner}/${repo}`;
          return {
            isUrl: true,
            isGitHubUrl: true,
            cleanQuery: targetId,
            targetId,
            owner,
            repo,
            skillId,
          };
        }
      } else {
        // e.g. skills.sh or www.skills.sh or other domain URLs
        const isGit = hostname.includes("github.com");
        if (segments.length >= 3) {
          const owner = segments[0];
          const repo = segments[1];
          const skillId = explicitSkillId || segments[2];
          const targetId = `${owner}/${repo}/${skillId}`;
          return {
            isUrl: true,
            isGitHubUrl: isGit,
            cleanQuery: targetId,
            targetId,
            owner,
            repo,
            skillId,
          };
        } else if (segments.length === 2) {
          const owner = segments[0];
          const repo = segments[1];
          const skillId = explicitSkillId;
          const targetId = skillId ? `${owner}/${repo}/${skillId}` : `${owner}/${repo}`;
          return {
            isUrl: true,
            isGitHubUrl: isGit,
            cleanQuery: targetId,
            targetId,
            owner,
            repo,
            skillId,
          };
        } else if (segments.length === 1) {
          const skillId = explicitSkillId || segments[0];
          return {
            isUrl: true,
            isGitHubUrl: isGit,
            cleanQuery: skillId,
            skillId,
          };
        }
      }
    } catch {
      // Fall through to non-URL treatment
    }
  }

  // Handle shorthand owner/repo with CLI explicitSkillId or bare shorthand
  const parts = trimmed.split("/").filter(Boolean);
  if (parts.length >= 2) {
    const owner = parts[0];
    const repo = parts[1];
    const skillId = explicitSkillId || parts[2];
    if (
      /^[a-zA-Z0-9_.-]+$/.test(owner) &&
      /^[a-zA-Z0-9_.-]+$/.test(repo) &&
      (!skillId || /^[a-zA-Z0-9_.-]+$/.test(skillId))
    ) {
      const targetId = skillId ? `${owner}/${repo}/${skillId}` : `${owner}/${repo}`;
      return {
        isUrl: true,
        cleanQuery: targetId,
        targetId,
        owner,
        repo,
        skillId,
      };
    }
  }

  return {
    isUrl: false,
    cleanQuery: explicitSkillId ? `${trimmed}/${explicitSkillId}` : trimmed,
    skillId: explicitSkillId,
  };
}

/**
 * Attempts to parse a GitHub URL, shorthand, or CLI command (e.g. `npx skills add https://github.com/owner/repo --skill skillId`).
 */
export function parseGitHubInput(input: string): ParsedGitHubInput | null {
  const parsed = parseSkillUrl(input);

  if (parsed.owner && parsed.repo) {
    const skillId = parsed.skillId || parsed.repo;
    return {
      isValid: true,
      owner: parsed.owner,
      repo: parsed.repo,
      skillId,
      source: `${parsed.owner}/${parsed.repo}`,
      fullId: `${parsed.owner}/${parsed.repo}/${skillId}`,
    };
  }

  return null;
}
