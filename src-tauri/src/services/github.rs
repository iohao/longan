use std::collections::HashMap;

use serde::Deserialize;

use crate::error::{AppError, AppResult};

#[derive(Clone, Debug)]
pub struct Commit {
    pub sha: String,
    pub tree_sha: String,
}

#[derive(Deserialize)]
struct CommitResponse {
    sha: String,
    commit: CommitData,
}

#[derive(Deserialize)]
struct CommitData {
    tree: TreeReference,
}

#[derive(Deserialize)]
struct TreeReference {
    sha: String,
}

#[derive(Deserialize)]
struct TreeResponse {
    tree: Vec<TreeEntry>,
}

#[derive(Clone, Deserialize)]
struct TreeEntry {
    path: String,
    sha: String,
    #[serde(rename = "type")]
    kind: String,
}

/// Shared HTTP client with the UA GitHub requires.
pub fn client() -> AppResult<reqwest::Client> {
    reqwest::Client::builder()
        .user_agent("longan/0.1")
        .build()
        .map_err(Into::into)
}

fn auth(req: reqwest::RequestBuilder, token: Option<&str>) -> reqwest::RequestBuilder {
    match token {
        Some(t) if !t.is_empty() => req.bearer_auth(t),
        _ => req,
    }
}

/// Friendly 404 message: the registry may reference repos that were renamed or removed.
fn repo_missing_message(owner: &str, repo: &str) -> String {
    format!("GitHub repository '{owner}/{repo}' does not exist (it may have been renamed or removed)")
}

/// Latest default-branch commit and its root tree SHA.
pub async fn latest_commit(
    client: &reqwest::Client,
    owner: &str,
    repo: &str,
    token: Option<&str>,
) -> AppResult<Commit> {
    let url = format!("https://api.github.com/repos/{owner}/{repo}/commits/HEAD");
    let resp = auth(client.get(&url), token).send().await?;
    match resp.status().as_u16() {
        200 => {
            let commit: CommitResponse = resp.json().await?;
            Ok(Commit {
                sha: commit.sha,
                tree_sha: commit.commit.tree.sha,
            })
        }
        403 | 429 => Err(AppError::RateLimited),
        404 => Err(AppError::NotFound(repo_missing_message(owner, repo))),
        s => Err(AppError::Network(format!("github returned {s} for {url}"))),
    }
}

/// Resolve a repository-relative directory to its Git tree SHA at `root_tree_sha`.
/// An empty path represents the repository root.
pub async fn path_tree_sha(
    client: &reqwest::Client,
    owner: &str,
    repo: &str,
    token: Option<&str>,
    root_tree_sha: &str,
    source_path: &str,
) -> AppResult<Option<String>> {
    Ok(path_tree_shas(
        client,
        owner,
        repo,
        token,
        root_tree_sha,
        &[source_path.to_string()],
    )
    .await?
    .remove(source_path)
    .flatten())
}

/// Resolve several directory paths while fetching each shared tree node once.
pub async fn path_tree_shas(
    client: &reqwest::Client,
    owner: &str,
    repo: &str,
    token: Option<&str>,
    root_tree_sha: &str,
    source_paths: &[String],
) -> AppResult<HashMap<String, Option<String>>> {
    let mut cached_trees = HashMap::<String, Vec<TreeEntry>>::new();
    let mut resolved = HashMap::new();

    for source_path in source_paths {
        let mut tree_sha = root_tree_sha.to_string();
        let mut exists = true;
        for component in source_path.split('/').filter(|part| !part.is_empty()) {
            let entries = if let Some(entries) = cached_trees.get(&tree_sha) {
                entries.clone()
            } else {
                let url = format!("https://api.github.com/repos/{owner}/{repo}/git/trees/{tree_sha}");
                let resp = auth(client.get(&url), token).send().await?;
                let entries = match resp.status().as_u16() {
                    200 => resp.json::<TreeResponse>().await?.tree,
                    403 | 429 => return Err(AppError::RateLimited),
                    404 => return Err(AppError::NotFound(repo_missing_message(owner, repo))),
                    status => {
                        return Err(AppError::Network(format!("github returned {status} for {url}")))
                    }
                };
                cached_trees.insert(tree_sha.clone(), entries.clone());
                entries
            };
            let Some(entry) = entries
                .into_iter()
                .find(|entry| entry.path == component && entry.kind == "tree")
            else {
                exists = false;
                break;
            };
            tree_sha = entry.sha;
        }
        resolved.insert(source_path.clone(), exists.then_some(tree_sha));
    }
    Ok(resolved)
}

/// Repository tarballs larger than this are rejected instead of downloaded.
const MAX_TARBALL_BYTES: u64 = 100 * 1024 * 1024;
const UNKNOWN_LENGTH_PROGRESS_STEP_BYTES: u64 = 256 * 1024;

/// Download the HEAD tarball of a repository into `dest_file`.
/// Streams to disk with a hard size cap so a huge repo (or a gzip bomb served
/// in place of one) can't exhaust memory or disk.
pub async fn download_tarball_ref(
    client: &reqwest::Client,
    owner: &str,
    repo: &str,
    git_ref: &str,
    token: Option<&str>,
    dest_file: &std::path::Path,
    is_cancelled: impl Fn() -> bool + Send + Sync,
    on_progress: impl Fn(u64, Option<u64>) + Send + Sync,
) -> AppResult<()> {
    if is_cancelled() {
        return Err(AppError::Cancelled);
    }
    let url = format!("https://codeload.github.com/{owner}/{repo}/tar.gz/{git_ref}");
    let mut resp = auth(client.get(&url), token).send().await?;

    // Check for common error statuses
    match resp.status().as_u16() {
        200 => {
            // Verify content is actually a tar.gz file by checking Content-Type or magic bytes
            let content_type = resp.headers()
                .get("content-type")
                .and_then(|v| v.to_str().ok())
                .unwrap_or("");

            if !content_type.contains("gzip") && !content_type.contains("octet-stream") && !content_type.contains("application/x-gzip") {
                tracing::warn!(%content_type, "expected a tar.gz response");
            }

            let total_bytes = resp.content_length();
            if total_bytes.is_some_and(|len| len > MAX_TARBALL_BYTES) {
                return Err(AppError::InvalidInput(format!(
                    "repository tarball exceeds the {} MB limit",
                    MAX_TARBALL_BYTES / (1024 * 1024)
                )));
            }

            use std::io::Write;
            let mut file = std::fs::File::create(dest_file)?;
            let mut written: u64 = 0;
            let mut first_chunk = true;
            let mut last_reported_percent = None;
            let mut last_reported_bytes = 0;
            on_progress(0, total_bytes);
            while let Some(chunk) = resp.chunk().await? {
                if is_cancelled() {
                    return Err(AppError::Cancelled);
                }
                // Validate it's actually a gzip stream (magic bytes: 1f 8b)
                if first_chunk {
                    if chunk.len() < 2 || chunk[0] != 0x1f || chunk[1] != 0x8b {
                        return Err(AppError::Network(format!(
                            "Invalid tarball format: expected gzip but got unexpected data from {url}"
                        )));
                    }
                    first_chunk = false;
                }
                written += chunk.len() as u64;
                if written > MAX_TARBALL_BYTES {
                    return Err(AppError::InvalidInput(format!(
                        "repository tarball exceeds the {} MB limit",
                        MAX_TARBALL_BYTES / (1024 * 1024)
                    )));
                }
                file.write_all(&chunk)?;
                let percent = total_bytes
                    .filter(|total| *total > 0)
                    .map(|total| ((written.saturating_mul(100) / total).min(100)) as u8);
                let should_report = percent != last_reported_percent
                    || (total_bytes.is_none()
                        && written.saturating_sub(last_reported_bytes)
                            >= UNKNOWN_LENGTH_PROGRESS_STEP_BYTES);
                if should_report {
                    on_progress(written, total_bytes);
                    last_reported_percent = percent;
                    last_reported_bytes = written;
                }
            }
            if first_chunk {
                return Err(AppError::Network(format!(
                    "Invalid tarball format: empty response from {url}"
                )));
            }
            if written != last_reported_bytes {
                on_progress(written, total_bytes);
            }
            Ok(())
        }
        403 | 429 => Err(AppError::RateLimited),
        404 => Err(AppError::NotFound(repo_missing_message(owner, repo))),
        401 => Err(AppError::Other(format!("Private or unauthorized repository: {owner}/{repo}. Please add a GitHub token in Settings."))),
        s => {
            // Try to get error message from response
            let error_body = resp.text().await.unwrap_or_default();
            if error_body.contains("rate limit") || error_body.contains("maximum number") {
                Err(AppError::RateLimited)
            } else {
                Err(AppError::Network(format!(
                    "github returned {s} for {url}. Response: {}",
                    error_body.chars().take(200).collect::<String>()
                )))
            }
        }
    }
}

#[derive(Deserialize)]
pub struct SearchResponse {
    #[serde(default)]
    pub skills: Vec<SearchSkill>,
}

#[derive(Deserialize)]
pub struct SearchSkill {
    pub id: String,
    #[serde(rename = "skillId")]
    pub skill_id: String,
    pub name: String,
    #[serde(default)]
    pub installs: i64,
    pub source: String,
}

/// Query the skills.sh search endpoint.
pub async fn search_skills_sh(client: &reqwest::Client, query: &str) -> AppResult<SearchResponse> {
    let url = format!("https://skills.sh/api/search?q={}", urlencode(query));
    let resp = client.get(&url).send().await?;
    if !resp.status().is_success() {
        return Err(AppError::Network(format!(
            "skills.sh returned {}",
            resp.status().as_u16()
        )));
    }
    Ok(resp.json::<SearchResponse>().await?)
}

fn urlencode(s: &str) -> String {
    s.bytes()
        .map(|b| match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                (b as char).to_string()
            }
            _ => format!("%{b:02X}"),
        })
        .collect()
}
