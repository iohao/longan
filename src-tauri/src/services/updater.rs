use std::collections::{BTreeMap, HashMap};
use std::time::{SystemTime, UNIX_EPOCH};

use rusqlite::Connection;

use crate::db::repo;
use crate::error::{AppError, AppResult};
use crate::services::github;

const LAST_CHECK_KEY: &str = "last_skill_update_check_at";

/// Checks if an automatic update check should run, given the minimum interval in seconds.
pub fn should_auto_check(conn: &Connection, interval_secs: u64) -> AppResult<bool> {
    let last_check = repo::get_setting(conn, LAST_CHECK_KEY)?;
    let now_ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    Ok(is_auto_check_due(
        last_check.as_deref(),
        now_ts,
        interval_secs,
    ))
}

fn is_auto_check_due(last_check: Option<&str>, now_ts: u64, interval_secs: u64) -> bool {
    let Some(last_ts) = last_check.and_then(|value| value.parse::<u64>().ok()) else {
        return true;
    };
    now_ts.saturating_sub(last_ts) >= interval_secs
}

/// Updates the last update check timestamp to current system time.
pub fn update_last_check_timestamp(conn: &Connection) -> AppResult<()> {
    let now_ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    repo::set_setting(conn, LAST_CHECK_KEY, &now_ts.to_string())
}

/// Network phase: fetch the latest SHA for each unique repo.
/// `repos` is a list of (owner, repo) pairs, already deduplicated.
pub async fn fetch_latest_commits(
    client: &reqwest::Client,
    repos: &[(String, String)],
    token: Option<&str>,
) -> AppResult<HashMap<(String, String), github::Commit>> {
    let mut commits = HashMap::new();
    for (owner, repo_name) in repos {
        match github::latest_commit(client, owner, repo_name, token).await {
            Ok(commit) => {
                commits.insert((owner.clone(), repo_name.clone()), commit);
            }
            Err(AppError::Network(msg)) if msg.contains("401") => {
                // Skip private/unauthorized repos - they'll remain with existing SHA
                tracing::warn!(%owner, %repo_name, "skipping unauthorized repository");
            }
            Err(e) => return Err(e),
        }
    }
    Ok(commits)
}

/// DB phase: collect unique repos of all healthy net skills in prioritized order:
/// 1. Repos never checked (`latest_sha IS NULL`)
/// 2. Repos checked longest ago (earliest `updated_at`)
pub fn repos_to_check(conn: &Connection) -> AppResult<Vec<(String, String)>> {
    let mut stmt = conn.prepare(
        r#"
        SELECT owner, repo
        FROM skills
        WHERE source_type = 'net' AND status != 'missing' AND owner IS NOT NULL AND repo IS NOT NULL
        ORDER BY
            CASE WHEN latest_sha IS NULL THEN 0 ELSE 1 END ASC,
            updated_at ASC
        "#,
    )?;
    let rows = stmt.query_map([], |r| {
        let owner: String = r.get(0)?;
        let repo: String = r.get(1)?;
        Ok((owner, repo))
    })?;

    let mut repos = vec![];
    for r in rows {
        let pair = r?;
        if !repos.contains(&pair) {
            repos.push(pair);
        }
    }
    Ok(repos)
}

/// DB phase: apply fetched SHAs, returning how many skills became updatable.
pub async fn fetch_skill_tree_shas(
    client: &reqwest::Client,
    skills: &[crate::models::Skill],
    commits: &HashMap<(String, String), github::Commit>,
    token: Option<&str>,
) -> AppResult<HashMap<i64, Option<String>>> {
    let mut tree_shas = HashMap::new();
    let mut paths_by_repo = BTreeMap::<(String, String), Vec<(i64, String)>>::new();
    for skill in skills {
        if let (Some(owner), Some(repo_name), Some(source_path)) =
            (&skill.owner, &skill.repo, &skill.source_path)
        {
            if commits.contains_key(&(owner.clone(), repo_name.clone())) {
                paths_by_repo
                    .entry((owner.clone(), repo_name.clone()))
                    .or_default()
                    .push((skill.id, source_path.clone()));
            }
        }
    }
    for ((owner, repo_name), paths) in paths_by_repo {
        let commit = &commits[&(owner.clone(), repo_name.clone())];
        let source_paths = paths
            .iter()
            .map(|(_, source_path)| source_path.clone())
            .collect::<Vec<_>>();
        let resolved = github::path_tree_shas(
            client,
            &owner,
            &repo_name,
            token,
            &commit.tree_sha,
            &source_paths,
        )
        .await?;
        for (skill_id, source_path) in paths {
            tree_shas.insert(skill_id, resolved.get(&source_path).cloned().flatten());
        }
    }
    Ok(tree_shas)
}

/// DB phase: apply fetched repository and directory tree state.
pub fn apply_update_states(
    conn: &Connection,
    commits: &HashMap<(String, String), github::Commit>,
    tree_shas: &HashMap<i64, Option<String>>,
) -> AppResult<usize> {
    let mut updates = 0usize;
    for s in repo::list_skills(conn)? {
        let (Some(owner), Some(repo_name)) = (s.owner.clone(), s.repo.clone()) else {
            continue;
        };
        let Some(commit) = commits.get(&(owner, repo_name)) else {
            continue;
        };
        repo::set_skill_update_status(
            conn,
            s.id,
            &commit.sha,
            tree_shas.get(&s.id).and_then(|tree_sha| tree_sha.as_deref()),
        )?;
        let after = repo::get_skill(conn, s.id)?;
        if s.status != "update_available" && after.status == "update_available" {
            updates += 1;
        }
    }
    repo::log_op(conn, "check_updates", &format!("{updates} updates found"));
    Ok(updates)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn auto_check_is_due_without_a_timestamp() {
        assert!(is_auto_check_due(None, 10_000, 3_600));
    }

    #[test]
    fn auto_check_is_due_with_an_invalid_timestamp() {
        assert!(is_auto_check_due(Some("invalid"), 10_000, 3_600));
    }

    #[test]
    fn auto_check_is_not_due_before_the_interval() {
        assert!(!is_auto_check_due(Some("6401"), 10_000, 3_600));
    }

    #[test]
    fn auto_check_is_due_at_the_interval_boundary() {
        assert!(is_auto_check_due(Some("6400"), 10_000, 3_600));
    }
}
