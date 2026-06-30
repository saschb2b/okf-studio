//! Markdown link extraction, classification, and intra-bundle resolution.
//!
//! Implements step 4–5 of `docs/architecture/okf-parsing.md`: pull `[text](href)`
//! links out of a body, split external (`http(s)`/`mailto`) from intra-bundle
//! `.md` links, resolve the latter to Concept IDs (bundle-absolute or relative,
//! normalizing `.`/`..` and stripping a trailing `#anchor`), and route each to
//! resolved `links` or `broken_links` against the known concept set.

use regex::Regex;
use std::collections::HashSet;
use std::sync::OnceLock;

/// The classified link sets for one concept body.
#[derive(Debug, Default)]
pub struct Classified {
    /// Resolved intra-bundle target Concept IDs (existing targets only).
    pub links: Vec<String>,
    /// http(s)/mailto outbound web links.
    pub external_links: Vec<String>,
    /// Intra-bundle `.md` hrefs that resolve to no existing concept.
    pub broken_links: Vec<String>,
}

/// `[text](href)` — captures the href, allowing an optional title we ignore.
fn link_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"\[[^\]]*\]\(([^)\s]+)(?:\s+[^)]*)?\)").unwrap())
}

/// Classify every link in `body`. `concept_id` is the source concept's ID (its
/// directory anchors relative links); `ids` is the set of all existing IDs.
///
/// Each set is de-duplicated while preserving first-seen order.
pub fn classify(body: &str, concept_id: &str, ids: &HashSet<String>) -> Classified {
    let mut out = Classified::default();
    let (mut seen_links, mut seen_ext, mut seen_broken) =
        (HashSet::new(), HashSet::new(), HashSet::new());

    for cap in link_re().captures_iter(body) {
        let href = &cap[1];

        if is_external(href) {
            if seen_ext.insert(href.to_string()) {
                out.external_links.push(href.to_string());
            }
            continue;
        }

        // Only `.md` (optionally with `#anchor`) links are intra-bundle edges.
        let without_anchor = href.split('#').next().unwrap_or(href);
        if !ends_with_md(without_anchor) {
            continue;
        }

        match resolve(without_anchor, concept_id) {
            Some(target) if ids.contains(&target) => {
                if seen_links.insert(target.clone()) {
                    out.links.push(target);
                }
            }
            _ => {
                if seen_broken.insert(href.to_string()) {
                    out.broken_links.push(href.to_string());
                }
            }
        }
    }

    out
}

/// True for `http://`, `https://`, `mailto:`, or any other `scheme:` URL.
pub fn is_external(href: &str) -> bool {
    // A URL scheme: a leading run of ascii letters followed by ':'.
    if let Some(colon) = href.find(':') {
        let scheme = &href[..colon];
        if !scheme.is_empty() && scheme.chars().all(|c| c.is_ascii_alphabetic()) {
            return true;
        }
    }
    false
}

fn ends_with_md(href: &str) -> bool {
    let lower = href.to_ascii_lowercase();
    lower.ends_with(".md")
}

/// Resolve an intra-bundle `.md` href (anchor already stripped) to a Concept ID,
/// or `None` if it escapes the bundle root. Bundle-absolute hrefs (`/a/b.md`)
/// are taken from the root; relative hrefs from the source concept's directory.
pub fn resolve(href: &str, concept_id: &str) -> Option<String> {
    let mut segments: Vec<&str> = Vec::new();

    if let Some(abs) = href.strip_prefix('/') {
        // Bundle-absolute: relative to the root, ignore the source directory.
        push_normalized(&mut segments, abs)?;
    } else {
        // Relative: start from the source concept's directory.
        let dir = concept_id.rsplit_once('/').map(|(d, _)| d).unwrap_or("");
        if !dir.is_empty() {
            for seg in dir.split('/') {
                segments.push(seg);
            }
        }
        push_normalized(&mut segments, href)?;
    }

    let joined = segments.join("/");
    Some(drop_md(&joined))
}

/// Apply each path segment of `path` onto `segments`, normalizing `.` and `..`.
/// Returns `None` if a `..` would escape above the bundle root.
fn push_normalized<'a>(segments: &mut Vec<&'a str>, path: &'a str) -> Option<()> {
    for seg in path.split('/') {
        match seg {
            "" | "." => {}
            ".." => {
                segments.pop()?; // a `..` past the root escapes the bundle
            }
            other => segments.push(other),
        }
    }
    Some(())
}

/// Drop a trailing `.md`/`.MD` extension, yielding the Concept ID.
fn drop_md(path: &str) -> String {
    if path.len() >= 3 && path[path.len() - 3..].eq_ignore_ascii_case(".md") {
        path[..path.len() - 3].to_string()
    } else {
        path.to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ids(items: &[&str]) -> HashSet<String> {
        items.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn classifies_external() {
        let c = classify("[x](https://a.com) [m](mailto:a@b.c)", "a", &ids(&[]));
        assert_eq!(c.external_links, vec!["https://a.com", "mailto:a@b.c"]);
        assert!(c.links.is_empty());
        assert!(c.broken_links.is_empty());
    }

    #[test]
    fn resolves_relative_sibling() {
        // From product/overview, "../features/graph-view.md" -> features/graph-view
        assert_eq!(
            resolve("../features/graph-view.md", "product/overview"),
            Some("features/graph-view".to_string())
        );
    }

    #[test]
    fn resolves_bundle_absolute() {
        assert_eq!(
            resolve("/tables/orders.md", "anything/here"),
            Some("tables/orders".to_string())
        );
    }

    #[test]
    fn resolves_same_dir_relative() {
        assert_eq!(
            resolve("data-model.md", "architecture/okf-parsing"),
            Some("architecture/data-model".to_string())
        );
    }

    #[test]
    fn dotdot_escaping_root_is_none() {
        assert_eq!(resolve("../../x.md", "a"), None);
    }

    #[test]
    fn existing_vs_broken() {
        let set = ids(&["features/graph-view"]);
        let c = classify(
            "[ok](../features/graph-view.md) [bad](../features/nope.md)",
            "product/overview",
            &set,
        );
        assert_eq!(c.links, vec!["features/graph-view"]);
        assert_eq!(c.broken_links, vec!["../features/nope.md"]);
    }

    #[test]
    fn strips_anchor() {
        let set = ids(&["a/b"]);
        let c = classify("[x](/a/b.md#section)", "z", &set);
        assert_eq!(c.links, vec!["a/b"]);
    }

    #[test]
    fn dedupes() {
        let set = ids(&["a/b"]);
        let c = classify("[x](/a/b.md) [y](/a/b.md)", "z", &set);
        assert_eq!(c.links, vec!["a/b"]);
    }
}
