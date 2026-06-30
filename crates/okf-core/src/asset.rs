//! Reading companion assets from a bundle — the non-`.md` files an ODSF concept
//! points at: `*.example.html` / `*.do.html` / `*.dont.html` previews and the
//! `styles/*.css` they link. Concepts are read by [`crate::parse`]; this is the
//! separate, narrowly-scoped door for the design-system renderer to fetch the
//! text of one declared asset.
//!
//! Safety is the whole point of routing this through the core rather than a raw
//! filesystem command: the requested path is resolved against the bundle root,
//! symlinks and `..` are collapsed by canonicalization, and the result must stay
//! inside the root. Only a small allowlist of text extensions is served. A miss
//! (escapes the root, wrong type, absent, unreadable) is `None`, never an error —
//! the consumer tolerates a missing asset.

use std::path::Path;

/// Extensions an asset may have. Deliberately tiny: ODSF bundles are text-only
/// (`.md`, `.html`, `.css`), and this door never serves `.md` (those are
/// concepts, read elsewhere) — only the renderable companion files.
const ALLOWED_EXTENSIONS: [&str; 3] = ["html", "css", "svg"];

/// Read a bundle asset's text, or `None` if it does not exist, is not a
/// permitted text asset, or resolves outside `root` (path traversal / symlink
/// escape). `rel` is a bundle-relative path; a leading `/` (the bundle-absolute
/// form an ODSF `examples:` entry uses) is treated as relative to the root.
pub fn read_asset(root: &Path, rel: &str) -> Option<String> {
    // Normalize the request to a path under the root. Strip a leading slash so a
    // bundle-absolute "/styles/tokens.css" joins correctly; reject a Windows
    // drive/UNC-looking input outright by never trusting `rel` as absolute.
    let rel = rel.trim().trim_start_matches('/');
    if rel.is_empty() {
        return None;
    }

    let root_canon = root.canonicalize().ok()?;
    // canonicalize() resolves `..` and symlinks and requires the file to exist —
    // a missing asset is a clean `None`.
    let target = root_canon.join(rel).canonicalize().ok()?;

    // The real file must live inside the real bundle root.
    if !target.starts_with(&root_canon) {
        return None;
    }

    // Allowlist the extension (case-insensitive).
    let ext = target.extension()?.to_string_lossy().to_ascii_lowercase();
    if !ALLOWED_EXTENSIONS.contains(&ext.as_str()) {
        return None;
    }

    std::fs::read_to_string(&target).ok()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn tmp() -> std::path::PathBuf {
        let mut dir = std::env::temp_dir();
        // A per-test subdir; std has no random in core, so derive from a counter.
        use std::sync::atomic::{AtomicU32, Ordering};
        static N: AtomicU32 = AtomicU32::new(0);
        dir.push(format!("okf-asset-test-{}", N.fetch_add(1, Ordering::Relaxed)));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(dir.join("styles")).unwrap();
        dir
    }

    #[test]
    fn reads_a_permitted_asset() {
        let root = tmp();
        fs::write(root.join("styles/tokens.css"), ":root{--x:1}").unwrap();
        assert_eq!(
            read_asset(&root, "styles/tokens.css").as_deref(),
            Some(":root{--x:1}")
        );
        // Bundle-absolute form resolves the same way.
        assert_eq!(
            read_asset(&root, "/styles/tokens.css").as_deref(),
            Some(":root{--x:1}")
        );
    }

    #[test]
    fn rejects_disallowed_extension() {
        let root = tmp();
        fs::write(root.join("secret.md"), "frontmatter").unwrap();
        fs::write(root.join("data.json"), "{}").unwrap();
        assert_eq!(read_asset(&root, "secret.md"), None);
        assert_eq!(read_asset(&root, "data.json"), None);
    }

    #[test]
    fn rejects_path_traversal() {
        let root = tmp();
        // A sensitive file beside (outside) the bundle root.
        let outside = root.parent().unwrap().join("okf-asset-outside.css");
        fs::write(&outside, "leak").unwrap();
        assert_eq!(read_asset(&root, "../okf-asset-outside.css"), None);
        let _ = fs::remove_file(outside);
    }

    #[test]
    fn missing_asset_is_none() {
        let root = tmp();
        assert_eq!(read_asset(&root, "components/nope.example.html"), None);
    }
}
