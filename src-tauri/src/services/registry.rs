use std::collections::HashSet;

use crate::error::AppResult;
use crate::models::RegistrySkill;
use crate::services::github;

/// Clean a raw search query, extracting a canonical `owner/repo/skill_id` identifier
/// if the query is a URL from skills.sh, GitHub, or a CLI command like `npx skills add <url> --skill <id>`.
pub fn clean_query(query: &str) -> String {
    let mut trimmed = query.trim();
    if trimmed.is_empty() {
        return String::new();
    }

    let mut explicit_skill_id = None;
    if let Some(pos) = trimmed.find("skills add ") {
        let rest = trimmed[pos + "skills add ".len()..].trim();
        if let Some(flag_pos) = rest.find("--skill ") {
            let (before, after) = rest.split_at(flag_pos);
            let skill_flag = after["--skill ".len()..].trim();
            let skill_id = skill_flag.split_whitespace().next().unwrap_or(skill_flag);
            explicit_skill_id = Some(skill_id);
            trimmed = before.trim();
        } else {
            trimmed = rest;
        }
    }

    let is_url_like = trimmed.starts_with("http://")
        || trimmed.starts_with("https://")
        || trimmed.starts_with("www.")
        || trimmed.starts_with("skills.sh/")
        || trimmed.starts_with("github.com/")
        || trimmed.contains("skills.sh/")
        || trimmed.contains("github.com/")
        || trimmed.contains('/');

    if !is_url_like && explicit_skill_id.is_none() {
        return trimmed.to_string();
    }

    let mut s = trimmed;
    if let Some(rest) = s.strip_prefix("https://") {
        s = rest;
    } else if let Some(rest) = s.strip_prefix("http://") {
        s = rest;
    }

    if let Some(rest) = s.strip_prefix("www.skills.sh/") {
        s = rest;
    } else if let Some(rest) = s.strip_prefix("skills.sh/") {
        s = rest;
    } else if let Some(rest) = s.strip_prefix("www.github.com/") {
        s = rest;
    } else if let Some(rest) = s.strip_prefix("github.com/") {
        s = rest;
    } else if let Some(pos) = s.find("skills.sh/") {
        s = &s[pos + "skills.sh/".len()..];
    } else if let Some(pos) = s.find("github.com/") {
        s = &s[pos + "github.com/".len()..];
    }

    let s = s.split('?').next().unwrap_or(s);
    let s = s.split('#').next().unwrap_or(s);

    let parts: Vec<&str> = s
        .split('/')
        .map(|p| p.trim())
        .filter(|p| !p.is_empty())
        .collect();

    if parts.is_empty() {
        return explicit_skill_id.unwrap_or(trimmed).to_string();
    }

    let parts: Vec<&str> = if parts
        .last()
        .map(|p| p.eq_ignore_ascii_case("skill.md") || p.eq_ignore_ascii_case("readme.md"))
        .unwrap_or(false)
    {
        parts[..parts.len() - 1].to_vec()
    } else {
        parts
    };

    let (owner, repo, default_skill) = if let Some(pos) = parts.iter().position(|&p| p == "tree" || p == "blob") {
        if parts.len() > pos + 2 {
            (parts[0], parts[1], Some(parts[pos + 2]))
        } else if parts.len() >= 2 {
            (parts[0], parts[1], None)
        } else {
            return trimmed.to_string();
        }
    } else if parts.len() >= 3 {
        (parts[0], parts[1], Some(parts[2]))
    } else if parts.len() == 2 {
        (parts[0], parts[1], None)
    } else {
        return explicit_skill_id
            .map(|id| format!("{}/{}", parts[0], id))
            .unwrap_or_else(|| parts[0].to_string());
    };

    let final_skill_id = explicit_skill_id.or(default_skill);
    if let Some(sk) = final_skill_id {
        format!("{owner}/{repo}/{sk}")
    } else {
        format!("{owner}/{repo}")
    }
}

/// Search skills.sh and annotate each hit with supported/installed flags.
/// `installed_dirs` is the set of known `dir_path`s, computed by the caller
/// before awaiting so no DB handle crosses an await point.
pub async fn search(
    client: &reqwest::Client,
    installed_dirs: &HashSet<String>,
    query: &str,
) -> AppResult<Vec<RegistrySkill>> {
    let clean = clean_query(query);
    let target_id = clean.to_lowercase();
    let resp = github::search_skills_sh(client, &clean).await?;
    let mut out = Vec::with_capacity(resp.skills.len());
    for s in resp.skills {
        // GitHub-backed entries have `owner/repo` sources; site entries ("site/<domain>/…"
        // ids, bare-domain sources) are not installable in v1.
        let supported = !s.id.starts_with("site/") && s.source.matches('/').count() == 1;
        let installed =
            supported && installed_dirs.contains(&format!("net/{}/{}", s.source, s.skill_id));
        out.push(RegistrySkill {
            id: s.id,
            name: s.name,
            source: s.source,
            installs: s.installs,
            supported,
            installed,
        });
    }

    // Sort exact match to top if searching by URL or canonical ID
    out.sort_by(|a, b| {
        let a_match = a.id.to_lowercase() == target_id;
        let b_match = b.id.to_lowercase() == target_id;
        b_match.cmp(&a_match)
    });

    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_clean_query_url() {
        assert_eq!(
            clean_query("https://www.skills.sh/vercel-labs/skills/find-skills"),
            "vercel-labs/skills/find-skills"
        );
        assert_eq!(
            clean_query("https://skills.sh/vercel-labs/skills/find-skills"),
            "vercel-labs/skills/find-skills"
        );
        assert_eq!(
            clean_query("https://github.com/vercel-labs/skills/tree/main/find-skills"),
            "vercel-labs/skills/find-skills"
        );
        assert_eq!(
            clean_query("https://github.com/vercel-labs/skills/blob/main/find-skills/SKILL.md"),
            "vercel-labs/skills/find-skills"
        );
        assert_eq!(
            clean_query("npx skills add https://github.com/vercel-labs/skills --skill find-skills"),
            "vercel-labs/skills/find-skills"
        );
        assert_eq!(
            clean_query("npx skills add vercel-labs/skills --skill find-skills"),
            "vercel-labs/skills/find-skills"
        );
        assert_eq!(clean_query("react-query"), "react-query");
    }
}

