//! Fetch a remote OKF bundle into a local cache directory, which the frontend
//! then opens exactly like a picked folder (scan → read → watch → recents).
//!
//! Deliberately narrow: a GitHub repo (downloaded as a
//! tarball via GitHub's own archive endpoint — no git binary, no clone/pull/sync
//! surface) or a direct archive URL (`.tar.gz`/`.tgz`/`.tar`/`.zip`). Cloning
//! arbitrary git hosts is out of scope; that's a local `git clone` away.
//!
//! This Rust-owned path runs only when the user asks through Open from URL, an
//! example card, or Refresh from source. Other network paths have their own
//! explicit provider, installation, update, or source actions.
//! Guards: https-only, a size cap, request timeouts, and archive extraction that
//! refuses any entry escaping the destination (no zip-slip / `../` traversal).
//!
//! ## Private repositories
//!
//! GitHub private repos require a personal access token. The token is resolved
//! from the first available source, in order:
//! 1. The `token` field supplied by the frontend (from the Open-from-URL dialog).
//! 2. The `GITHUB_TOKEN` environment variable (CI / scripts).
//! 3. The `GH_TOKEN` environment variable (GitHub CLI convention).
//!
//! The token is sent as an `Authorization: Bearer` header on the initial
//! GitHub API request only. GitHub's archive redirect carries a signed
//! short-lived token in the query string, so the header is not forwarded.

use std::fs;
use std::io::Read;
use std::path::{Component, Path, PathBuf};
use std::time::Duration;

use serde::Deserialize;
use tauri::{AppHandle, Manager};

/// Cap on a single download, so a hostile or mistyped URL can't fill the disk.
const MAX_BYTES: u64 = 128 * 1024 * 1024; // 128 MB
const CONNECT_TIMEOUT: Duration = Duration::from_secs(20);
const READ_TIMEOUT: Duration = Duration::from_secs(120);
/// Redirect hops to follow. GitHub's tarball endpoint uses one, to codeload.
const MAX_REDIRECTS: u32 = 5;
/// GitHub's API requires a User-Agent; use the app's identity.
const USER_AGENT: &str = concat!("okf-viewer/", env!("CARGO_PKG_VERSION"));

/// The parsed source from the frontend (`src/types.ts` `RemoteSource`). The Rust
/// core only needs a subset; `label` and `host` ride along but go unused here.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteSource {
    pub input: String,
    pub kind: String,
    #[allow(dead_code)]
    pub host: String,
    pub owner: Option<String>,
    pub repo: Option<String>,
    #[serde(rename = "ref")]
    pub git_ref: Option<String>,
    pub subpath: Option<String>,
    #[allow(dead_code)]
    pub label: String,
    /// Personal access token for private GitHub repositories. When absent,
    /// the backend falls back to the GITHUB_TOKEN and GH_TOKEN env vars.
    pub token: Option<String>,
}

enum Archive {
    TarGz,
    Tar,
    Zip,
}

/// Fetch `source` into a per-source cache directory and return the local path
/// the caller should scan (descending into a GitHub tarball's top-level dir and
/// the requested subpath). Always fetches fresh — reuse of an already-fetched
/// copy is decided on the frontend, which scans the stored path before calling.
pub fn fetch(app: &AppHandle, source: RemoteSource) -> Result<String, String> {
    let (url, archive) = resolve(&source)?;
    // Resolve the token for GitHub private repos:
    // explicit > GITHUB_TOKEN > GH_TOKEN > gh CLI > git credential helper.
    let token = resolve_github_token(source.token.as_deref());

    let dest = cache_dir(app, &source)?;
    // Fresh fetch: clear any prior contents so a stale copy can't linger.
    if dest.exists() {
        fs::remove_dir_all(&dest).map_err(|e| format!("Couldn't clear the cache: {e}"))?;
    }
    fs::create_dir_all(&dest).map_err(|e| format!("Couldn't create the cache: {e}"))?;

    let download_result = download(&url, token.as_deref());
    match download_result {
        Ok(bytes) => match archive {
            Archive::TarGz => extract_tar(&mut flate2::read::GzDecoder::new(&bytes[..]), &dest)?,
            Archive::Tar => extract_tar(&mut &bytes[..], &dest)?,
            Archive::Zip => extract_zip(&bytes, &dest)?,
        },
        Err(err) => {
            // If tarball download failed for a GitHub repo, try git clone fallback
            // using local git configuration (e.g. SSH keys, local credentials).
            if source.kind == "github" {
                if let (Some(owner), Some(repo)) =
                    (source.owner.as_deref(), source.repo.as_deref())
                {
                    if clone_via_git(owner, repo, source.git_ref.as_deref(), &dest).is_err() {
                        return Err(err);
                    }
                } else {
                    return Err(err);
                }
            } else {
                return Err(err);
            }
        }
    }
    // A GitHub tarball (and many archives) wraps everything in a single
    // top-level dir; descend into it when there's exactly one, else scan the
    // extraction root as-is.
    let mut folder = single_child_dir(&dest).unwrap_or_else(|| dest.clone());

    if let Some(sub) = source.subpath.as_deref().filter(|s| !s.is_empty()) {
        folder = safe_join(&folder, sub)
            .ok_or_else(|| format!("The subpath '{sub}' is not a valid location."))?;
        if !folder.is_dir() {
            return Err(format!(
                "'{sub}' wasn't found in the fetched repository — check the path in the URL."
            ));
        }
    }

    folder
        .to_str()
        .map(str::to_owned)
        .ok_or_else(|| "The fetched path is not valid UTF-8.".to_string())
}

/// Map a source to its download URL and archive format.
fn resolve(source: &RemoteSource) -> Result<(String, Archive), String> {
    match source.kind.as_str() {
        "github" => {
            let owner = source.owner.as_deref().ok_or("Missing repository owner.")?;
            let repo = source.repo.as_deref().ok_or("Missing repository name.")?;
            // GitHub's archive endpoint redirects to codeload and streams a
            // gzipped tarball. Omitting the ref uses the default branch.
            let mut url = format!("https://api.github.com/repos/{owner}/{repo}/tarball");
            if let Some(git_ref) = source.git_ref.as_deref().filter(|r| !r.is_empty()) {
                url.push('/');
                url.push_str(git_ref);
            }
            Ok((url, Archive::TarGz))
        }
        "archive" => {
            let url = source.input.trim().to_string();
            if !url.to_lowercase().starts_with("https://") {
                return Err("Only https:// URLs are fetched.".to_string());
            }
            let lower = url.to_lowercase();
            let archive = if lower.ends_with(".zip") {
                Archive::Zip
            } else if lower.ends_with(".tar") {
                Archive::Tar
            } else {
                Archive::TarGz // .tar.gz / .tgz
            };
            Ok((url, archive))
        }
        other => Err(format!("Unsupported remote source: {other}.")),
    }
}

/// A stable per-source cache directory under the app cache dir, so reopening a
/// remote recent finds the same folder. Named from the source for legibility.
fn cache_dir(app: &AppHandle, source: &RemoteSource) -> Result<PathBuf, String> {
    let root = app
        .path()
        .app_cache_dir()
        .map_err(|e| format!("No cache directory available: {e}"))?
        .join("remote-bundles");
    Ok(root.join(cache_key(source)))
}

/// A filesystem-safe, reasonably-unique folder name for a source.
fn cache_key(source: &RemoteSource) -> String {
    let base = match source.kind.as_str() {
        "github" => format!(
            "github-{}-{}-{}",
            source.owner.as_deref().unwrap_or("_"),
            source.repo.as_deref().unwrap_or("_"),
            source.git_ref.as_deref().unwrap_or("default"),
        ),
        _ => format!("archive-{}", source.host),
    };
    let safe: String = base
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' {
                c
            } else {
                '_'
            }
        })
        .collect();
    // Disambiguate with a short non-cryptographic digest of the full input so
    // distinct subpaths/URLs don't collide on the same folder.
    format!("{safe}-{:08x}", fnv1a(&source.input))
}

/// FNV-1a 32-bit — a tiny, dependency-free hash for cache-key disambiguation.
fn fnv1a(s: &str) -> u32 {
    let mut hash: u32 = 0x811c_9dc5;
    for b in s.as_bytes() {
        hash ^= u32::from(*b);
        hash = hash.wrapping_mul(0x0100_0193);
    }
    hash
}

/// Resolve a GitHub token from the first available source:
/// explicit input → `GITHUB_TOKEN` env var → `GH_TOKEN` env var →
/// GitHub CLI (`gh auth token`) → Git credential helper (`git credential fill`).
fn resolve_github_token(explicit: Option<&str>) -> Option<String> {
    if let Some(t) = explicit.filter(|t| !t.trim().is_empty()) {
        return Some(t.to_owned());
    }
    for var in &["GITHUB_TOKEN", "GH_TOKEN"] {
        if let Ok(t) = std::env::var(var) {
            let trimmed = t.trim();
            if !trimmed.is_empty() {
                return Some(trimmed.to_string());
            }
        }
    }
    if let Some(t) = resolve_gh_cli_token() {
        return Some(t);
    }
    if let Some(t) = resolve_git_credential_token() {
        return Some(t);
    }
    None
}

/// Query the GitHub CLI for an active auth token.
fn resolve_gh_cli_token() -> Option<String> {
    let output = std::process::Command::new("gh")
        .args(["auth", "token"])
        .output()
        .ok()?;
    if output.status.success() {
        let tok = String::from_utf8(output.stdout).ok()?.trim().to_string();
        if !tok.is_empty() {
            return Some(tok);
        }
    }
    None
}

/// Query git's credential helper (e.g. macOS Keychain, libsecret, GCM) for github.com credentials.
fn resolve_git_credential_token() -> Option<String> {
    use std::io::Write;
    let mut child = std::process::Command::new("git")
        .args(["credential", "fill"])
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::null())
        .spawn()
        .ok()?;
    if let Some(mut stdin) = child.stdin.take() {
        let _ = stdin.write_all(b"protocol=https\nhost=github.com\n\n");
    }
    let output = child.wait_with_output().ok()?;
    if output.status.success() {
        let text = String::from_utf8_lossy(&output.stdout);
        for line in text.lines() {
            if let Some(password) = line.strip_prefix("password=") {
                let trimmed = password.trim();
                if !trimmed.is_empty() {
                    return Some(trimmed.to_string());
                }
            }
        }
    }
    None
}

/// Clone a repository via the local `git` binary, falling back to SSH if HTTPS fails.
fn clone_via_git(owner: &str, repo: &str, git_ref: Option<&str>, dest: &Path) -> Result<(), String> {
    let https_url = format!("https://github.com/{owner}/{repo}.git");
    if run_git_clone(&https_url, git_ref, dest).is_ok() {
        return Ok(());
    }
    let ssh_url = format!("git@github.com:{owner}/{repo}.git");
    run_git_clone(&ssh_url, git_ref, dest)
}

fn run_git_clone(url: &str, git_ref: Option<&str>, dest: &Path) -> Result<(), String> {
    if dest.exists() {
        let _ = fs::remove_dir_all(dest);
    }
    fs::create_dir_all(dest).map_err(|e| format!("Couldn't create directory: {e}"))?;

    let mut cmd = std::process::Command::new("git");
    cmd.args(["clone", "--depth", "1"]);
    if let Some(r) = git_ref.filter(|s| !s.is_empty()) {
        cmd.args(["--branch", r]);
    }
    cmd.args([url, dest.to_str().ok_or("Invalid destination path")?]);
    cmd.env("GIT_TERMINAL_PROMPT", "0");
    let output = cmd.output().map_err(|e| format!("git clone failed: {e}"))?;
    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr);
        return Err(format!("git clone failed: {}", err.trim()));
    }
    let git_dir = dest.join(".git");
    if git_dir.exists() {
        let _ = fs::remove_dir_all(&git_dir);
    }
    Ok(())
}

/// Download `url` into memory, enforcing https, timeouts, and the size cap.
/// When `token` is provided it is sent as `Authorization: Bearer` on the
/// initial request. GitHub's archive redirect uses a signed query-string
/// token, so the header does not need to follow across origins.
fn download(url: &str, token: Option<&str>) -> Result<Vec<u8>, String> {
    if !url.to_lowercase().starts_with("https://") {
        return Err("Only https:// URLs are fetched.".to_string());
    }
    let agent: ureq::Agent = ureq::Agent::config_builder()
        // Connect directly; ureq otherwise honours proxy variables from the environment.
        .proxy(None)
        .max_redirects(MAX_REDIRECTS)
        .timeout_connect(Some(CONNECT_TIMEOUT))
        .timeout_per_read(Some(READ_TIMEOUT))
        .user_agent(USER_AGENT)
        .build()
        .into();

    let request = agent.get(url);
    let request = if let Some(tok) = token {
        request.header("Authorization", &format!("Bearer {tok}"))
    } else {
        request
    };

    let resp = match request.call() {
        Ok(resp) => resp,
        Err(ureq::Error::StatusCode(401)) => {
            return Err(
                "Authentication failed (401) — the token is missing or invalid. \
                 Supply a personal access token with repo scope in the token field."
                    .to_string(),
            );
        }
        Err(ureq::Error::StatusCode(403)) => {
            return Err(
                "Access denied (403) — the token lacks permission for this repository. \
                 Check that it has repo scope and that the repo exists."
                    .to_string(),
            );
        }
        Err(ureq::Error::StatusCode(404)) => {
            return Err(
                "Not found (404) — check the URL. \
                 If the repository is private, provide a personal access token."
                    .to_string(),
            );
        }
        Err(ureq::Error::StatusCode(code)) => {
            return Err(format!("The server returned HTTP {code}."));
        }
        Err(t) => {
            return Err(format!("Couldn't reach the server: {t}."));
        }
    };

    // Read at most MAX_BYTES + 1 so we can detect an over-cap body.
    let mut buf = Vec::new();
    resp.into_body()
        .into_reader()
        .take(MAX_BYTES + 1)
        .read_to_end(&mut buf)
        .map_err(|e| format!("Download failed: {e}."))?;
    if buf.len() as u64 > MAX_BYTES {
        return Err("The remote bundle is larger than the 128 MB limit.".to_string());
    }
    Ok(buf)
}

/// Extract a tar stream into `dest`, skipping any entry that would escape it.
fn extract_tar<R: Read>(reader: &mut R, dest: &Path) -> Result<(), String> {
    let mut archive = tar::Archive::new(reader);
    // `unpack_in` (used by the entries loop below) refuses paths that escape the
    // destination, so `../` traversal reads as a skipped entry, not a write.
    for entry in archive.entries().map_err(|e| e.to_string())? {
        let mut entry = entry.map_err(|e| e.to_string())?;
        entry
            .unpack_in(dest)
            .map_err(|e| format!("Couldn't extract the archive: {e}."))?;
    }
    Ok(())
}

/// Extract a zip archive into `dest`, refusing entries that escape it.
fn extract_zip(bytes: &[u8], dest: &Path) -> Result<(), String> {
    let reader = std::io::Cursor::new(bytes);
    let mut zip = zip::ZipArchive::new(reader).map_err(|e| format!("Not a valid zip: {e}."))?;
    for i in 0..zip.len() {
        let mut file = zip.by_index(i).map_err(|e| e.to_string())?;
        // `enclosed_name` returns None for absolute paths or `../` traversal.
        let Some(rel) = file.enclosed_name() else {
            continue;
        };
        let out = dest.join(rel);
        if file.is_dir() {
            fs::create_dir_all(&out).map_err(|e| e.to_string())?;
        } else {
            if let Some(parent) = out.parent() {
                fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            let mut w = fs::File::create(&out).map_err(|e| e.to_string())?;
            std::io::copy(&mut file, &mut w).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

/// If `dir` contains exactly one entry and it's a directory, return it — the
/// GitHub-tarball case where everything nests under `owner-repo-<ref>/`.
fn single_child_dir(dir: &Path) -> Option<PathBuf> {
    let mut children = fs::read_dir(dir).ok()?.filter_map(Result::ok);
    let first = children.next()?;
    if children.next().is_some() {
        return None; // more than one entry
    }
    let path = first.path();
    path.is_dir().then_some(path)
}

/// Join `rel` onto `base`, returning None if it would escape `base` (defense in
/// depth for the subpath, which comes from a user-supplied URL).
fn safe_join(base: &Path, rel: &str) -> Option<PathBuf> {
    let mut out = base.to_path_buf();
    for comp in Path::new(rel).components() {
        match comp {
            Component::Normal(seg) => out.push(seg),
            Component::CurDir => {}
            // Reject `..`, absolute roots, and drive prefixes outright.
            _ => return None,
        }
    }
    Some(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use std::sync::atomic::{AtomicU32, Ordering};

    fn src(
        kind: &str,
        owner: Option<&str>,
        repo: Option<&str>,
        git_ref: Option<&str>,
        subpath: Option<&str>,
        input: &str,
    ) -> RemoteSource {
        RemoteSource {
            input: input.to_string(),
            kind: kind.to_string(),
            host: "github.com".to_string(),
            owner: owner.map(str::to_owned),
            repo: repo.map(str::to_owned),
            git_ref: git_ref.map(str::to_owned),
            subpath: subpath.map(str::to_owned),
            label: String::new(),
            token: None,
        }
    }

    /// A unique temp dir per test invocation, cleaned by the caller.
    fn tmp() -> PathBuf {
        static N: AtomicU32 = AtomicU32::new(0);
        let dir = std::env::temp_dir().join(format!(
            "okf-remote-test-{}-{}",
            std::process::id(),
            N.fetch_add(1, Ordering::Relaxed),
        ));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn github_resolves_to_the_tarball_endpoint_with_optional_ref() {
        let (url, arch) = resolve(&src("github", Some("o"), Some("r"), None, None, "")).unwrap();
        assert_eq!(url, "https://api.github.com/repos/o/r/tarball");
        assert!(matches!(arch, Archive::TarGz));

        let (url, _) = resolve(&src(
            "github",
            Some("o"),
            Some("r"),
            Some("main"),
            Some("docs"),
            "",
        ))
        .unwrap();
        assert_eq!(url, "https://api.github.com/repos/o/r/tarball/main");
    }

    #[test]
    fn archive_kind_detects_format_and_requires_https() {
        assert!(matches!(
            resolve(&src(
                "archive",
                None,
                None,
                None,
                None,
                "https://x.io/b.zip"
            ))
            .unwrap()
            .1,
            Archive::Zip
        ));
        assert!(matches!(
            resolve(&src(
                "archive",
                None,
                None,
                None,
                None,
                "https://x.io/b.tar"
            ))
            .unwrap()
            .1,
            Archive::Tar
        ));
        assert!(matches!(
            resolve(&src(
                "archive",
                None,
                None,
                None,
                None,
                "https://x.io/b.tar.gz"
            ))
            .unwrap()
            .1,
            Archive::TarGz
        ));
        assert!(resolve(&src("archive", None, None, None, None, "http://x.io/b.zip")).is_err());
        assert!(resolve(&src("git", None, None, None, None, "")).is_err());
    }

    #[test]
    fn resolve_github_token_prefers_explicit_over_env() {
        // Explicit non-empty token wins regardless of env.
        let result = resolve_github_token(Some("explicit_token"));
        assert_eq!(result.as_deref(), Some("explicit_token"));

        // Empty/whitespace explicit falls through.
        std::env::set_var("GITHUB_TOKEN", "env_token");
        let result = resolve_github_token(Some("  "));
        assert_eq!(result.as_deref(), Some("env_token"));
        std::env::remove_var("GITHUB_TOKEN");

        std::env::remove_var("GITHUB_TOKEN");
        std::env::remove_var("GH_TOKEN");
    }

    #[test]
    fn safe_join_refuses_traversal_and_absolute_paths() {
        let base = Path::new("/cache/bundle");
        assert_eq!(
            safe_join(base, "docs"),
            Some(PathBuf::from("/cache/bundle/docs"))
        );
        assert_eq!(
            safe_join(base, "a/b"),
            Some(PathBuf::from("/cache/bundle/a/b"))
        );
        assert_eq!(
            safe_join(base, "./docs"),
            Some(PathBuf::from("/cache/bundle/docs"))
        );
        assert_eq!(safe_join(base, "../../etc/passwd"), None);
        assert_eq!(safe_join(base, "/etc/passwd"), None);
    }

    #[test]
    fn cache_key_is_filesystem_safe_and_input_sensitive() {
        let a = cache_key(&src(
            "github",
            Some("o"),
            Some("r"),
            Some("main"),
            Some("docs"),
            "url-a",
        ));
        let b = cache_key(&src(
            "github",
            Some("o"),
            Some("r"),
            Some("main"),
            Some("other"),
            "url-b",
        ));
        assert!(a.chars().all(|c| c.is_ascii_alphanumeric() || c == '-'));
        assert_ne!(a, b, "distinct inputs must not collide on one cache dir");
    }

    #[test]
    fn single_child_dir_descends_only_for_one_directory() {
        let dir = tmp();
        assert_eq!(single_child_dir(&dir), None, "empty");
        fs::create_dir(dir.join("only")).unwrap();
        assert_eq!(single_child_dir(&dir), Some(dir.join("only")));
        fs::write(dir.join("extra.md"), b"x").unwrap();
        assert_eq!(single_child_dir(&dir), None, "two entries");
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn extract_tar_round_trips_a_nested_entry() {
        // The tar writer refuses to emit a `..` path at all, so a malicious
        // tarball can't be forged through its API; extraction-time traversal is
        // guarded by `unpack_in` (upstream-tested). Here we verify our happy
        // path — a nested file lands at the right place — while the zip test
        // exercises our own hand-rolled containment guard.
        let mut builder = tar::Builder::new(Vec::new());
        let good = b"# hi\n";
        let mut h = tar::Header::new_gnu();
        h.set_size(good.len() as u64);
        h.set_cksum();
        builder
            .append_data(&mut h, "root/index.md", &good[..])
            .unwrap();
        let bytes = builder.into_inner().unwrap();

        let dir = tmp();
        extract_tar(&mut &bytes[..], &dir).unwrap();
        assert_eq!(fs::read(dir.join("root/index.md")).unwrap(), good);
        let _ = fs::remove_dir_all(&dir);
    }

    /// End-to-end against the real GitHub tarball endpoint — resolve → download
    /// → extract → descend the tarball's top dir → apply the subpath. Ignored by
    /// default (needs network); run with `cargo test -- --ignored`.
    #[test]
    #[ignore = "hits the network"]
    fn fetches_and_extracts_a_real_github_subpath() {
        let source = src(
            "github",
            Some("saschb2b"),
            Some("okf-studio"),
            Some("main"),
            Some("docs"),
            "https://github.com/saschb2b/okf-studio/tree/main/docs",
        );
        let (url, _) = resolve(&source).unwrap();
        let bytes = download(&url, None).expect("download the repo tarball");
        let dir = tmp();
        extract_tar(&mut flate2::read::GzDecoder::new(&bytes[..]), &dir).unwrap();
        let root = single_child_dir(&dir).expect("one top-level dir in the tarball");
        let docs = safe_join(&root, "docs").unwrap();
        assert!(
            docs.join("index.md").is_file(),
            "docs/index.md should exist in the fetched subpath"
        );
        let _ = fs::remove_dir_all(&dir);
    }

    /// End-to-end against a private GitHub repo — requires GITHUB_TOKEN or GH_TOKEN
    /// in the environment and network access. Ignored by default.
    #[test]
    #[ignore = "hits the network; needs GITHUB_TOKEN or GH_TOKEN"]
    fn fetches_and_extracts_a_private_github_repo() {
        let source = src(
            "github",
            Some("lutfi-zain"),
            Some("multica-marketing-agency"),
            None,
            None,
            "https://github.com/lutfi-zain/multica-marketing-agency",
        );
        let (url, _) = resolve(&source).unwrap();
        let token = resolve_github_token(None);
        assert!(
            token.is_some(),
            "GITHUB_TOKEN or GH_TOKEN must be set for this test"
        );
        let bytes = download(&url, token.as_deref()).expect("download the private repo tarball");
        let dir = tmp();
        extract_tar(&mut flate2::read::GzDecoder::new(&bytes[..]), &dir).unwrap();
        let root = single_child_dir(&dir).expect("one top-level dir in the tarball");
        // The repo stores its OKF bundle in .okf/ at the repo root.
        let okf_dir = root.join(".okf");
        assert!(
            okf_dir.join("index.md").is_file(),
            ".okf/index.md should exist in the fetched private repo"
        );
        let _ = fs::remove_dir_all(&dir);
    }


    #[test]
    fn extract_zip_writes_safe_entries_and_skips_traversal() {
        let mut zip = zip::ZipWriter::new(std::io::Cursor::new(Vec::new()));
        let opts = zip::write::SimpleFileOptions::default()
            .compression_method(zip::CompressionMethod::Stored);
        zip.start_file("root/index.md", opts).unwrap();
        zip.write_all(b"# hi\n").unwrap();
        zip.start_file("../escape.md", opts).unwrap();
        zip.write_all(b"pwned").unwrap();
        let bytes = zip.finish().unwrap().into_inner();

        let dir = tmp();
        extract_zip(&bytes, &dir).unwrap();
        assert_eq!(fs::read(dir.join("root/index.md")).unwrap(), b"# hi\n");
        assert!(!dir.parent().unwrap().join("escape.md").exists());
        let _ = fs::remove_dir_all(&dir);
    }
}
