//! Markdown link extraction, classification, and intra-bundle resolution.
//!
//! Implements step 4–5 of `docs/architecture/okf-parsing.md`: parse CommonMark
//! links from a body, split external links from intra-bundle `.md` links,
//! resolve the latter to Concept IDs (bundle-absolute or relative,
//! percent-decoding the path, normalizing `.`/`..`, and stripping a trailing
//! `#anchor`), and route each to resolved `links` or `broken_links` against the
//! known concept set.

use pulldown_cmark::{Event, Options, Parser, Tag};
use std::collections::HashSet;

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

/// Classify every link in `body`. `concept_id` is the source concept's ID (its
/// directory anchors relative links); `ids` is the set of all existing IDs.
///
/// Each set is de-duplicated while preserving first-seen order.
pub fn classify(body: &str, concept_id: &str, ids: &HashSet<String>) -> Classified {
    let mut out = Classified::default();
    let (mut seen_links, mut seen_ext, mut seen_broken) =
        (HashSet::new(), HashSet::new(), HashSet::new());

    let options = Options::ENABLE_FOOTNOTES;
    for event in Parser::new_ext(body, options) {
        let Event::Start(Tag::Link { dest_url, .. }) = event else {
            continue;
        };
        let href = dest_url.as_ref();

        if is_external(href) {
            if seen_ext.insert(href.to_string()) {
                out.external_links.push(href.to_string());
            }
            continue;
        }

        // Only `.md` (optionally with `#anchor`) links are intra-bundle edges.
        let without_anchor = href.split('#').next().unwrap_or(href);
        let decoded = percent_decode(without_anchor);

        // Classify again after decoding so an encoded scheme or bundle-absolute
        // path cannot bypass the same guards applied to an ordinary href.
        if is_external(&decoded) {
            if seen_ext.insert(href.to_string()) {
                out.external_links.push(href.to_string());
            }
            continue;
        }

        if !ends_with_md(&decoded) {
            continue;
        }

        match resolve_decoded(&decoded, concept_id) {
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
    let decoded = percent_decode(href);
    resolve_decoded(&decoded, concept_id)
}

fn resolve_decoded(href: &str, concept_id: &str) -> Option<String> {
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

/// Decode valid `%HH` byte sequences without applying form-encoding rules.
/// Invalid sequences remain literal, and invalid UTF-8 cannot panic the parser.
fn percent_decode(value: &str) -> String {
    let bytes = value.as_bytes();
    let mut decoded = Vec::with_capacity(bytes.len());
    let mut index = 0;

    while index < bytes.len() {
        if bytes[index] == b'%' && index + 2 < bytes.len() {
            if let (Some(high), Some(low)) =
                (hex_value(bytes[index + 1]), hex_value(bytes[index + 2]))
            {
                decoded.push((high << 4) | low);
                index += 3;
                continue;
            }
        }

        decoded.push(bytes[index]);
        index += 1;
    }

    String::from_utf8_lossy(&decoded).into_owned()
}

fn hex_value(byte: u8) -> Option<u8> {
    match byte {
        b'0'..=b'9' => Some(byte - b'0'),
        b'a'..=b'f' => Some(byte - b'a' + 10),
        b'A'..=b'F' => Some(byte - b'A' + 10),
        _ => None,
    }
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
    use serde::Deserialize;

    const LINK_CORPUS: &str = include_str!("../../../src/test/fixtures/markdown-link-corpus.json");

    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct Corpus {
        cases: Vec<CorpusCase>,
    }

    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct CorpusCase {
        name: String,
        markdown: String,
        source_id: String,
        concept_ids: Vec<String>,
        expected_concepts: Vec<String>,
        expected_external: Vec<String>,
    }

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
    fn resolves_percent_encoded_space() {
        let set = ids(&["concepts/My Concept"]);
        let c = classify("[concept](concepts/My%20Concept.md)", "overview", &set);

        assert_eq!(c.links, vec!["concepts/My Concept"]);
        assert!(c.broken_links.is_empty());
    }

    #[test]
    fn resolves_percent_encoded_utf8() {
        assert_eq!(
            resolve("caf%C3%A9.md", "examples/source"),
            Some("examples/café".to_string())
        );
    }

    #[test]
    fn encoded_parent_segments_cannot_escape_bundle() {
        assert_eq!(resolve("%2E%2E/%2E%2E/secret.md", "a"), None);
    }

    #[test]
    fn encoded_external_scheme_remains_external() {
        let c = classify(
            "[external](https%3A//example.com/concept.md)",
            "overview",
            &ids(&[]),
        );

        assert_eq!(c.external_links, vec!["https%3A//example.com/concept.md"]);
        assert!(c.broken_links.is_empty());
    }

    #[test]
    fn malformed_percent_sequence_is_tolerated() {
        let c = classify("[bad](concept%ZZ.md)", "overview", &ids(&[]));

        assert_eq!(c.broken_links, vec!["concept%ZZ.md"]);
    }

    #[test]
    fn commonmark_corpus_matches_expected_edges() {
        let corpus: Corpus = serde_json::from_str(LINK_CORPUS).expect("valid link corpus");

        for case in corpus.cases {
            let known_ids = case.concept_ids.into_iter().collect();
            let classified = classify(&case.markdown, &case.source_id, &known_ids);

            assert_eq!(classified.links, case.expected_concepts, "{}", case.name);
            assert_eq!(
                classified.external_links, case.expected_external,
                "{}",
                case.name
            );
            assert!(classified.broken_links.is_empty(), "{}", case.name);
        }
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
