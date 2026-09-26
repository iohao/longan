import type { ListedSkill } from "../types";
import { parseSkillUrl } from "./url";

export interface SkillRepoGroup {
  key: string;
  sourceType: "net" | "local";
  owner: string | null;
  repo: string | null;
  title: string;
  githubUrl: string | null;
  skills: ListedSkill[];
  updatableCount: number;
}

export function matchesSkillSearch(skill: ListedSkill, debouncedQuery: string): boolean {
  if (!debouncedQuery.trim()) return true;

  const parsed = parseSkillUrl(debouncedQuery);
  const q = parsed.cleanQuery.toLowerCase().trim();
  const rawQ = debouncedQuery.toLowerCase().trim();
  const targetId = parsed.targetId?.toLowerCase();

  if (targetId) {
    const fullPath = skill.owner && skill.repo ? `${skill.owner}/${skill.repo}/${skill.name}`.toLowerCase() : "";
    if (
      fullPath === targetId ||
      skill.dir_path.toLowerCase().includes(targetId) ||
      (skill.owner && skill.repo && `${skill.owner}/${skill.repo}`.toLowerCase() === targetId)
    ) {
      return true;
    }
  }

  const subSkillsMatch = Boolean(
    skill.sub_skills?.some(
      (sub) =>
        sub.name.toLowerCase().includes(q) ||
        Boolean(sub.description && sub.description.toLowerCase().includes(q)) ||
        sub.dir_path.toLowerCase().includes(q) ||
        sub.name.toLowerCase().includes(rawQ) ||
        Boolean(sub.description && sub.description.toLowerCase().includes(rawQ)) ||
        sub.dir_path.toLowerCase().includes(rawQ)
    )
  );

  return (
    skill.name.toLowerCase().includes(q) ||
    Boolean(skill.description && skill.description.toLowerCase().includes(q)) ||
    skill.dir_path.toLowerCase().includes(q) ||
    Boolean(skill.owner && skill.owner.toLowerCase().includes(q)) ||
    Boolean(skill.repo && skill.repo.toLowerCase().includes(q)) ||
    skill.name.toLowerCase().includes(rawQ) ||
    Boolean(skill.description && skill.description.toLowerCase().includes(rawQ)) ||
    skill.dir_path.toLowerCase().includes(rawQ) ||
    subSkillsMatch
  );
}

export function groupSkillsByRepo(
  skills: ListedSkill[],
  filter: "all" | "net" | "local" = "all",
  searchQuery: string = "",
): SkillRepoGroup[] {
  const trimmedQuery = searchQuery.trim();
  const parsed = trimmedQuery ? parseSkillUrl(trimmedQuery) : null;
  const q = parsed ? parsed.cleanQuery.toLowerCase().trim() : "";
  const rawQ = trimmedQuery.toLowerCase();
  const targetId = parsed?.targetId?.toLowerCase();

  // 1. Filter skills by category
  const filteredCategorySkills = skills.filter((s) => {
    if (filter === "net" && s.source_type !== "net") return false;
    if (filter === "local" && s.source_type !== "local") return false;
    return true;
  });

  // 2. Group skills by repository / local
  const groupMap = new Map<string, {
    key: string;
    sourceType: "net" | "local";
    owner: string | null;
    repo: string | null;
    title: string;
    githubUrl: string | null;
    allSkills: ListedSkill[];
  }>();

  for (const skill of filteredCategorySkills) {
    let key: string;
    let title: string;
    let githubUrl: string | null = null;
    let owner: string | null = null;
    let repo: string | null = null;

    if (skill.source_type === "net") {
      if (skill.owner && skill.repo) {
        key = `net:${skill.owner}/${skill.repo}`;
        title = `${skill.owner}/${skill.repo}`;
        owner = skill.owner;
        repo = skill.repo;
        githubUrl = `https://github.com/${skill.owner}/${skill.repo}`;
      } else {
        key = `net:${skill.dir_path}`;
        title = skill.dir_path;
      }
    } else {
      key = "local:skills";
      title = "local";
    }

    let existing = groupMap.get(key);
    if (!existing) {
      existing = {
        key,
        sourceType: skill.source_type,
        owner,
        repo,
        title,
        githubUrl,
        allSkills: [],
      };
      groupMap.set(key, existing);
    }
    existing.allSkills.push(skill);
  }

  // 3. For each group, filter skills based on search query
  const result: SkillRepoGroup[] = [];

  for (const group of groupMap.values()) {
    let matchingSkills: ListedSkill[];

    if (!trimmedQuery) {
      matchingSkills = group.allSkills;
    } else {
      // Check if search matches the repo group itself
      const groupMatches =
        Boolean(group.owner && group.repo && `${group.owner}/${group.repo}`.toLowerCase().includes(q)) ||
        Boolean(group.owner && group.repo && `${group.owner}/${group.repo}`.toLowerCase().includes(rawQ)) ||
        Boolean(targetId && group.owner && group.repo && `${group.owner}/${group.repo}`.toLowerCase() === targetId);

      if (groupMatches) {
        matchingSkills = group.allSkills;
      } else {
        matchingSkills = group.allSkills.filter((s) => matchesSkillSearch(s, trimmedQuery));
      }
    }

    if (matchingSkills.length === 0) continue;

    // Sort skills inside group
    matchingSkills.sort((a, b) => {
      const aUp = a.status === "update_available" ? 0 : 1;
      const bUp = b.status === "update_available" ? 0 : 1;
      if (aUp !== bUp) return aUp - bUp;
      return a.name.localeCompare(b.name);
    });

    const updatableCount = matchingSkills.filter(
      (s) => s.status === "update_available" && s.source_type === "net",
    ).length;

    result.push({
      key: group.key,
      sourceType: group.sourceType,
      owner: group.owner,
      repo: group.repo,
      title: group.title,
      githubUrl: group.githubUrl,
      skills: matchingSkills,
      updatableCount,
    });
  }

  // 4. Sort groups: updatable first, then net before local, then alphabetical
  result.sort((a, b) => {
    const aUp = a.updatableCount > 0 ? 0 : 1;
    const bUp = b.updatableCount > 0 ? 0 : 1;
    if (aUp !== bUp) return aUp - bUp;

    const aNet = a.sourceType === "net" ? 0 : 1;
    const bNet = b.sourceType === "net" ? 0 : 1;
    if (aNet !== bNet) return aNet - bNet;

    return a.title.localeCompare(b.title);
  });

  return result;
}
