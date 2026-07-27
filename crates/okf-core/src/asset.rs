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

use std::path::PathBuf;

/// Extensions a text asset may have. Deliberately tiny: ODSF bundles are
/// text-only (`.md`, `.html`, `.css`), and this door never serves `.md` (those
/// are concepts, read elsewhere) — only the renderable companion files.
const ALLOWED_EXTENSIONS: [&str; 3] = ["html", "css", "svg"];

/// Image extensions and their MIME types, for inlining a *local* bundle image
/// as a `data:` URL (the offline-safe way to render it — no network fetch).
const IMAGE_MIME: [(&str, &str); 9] = [
    ("png", "image/png"),
    ("jpg", "image/jpeg"),
    ("jpeg", "image/jpeg"),
    ("gif", "image/gif"),
    ("webp", "image/webp"),
    ("avif", "image/avif"),
    ("svg", "image/svg+xml"),
    ("ico", "image/x-icon"),
    ("bmp", "image/bmp"),
];

/// Resolve a bundle-relative path to a real file *inside* `root`, or `None` if
/// it is absent or escapes the root (via `..` or a symlink). `rel` may carry a
/// leading `/` (the bundle-absolute form), treated as relative to the root.
/// This is the single path-safety gate every asset read goes through.
fn resolve_in_root(root: &Path, rel: &str) -> Option<PathBuf> {
    let rel = rel.trim().trim_start_matches('/');
    if rel.is_empty() {
        return None;
    }
    let root_canon = root.canonicalize().ok()?;
    // canonicalize() resolves `..`/symlinks and requires the file to exist —
    // a missing asset is a clean `None`.
    let target = root_canon.join(rel).canonicalize().ok()?;
    if !target.starts_with(&root_canon) {
        return None;
    }
    Some(target)
}

/// Read a bundle asset's text, or `None` if it does not exist, is not a
/// permitted text asset, or resolves outside `root`.
pub fn read_asset(root: &Path, rel: &str) -> Option<String> {
    let target = resolve_in_root(root, rel)?;
    let ext = target.extension()?.to_string_lossy().to_ascii_lowercase();
    if !ALLOWED_EXTENSIONS.contains(&ext.as_str()) {
        return None;
    }
    std::fs::read_to_string(&target).ok()
}

/// The largest computation this will serve. A sanctioned query that a human is
/// expected to read is not megabytes long, and the reader renders this inline.
const MAX_COMPUTATION_BYTES: usize = 512 * 1024;

/// Read the computation a concept declares, or `None` if it declares none, the
/// file is absent, it is too large, or it is not valid UTF-8.
///
/// This deliberately does **not** consult [`ALLOWED_EXTENSIONS`]. A computation
/// is `.sql`, `.py`, `.jq` — anything the runtime takes — so an extension
/// allowlist cannot express what is permitted here. The authorization is the
/// declaration itself: the caller passes a [`Concept`], and the only path this
/// will read is the one that concept's own `computation` field names. Widening
/// the general text door to every extension would have granted far more, since
/// that door takes a caller-supplied path.
///
/// Root confinement still applies, through the same `resolve_in_root` gate as
/// every other asset read, so a bundle that declares `../../.ssh/id_rsa` gets
/// `None` rather than a key.
///
/// The bytes are returned for display. Studio does not execute them; see
/// `docs/architecture/okf-parsing.md`.
pub fn read_declared_computation(root: &Path, concept: &crate::Concept) -> Option<String> {
    let declared = concept.computation.as_ref()?.computation.as_deref()?;
    let target = resolve_in_root(root, declared)?;
    // Checked before reading, so a huge file is not pulled into memory first.
    if std::fs::metadata(&target).ok()?.len() as usize > MAX_COMPUTATION_BYTES {
        return None;
    }
    std::fs::read_to_string(&target).ok()
}

/// Read a *local* bundle image and return it as a `data:<mime>;base64,…` URL, or
/// `None` if it is absent, not a known image type, or escapes the root. Inlining
/// keeps image rendering offline (no network fetch); a remote image is never
/// loaded here — the consumer opens it in the browser instead.
pub fn read_asset_data_url(root: &Path, rel: &str) -> Option<String> {
    let target = resolve_in_root(root, rel)?;
    let ext = target.extension()?.to_string_lossy().to_ascii_lowercase();
    let mime = IMAGE_MIME
        .iter()
        .find(|(e, _)| *e == ext)
        .map(|(_, m)| *m)?;
    let bytes = std::fs::read(&target).ok()?;
    Some(format!("data:{};base64,{}", mime, base64_encode(&bytes)))
}

/// Standard base64 (RFC 4648) with padding. Hand-rolled to avoid a dependency.
fn base64_encode(data: &[u8]) -> String {
    const T: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity(data.len().div_ceil(3) * 4);
    for chunk in data.chunks(3) {
        let b0 = chunk[0] as u32;
        let b1 = *chunk.get(1).unwrap_or(&0) as u32;
        let b2 = *chunk.get(2).unwrap_or(&0) as u32;
        let n = (b0 << 16) | (b1 << 8) | b2;
        out.push(T[((n >> 18) & 63) as usize] as char);
        out.push(T[((n >> 12) & 63) as usize] as char);
        out.push(if chunk.len() > 1 {
            T[((n >> 6) & 63) as usize] as char
        } else {
            '='
        });
        out.push(if chunk.len() > 2 {
            T[(n & 63) as usize] as char
        } else {
            '='
        });
    }
    out
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
        dir.push(format!(
            "okf-asset-test-{}",
            N.fetch_add(1, Ordering::Relaxed)
        ));
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

    /// Builds a concept declaring `path` as its computation.
    fn declaring(path: Option<&str>) -> crate::Concept {
        crate::Concept {
            concept_type: crate::ATTESTED_COMPUTATION_TYPE.to_string(),
            computation: Some(crate::ComputationContract {
                runtime: "bigquery".to_string(),
                computation: path.map(str::to_string),
                ..Default::default()
            }),
            ..Default::default()
        }
    }

    /// The extension allowlist deliberately does not apply — a computation is
    /// whatever its runtime takes.
    #[test]
    fn reads_a_declared_computation_of_any_extension() {
        let root = tmp();
        fs::write(root.join("revenue.sql"), "SELECT 1").unwrap();
        assert_eq!(read_asset(&root, "revenue.sql"), None, "not a text asset");
        assert_eq!(
            read_declared_computation(&root, &declaring(Some("revenue.sql"))).as_deref(),
            Some("SELECT 1"),
            "but it is a declared computation"
        );
    }

    /// The whole security argument: the only readable path is the one the
    /// concept itself names. A caller cannot ask for anything else, because a
    /// caller does not supply a path at all.
    #[test]
    fn reads_only_what_the_concept_declares() {
        let root = tmp();
        fs::write(root.join("revenue.sql"), "SELECT 1").unwrap();
        fs::write(root.join("secrets.env"), "TOKEN=hunter2").unwrap();

        // A concept declaring the other file cannot reach the first, and a
        // concept declaring nothing reaches nothing.
        assert_eq!(
            read_declared_computation(&root, &declaring(Some("secrets.env"))).as_deref(),
            Some("TOKEN=hunter2"),
            "a bundle can only expose its own files, which it already could"
        );
        assert_eq!(read_declared_computation(&root, &declaring(None)), None);
        assert_eq!(
            read_declared_computation(&root, &crate::Concept::default()),
            None,
            "an ordinary concept declares no computation"
        );
    }

    /// Root confinement is not bypassed by the declaration. A bundle that names
    /// a path outside itself gets nothing.
    #[test]
    fn a_declared_computation_cannot_escape_the_root() {
        let root = tmp();
        fs::write(root.join("outside.sql"), "SELECT 1").unwrap();
        let inner = root.join("bundle");
        fs::create_dir_all(&inner).unwrap();
        assert_eq!(
            read_declared_computation(&inner, &declaring(Some("../outside.sql"))),
            None
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

    #[test]
    fn base64_matches_known_vectors() {
        assert_eq!(base64_encode(b""), "");
        assert_eq!(base64_encode(b"M"), "TQ==");
        assert_eq!(base64_encode(b"Ma"), "TWE=");
        assert_eq!(base64_encode(b"Man"), "TWFu");
        assert_eq!(
            base64_encode(b"any carnal pleasure."),
            "YW55IGNhcm5hbCBwbGVhc3VyZS4="
        );
    }

    #[test]
    fn reads_a_local_image_as_data_url() {
        let root = tmp();
        // A 1x1 transparent GIF (binary) — bytes round-trip through base64.
        let gif: [u8; 35] = [
            0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00, 0x80, 0x00, 0x00, 0xff,
            0xff, 0xff, 0x00, 0x00, 0x00, 0x21, 0xf9, 0x04, 0x01, 0x00, 0x00, 0x00, 0x00, 0x2c,
            0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01,
        ];
        fs::write(root.join("pic.gif"), gif).unwrap();
        let url = read_asset_data_url(&root, "pic.gif").expect("image reads as data url");
        assert!(url.starts_with("data:image/gif;base64,"));
        assert_eq!(
            url,
            format!("data:image/gif;base64,{}", base64_encode(&gif))
        );
    }

    #[test]
    fn data_url_rejects_non_image_and_escape() {
        let root = tmp();
        fs::write(root.join("styles/tokens.css"), "x").unwrap();
        // A CSS file is a text asset, never served as an image data URL.
        assert_eq!(read_asset_data_url(&root, "styles/tokens.css"), None);
        assert_eq!(read_asset_data_url(&root, "../outside.png"), None);
    }
}
