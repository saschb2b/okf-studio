//! Fetch a remote OKF bundle into a local cache directory, which the frontend
//! then opens exactly like a picked folder (scan → read → watch → recents).
//!
//! Deliberately narrow: a GitHub repo (downloaded as a tarball via GitHub's own
//! archive endpoint) or a direct archive URL (`.tar.gz`/`.tgz`/`.tar`/`.zip`).
//! Cloning arbitrary git hosts is out of scope; that's a local `git clone` away.
//!
//! This Rust-owned path runs only when the user asks through Open from URL, an
//! example card, or Refresh from source. Other network paths have their own
//! explicit provider, installation, update, or source actions.
//! Guards: https-only, a size cap, request timeouts, and archive extraction that
//! refuses any entry escaping the destination (no zip-slip / `../` traversal).
//!
//! ## Private GitHub repositories
//!
//! Credentials apply to GitHub sources only. A direct archive URL can name any
//! host, so it is always fetched anonymously.
//!
//! A token typed into the dialog is sent on the first request. Without one the
//! first request is anonymous, so a public repository never reads local
//! credentials or starts another process. Only when GitHub answers 401, 403, or
//! 404 does the fetch look for a local credential, in order: `GITHUB_TOKEN`,
//! `GH_TOKEN`, `gh auth token`, then `git credential fill` for `github.com`.
//! If the tarball is still refused, a shallow `git clone` through the system
//! Git covers SSH keys and `url.insteadOf` rewrites. Every helper process runs
//! with prompts disabled and under a wall-clock limit.
//!
//! The token travels as `Authorization: Bearer` to `api.github.com` only. ureq
//! drops the header when GitHub redirects to its archive host.

use std::fs;
use std::io::Read;
use std::path::{Component, Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

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
/// Limit on `gh auth token` and `git credential fill`, which answer from local
/// state and should return at once.
const CREDENTIAL_TIMEOUT: Duration = Duration::from_secs(10);
/// Limit on the shallow-clone fallback.
const CLONE_TIMEOUT: Duration = Duration::from_secs(300);
/// The clone lands in this fixed child of the cache directory, mirroring the
/// single top-level directory a GitHub tarball unpacks to.
const CLONE_DIR: &str = "repo";

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
///
/// `token` is the optional personal access token from the dialog. It is a
/// separate argument, not a field of `RemoteSource`, because the frontend
/// persists the source in recents and the token must never be stored.
pub fn fetch(
    app: &AppHandle,
    source: RemoteSource,
    token: Option<String>,
) -> Result<String, String> {
    let (url, archive) = resolve(&source)?;

    let dest = cache_dir(app, &source)?;
    // Fresh fetch: clear any prior contents so a stale copy can't linger.
    if dest.exists() {
        fs::remove_dir_all(&dest).map_err(|e| format!("Couldn't clear the cache: {e}"))?;
    }
    fs::create_dir_all(&dest).map_err(|e| format!("Couldn't create the cache: {e}"))?;

    if source.kind == "github" {
        fetch_github(&source, &url, token.as_deref(), &dest)?;
    } else {
        let bytes = download(&url, None).map_err(|e| e.message(false))?;
        match archive {
            Archive::TarGz => extract_tar(&mut flate2::read::GzDecoder::new(&bytes[..]), &dest)?,
            Archive::Tar => extract_tar(&mut &bytes[..], &dest)?,
            Archive::Zip => extract_zip(&bytes, &dest)?,
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

/// Fetch a GitHub repository into `dest`, escalating from an anonymous request
/// to local credentials only when GitHub refuses access.
fn fetch_github(
    source: &RemoteSource,
    url: &str,
    explicit: Option<&str>,
    dest: &Path,
) -> Result<(), String> {
    let unpack = |bytes: Vec<u8>| extract_tar(&mut flate2::read::GzDecoder::new(&bytes[..]), dest);

    let explicit = explicit.map(str::trim).filter(|t| !t.is_empty());
    let refused = match download(url, explicit) {
        Ok(bytes) => return unpack(bytes),
        Err(err) => err,
    };
    // A token the user typed gets a direct answer. Only an anonymous refusal
    // moves on to credentials the user did not name.
    if explicit.is_some() || !refused.is_access_refusal() {
        return Err(refused.message(true));
    }

    if let Some(token) = local_github_token() {
        match download(url, Some(&token)) {
            Ok(bytes) => return unpack(bytes),
            Err(err) if !err.is_access_refusal() => return Err(err.message(true)),
            Err(_) => {}
        }
    }

    let (Some(owner), Some(repo)) = (source.owner.as_deref(), source.repo.as_deref()) else {
        return Err(refused.message(true));
    };
    // The refusal from GitHub describes the problem better than git's stderr.
    clone_via_git(owner, repo, source.git_ref.as_deref(), dest).map_err(|()| refused.message(true))
}

/// A GitHub token from the local environment: `GITHUB_TOKEN`, `GH_TOKEN`, the
/// GitHub CLI, then Git's credential helper.
fn local_github_token() -> Option<String> {
    token_from_env(|name| std::env::var(name).ok())
        .or_else(gh_cli_token)
        .or_else(git_credential_token)
}

fn token_from_env(var: impl Fn(&str) -> Option<String>) -> Option<String> {
    ["GITHUB_TOKEN", "GH_TOKEN"]
        .into_iter()
        .find_map(|name| var(name).and_then(|value| non_empty(&value)))
}

fn non_empty(value: &str) -> Option<String> {
    let trimmed = value.trim();
    (!trimmed.is_empty()).then(|| trimmed.to_owned())
}

/// The token of the account signed in to the GitHub CLI, if any.
fn gh_cli_token() -> Option<String> {
    let mut command = helper_command("gh");
    command.args(["auth", "token", "--hostname", "github.com"]);
    non_empty(&run_bounded(command, None, CREDENTIAL_TIMEOUT)?)
}

/// The github.com password held by Git's credential helper (Keychain,
/// libsecret, Git Credential Manager), which for GitHub is a token.
fn git_credential_token() -> Option<String> {
    let mut command = helper_command("git");
    command.args(["credential", "fill"]);
    let reply = run_bounded(
        command,
        Some(b"protocol=https\nhost=github.com\n\n"),
        CREDENTIAL_TIMEOUT,
    )?;
    parse_credential_password(&reply)
}

fn parse_credential_password(reply: &str) -> Option<String> {
    reply
        .lines()
        .find_map(|line| line.strip_prefix("password="))
        .and_then(non_empty)
}

/// A `gh` or `git` invocation that can never stop to ask the user something.
/// An empty `GIT_ASKPASS` disables Git's askpass lookup, `GCM_INTERACTIVE`
/// keeps Git Credential Manager from opening a sign-in window, and
/// `SSH_ASKPASS_REQUIRE` does the same for an SSH key passphrase.
fn helper_command(program: &str) -> Command {
    let mut command = Command::new(program);
    command
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("GIT_ASKPASS", "")
        .env("GCM_INTERACTIVE", "never")
        .env("GH_PROMPT_DISABLED", "1")
        .env("SSH_ASKPASS_REQUIRE", "never")
        .stderr(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;

        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        command.creation_flags(CREATE_NO_WINDOW);
    }
    command
}

/// Run `command` to completion within `timeout`, optionally feeding `stdin`,
/// and return its stdout on a zero exit. A process that overruns is killed.
/// Callers expect a short reply, well under one pipe buffer.
fn run_bounded(mut command: Command, stdin: Option<&[u8]>, timeout: Duration) -> Option<String> {
    use std::io::Write;

    command
        .stdin(if stdin.is_some() {
            Stdio::piped()
        } else {
            Stdio::null()
        })
        .stdout(Stdio::piped());
    let mut child = command.spawn().ok()?;
    if let (Some(input), Some(mut pipe)) = (stdin, child.stdin.take()) {
        let _ = pipe.write_all(input);
    }
    if !wait_bounded(&mut child, timeout) {
        return None;
    }
    let mut out = String::new();
    child.stdout.take()?.read_to_string(&mut out).ok()?;
    Some(out)
}

/// Wait for `child` up to `timeout`, killing it on overrun. True on a zero exit.
fn wait_bounded(child: &mut std::process::Child, timeout: Duration) -> bool {
    let deadline = Instant::now() + timeout;
    loop {
        match child.try_wait() {
            Ok(Some(status)) => return status.success(),
            Ok(None) if Instant::now() < deadline => {
                std::thread::sleep(Duration::from_millis(50));
            }
            _ => {
                let _ = child.kill();
                let _ = child.wait();
                return false;
            }
        }
    }
}

/// Shallow-clone a GitHub repository through the system Git into
/// `dest/CLONE_DIR`, over HTTPS first and then SSH. This reaches repositories
/// the user can only read through an SSH key or a `url.insteadOf` rewrite.
fn clone_via_git(owner: &str, repo: &str, git_ref: Option<&str>, dest: &Path) -> Result<(), ()> {
    if !is_github_name(owner) || !is_github_name(repo) {
        return Err(());
    }
    let target = dest.join(CLONE_DIR);
    let urls = [
        format!("https://github.com/{owner}/{repo}.git"),
        format!("git@github.com:{owner}/{repo}.git"),
    ];
    for url in &urls {
        if run_git_clone(url, git_ref, &target) {
            return Ok(());
        }
        let _ = fs::remove_dir_all(&target);
    }
    Err(())
}

/// Owner and repository names as GitHub allows them. Checked before a name is
/// spliced into a clone URL handed to Git.
fn is_github_name(name: &str) -> bool {
    !name.is_empty()
        && !name.starts_with(['-', '.'])
        && name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.'))
}

fn run_git_clone(url: &str, git_ref: Option<&str>, target: &Path) -> bool {
    let mut command = helper_command("git");
    command
        // A repository is untrusted content: check symlinks out as plain files
        // so none can point outside the cache directory.
        .args(["-c", "core.symlinks=false"])
        .args(["clone", "--quiet", "--depth", "1", "--no-tags"]);
    if let Some(git_ref) = git_ref.filter(|r| !r.is_empty()) {
        command.arg(format!("--branch={git_ref}"));
    }
    command
        .arg("--")
        .arg(url)
        .arg(target)
        .stdin(Stdio::null())
        .stdout(Stdio::null());
    let Ok(mut child) = command.spawn() else {
        return false;
    };
    if !wait_bounded(&mut child, CLONE_TIMEOUT) {
        return false;
    }
    let _ = fs::remove_dir_all(target.join(".git"));
    // The clone bypasses the download cap, so hold the result to the same limit.
    dir_size_within(target, MAX_BYTES)
}

/// Whether the files under `dir` total at most `limit` bytes.
fn dir_size_within(dir: &Path, limit: u64) -> bool {
    fn add(dir: &Path, limit: u64, total: &mut u64) -> bool {
        let Ok(entries) = fs::read_dir(dir) else {
            return false;
        };
        for entry in entries.filter_map(Result::ok) {
            let Ok(meta) = entry.metadata() else {
                return false;
            };
            if meta.is_dir() {
                if !add(&entry.path(), limit, total) {
                    return false;
                }
            } else {
                *total += meta.len();
                if *total > limit {
                    return false;
                }
            }
        }
        true
    }
    add(dir, limit, &mut 0)
}

/// Why a download failed. The HTTP status is kept so a GitHub fetch can tell a
/// refusal that credentials might fix from one they cannot.
#[derive(Debug)]
enum DownloadError {
    Status(u16),
    Other(String),
}

impl DownloadError {
    /// GitHub answers 404 for a private repository the caller may not see, and
    /// 403 when the anonymous rate limit is spent.
    fn is_access_refusal(&self) -> bool {
        matches!(self, Self::Status(401 | 403 | 404))
    }

    /// The message shown in the dialog. `github` selects wording about tokens,
    /// which would mislead for an archive on another host.
    fn message(&self, github: bool) -> String {
        match self {
            Self::Status(401) if github => {
                "GitHub rejected the token (401). Check that it is valid and has not expired."
                    .to_string()
            }
            Self::Status(403) if github => {
                "GitHub denied access (403). The token may lack access to this repository, \
                 or the anonymous rate limit is spent."
                    .to_string()
            }
            Self::Status(404) if github => {
                "Not found (404). Check the URL. A private repository needs a token, \
                 a signed-in GitHub CLI, or Git credentials for github.com."
                    .to_string()
            }
            Self::Status(404) => "Not found (404). Check the URL.".to_string(),
            Self::Status(code) => format!("The server returned HTTP {code}."),
            Self::Other(message) => message.clone(),
        }
    }
}

/// Download `url` into memory, enforcing https, timeouts, and the size cap.
/// `token`, when given, is sent as `Authorization: Bearer` on the first request
/// only: ureq's default `RedirectAuthHeaders::Never` drops it on a redirect.
fn download(url: &str, token: Option<&str>) -> Result<Vec<u8>, DownloadError> {
    let other = |message: String| DownloadError::Other(message);
    if !url.to_lowercase().starts_with("https://") {
        return Err(other("Only https:// URLs are fetched.".to_string()));
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

    let mut request = agent.get(url);
    if let Some(token) = token {
        request = request.header("Authorization", format!("Bearer {token}"));
    }

    let resp = match request.call() {
        Ok(resp) => resp,
        Err(ureq::Error::StatusCode(code)) => return Err(DownloadError::Status(code)),
        Err(e) => return Err(other(format!("Couldn't reach the server: {e}."))),
    };

    // Read at most MAX_BYTES + 1 so we can detect an over-cap body.
    let mut buf = Vec::new();
    resp.into_body()
        .into_reader()
        .take(MAX_BYTES + 1)
        .read_to_end(&mut buf)
        .map_err(|e| other(format!("Download failed: {e}.")))?;
    if buf.len() as u64 > MAX_BYTES {
        return Err(other(
            "The remote bundle is larger than the 128 MB limit.".to_string(),
        ));
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
    fn env_token_prefers_github_token_and_skips_blank_values() {
        let env = |pairs: &'static [(&'static str, &'static str)]| {
            move |name: &str| {
                pairs
                    .iter()
                    .find(|(key, _)| *key == name)
                    .map(|(_, value)| (*value).to_string())
            }
        };
        assert_eq!(
            token_from_env(env(&[("GITHUB_TOKEN", " a "), ("GH_TOKEN", "b")])).as_deref(),
            Some("a")
        );
        assert_eq!(
            token_from_env(env(&[("GITHUB_TOKEN", "  "), ("GH_TOKEN", "b")])).as_deref(),
            Some("b")
        );
        assert_eq!(token_from_env(env(&[])), None);
    }

    #[test]
    fn credential_reply_yields_its_password_line() {
        let reply = "protocol=https\nhost=github.com\nusername=octo\npassword=gho_abc\n";
        assert_eq!(parse_credential_password(reply).as_deref(), Some("gho_abc"));
        assert_eq!(parse_credential_password("username=octo\n"), None);
        assert_eq!(parse_credential_password("password=\n"), None);
    }

    #[test]
    fn only_access_refusals_escalate_to_local_credentials() {
        for code in [401, 403, 404] {
            assert!(DownloadError::Status(code).is_access_refusal());
        }
        assert!(!DownloadError::Status(500).is_access_refusal());
        assert!(!DownloadError::Other("too large".to_string()).is_access_refusal());
    }

    #[test]
    fn archive_errors_never_mention_tokens() {
        for code in [401, 403, 404] {
            let message = DownloadError::Status(code).message(false);
            assert!(!message.to_lowercase().contains("token"), "{message}");
        }
        assert!(DownloadError::Status(404).message(true).contains("token"));
    }

    #[test]
    fn clone_urls_accept_only_github_names() {
        assert!(is_github_name("okf-studio"));
        assert!(is_github_name("some.repo_1"));
        for bad in ["", "..", ".git", "-oProxyCommand=x", "a/b", "a b", "a:b"] {
            assert!(!is_github_name(bad), "{bad}");
        }
    }

    #[test]
    fn dir_size_check_counts_nested_files() {
        let dir = tmp();
        fs::create_dir_all(dir.join("a/b")).unwrap();
        fs::write(dir.join("a/one"), [0u8; 600]).unwrap();
        fs::write(dir.join("a/b/two"), [0u8; 600]).unwrap();
        assert!(dir_size_within(&dir, 1200));
        assert!(!dir_size_within(&dir, 1199));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn bounded_run_kills_a_process_that_overruns() {
        let started = Instant::now();
        let mut command = Command::new(if cfg!(windows) { "ping" } else { "sleep" });
        command.args(if cfg!(windows) {
            ["-n", "30", "127.0.0.1"].as_slice()
        } else {
            ["30"].as_slice()
        });
        assert!(run_bounded(command, None, Duration::from_millis(200)).is_none());
        assert!(started.elapsed() < Duration::from_secs(10));
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

    /// End-to-end against a private GitHub repository named by
    /// `OKF_TEST_PRIVATE_REPO` (`owner/repo`), readable through the local `gh`
    /// or Git credentials. Proves the anonymous request is refused and the
    /// escalation to local credentials succeeds.
    #[test]
    #[ignore = "hits the network; needs OKF_TEST_PRIVATE_REPO and local GitHub credentials"]
    fn fetches_a_private_github_repo_with_local_credentials() {
        let name = std::env::var("OKF_TEST_PRIVATE_REPO").expect("set OKF_TEST_PRIVATE_REPO");
        let (owner, repo) = name.split_once('/').expect("owner/repo");
        let source = src(
            "github",
            Some(owner),
            Some(repo),
            None,
            None,
            &format!("https://github.com/{name}"),
        );
        let (url, _) = resolve(&source).unwrap();
        let anonymous = download(&url, None).expect_err("a private repo refuses anonymous reads");
        assert!(anonymous.is_access_refusal());

        let dir = tmp();
        fetch_github(&source, &url, None, &dir).expect("fetch with local credentials");
        let root = single_child_dir(&dir).expect("one top-level dir");
        assert!(fs::read_dir(&root).unwrap().next().is_some());
        assert!(!root.join(".git").exists());
        let _ = fs::remove_dir_all(&dir);
    }

    /// The clone fallback on its own, against a public repository so it needs
    /// no credentials: the layout matches a tarball and `.git` is removed.
    #[test]
    #[ignore = "hits the network; needs git"]
    fn clone_fallback_matches_the_tarball_layout() {
        let dir = tmp();
        clone_via_git("saschb2b", "okf-studio", Some("main"), &dir).expect("clone");
        let root = single_child_dir(&dir).expect("one top-level dir");
        assert!(root.join("docs").join("index.md").is_file());
        assert!(!root.join(".git").exists());
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
