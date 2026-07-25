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

    let dest = cache_dir(app, &source)?;
    // Fresh fetch: clear any prior contents so a stale copy can't linger.
    if dest.exists() {
        fs::remove_dir_all(&dest).map_err(|e| format!("Couldn't clear the cache: {e}"))?;
    }
    fs::create_dir_all(&dest).map_err(|e| format!("Couldn't create the cache: {e}"))?;

    let bytes = download(&url)?;
    match archive {
        Archive::TarGz => extract_tar(&mut flate2::read::GzDecoder::new(&bytes[..]), &dest)?,
        Archive::Tar => extract_tar(&mut &bytes[..], &dest)?,
        Archive::Zip => extract_zip(&bytes, &dest)?,
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

/// Download `url` into memory, enforcing https, timeouts, and the size cap.
fn download(url: &str) -> Result<Vec<u8>, String> {
    if !url.to_lowercase().starts_with("https://") {
        return Err("Only https:// URLs are fetched.".to_string());
    }
    let agent = ureq::AgentBuilder::new()
        .timeout_connect(CONNECT_TIMEOUT)
        .timeout_read(READ_TIMEOUT)
        .user_agent(USER_AGENT)
        .build();

    let resp = match agent.get(url).call() {
        Ok(resp) => resp,
        Err(ureq::Error::Status(404, _)) => {
            return Err("Not found (404) — check the URL, or the repo may be private.".to_string());
        }
        Err(ureq::Error::Status(code, _)) => {
            return Err(format!("The server returned HTTP {code}."));
        }
        Err(ureq::Error::Transport(t)) => {
            return Err(format!("Couldn't reach the server: {t}."));
        }
    };

    // Read at most MAX_BYTES + 1 so we can detect an over-cap body.
    let mut buf = Vec::new();
    resp.into_reader()
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
        let bytes = download(&url).expect("download the repo tarball");
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
