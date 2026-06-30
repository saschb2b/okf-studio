//! OKF parsing — turn a bundle root into the data model.
//!
//! Implements the pipeline from `docs/architecture/okf-parsing.md`: enumerate
//! non-reserved `.md` files as concepts, split a tolerant frontmatter subset
//! from the body, extract and resolve links, then assemble a [`Bundle`] via the
//! graph, index-tree, log, and validation modules. Never panics on bad input.

use crate::frontmatter::{self, ParsedFrontmatter};
use crate::links;
use crate::model::{Bundle, Concept, Confidence};
use crate::{graph, index_tree, logfile, validate};
use std::collections::HashSet;
use std::path::Path;
use walkdir::WalkDir;

/// Reserved filenames that are not concepts (handled by index/log modules).
pub const RESERVED: [&str; 2] = ["index.md", "log.md"];

/// Named directories the walk skips wherever they appear (build artifacts, VCS).
pub const IGNORED_DIRS: [&str; 6] = [".git", "node_modules", "target", "dist", "build", ".venv"];

/// A directory the walk should not descend into: a named ignore, or any hidden
/// directory (leading `.`), except the scanned root itself.
pub fn is_ignored_dir(path: &Path, root: &Path) -> bool {
    if path == root {
        return false;
    }
    let Some(name) = path.file_name().map(|n| n.to_string_lossy()) else {
        return false;
    };
    IGNORED_DIRS.contains(&name.as_ref()) || (name.starts_with('.') && name.len() > 1)
}

/// Parse a detected bundle root into a full [`Bundle`].
pub fn read_bundle(root: &Path) -> Bundle {
    let mut concepts = read_concepts(root);

    // Resolve links now that the full concept-id set is known.
    let ids: HashSet<String> = concepts.iter().map(|c| c.id.clone()).collect();
    for concept in &mut concepts {
        let classified = links::classify(&concept.body, &concept.id, &ids);
        concept.links = classified.links;
        concept.external_links = classified.external_links;
        concept.broken_links = classified.broken_links;
    }

    graph::link_graph(&mut concepts);

    let indexes = index_tree::build(root, &concepts);
    let log = logfile::parse_log(root);
    let issues = validate::validate(root, &concepts);

    let root_fm = read_root_index_frontmatter(root);
    let okf_version = root_fm
        .as_ref()
        .and_then(|fm| fm.scalar("okf_version"))
        .map(str::to_owned);
    // ODSF bundles additionally declare odsf_version in the root index (§10);
    // it is the data's property, surfaced but never required.
    let odsf_version = root_fm
        .as_ref()
        .and_then(|fm| fm.scalar("odsf_version"))
        .map(str::to_owned);
    let name = read_bundle_name(root);
    let confidence = if okf_version.is_some() {
        Confidence::Confident
    } else {
        Confidence::Candidate
    };

    Bundle {
        root: root.display().to_string(),
        name,
        okf_version,
        odsf_version,
        concepts,
        indexes,
        log,
        issues,
        confidence,
    }
}

/// Enumerate every non-reserved `.md` file under `root` as a (link-unresolved)
/// [`Concept`]. Results are sorted by id for stable output.
pub fn read_concepts(root: &Path) -> Vec<Concept> {
    let mut concepts: Vec<Concept> = WalkDir::new(root)
        .follow_links(false)
        .into_iter()
        .filter_entry(|e| !is_ignored_dir(e.path(), root))
        .filter_map(Result::ok)
        .filter(|e| e.file_type().is_file())
        .filter(|e| {
            e.path()
                .extension()
                .map(|x| x.eq_ignore_ascii_case("md"))
                .unwrap_or(false)
        })
        .filter(|e| {
            let name = e.file_name().to_string_lossy().to_ascii_lowercase();
            !RESERVED.contains(&name.as_str())
        })
        .filter_map(|e| concept_from_file(root, e.path()))
        .collect();

    concepts.sort_by(|a, b| a.id.cmp(&b.id));
    concepts
}

/// Build a single concept from a markdown file. Returns `None` only if the file
/// is unreadable; malformed or missing frontmatter still yields a concept (with
/// an empty type), per the tolerant-consumer contract.
fn concept_from_file(root: &Path, path: &Path) -> Option<Concept> {
    let text = std::fs::read_to_string(path).ok()?;
    let id = concept_id(root, path);

    let (fm_src, body) = frontmatter::split(&text);
    let fm = fm_src.map(frontmatter::parse).unwrap_or_default();

    let title = fm
        .scalar("title")
        .map(str::to_owned)
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| humanize(&id));

    Some(Concept {
        id,
        concept_type: fm.scalar("type").unwrap_or_default().to_owned(),
        title,
        description: fm.scalar("description").unwrap_or_default().to_owned(),
        tags: fm.list("tags"),
        timestamp: fm.scalar("timestamp").map(str::to_owned),
        resource: fm.scalar("resource").map(str::to_owned),
        extra: fm.extra,
        body: body.to_owned(),
        links: Vec::new(),
        external_links: Vec::new(),
        broken_links: Vec::new(),
        cited_by: Vec::new(),
        degree: 0,
    })
}

/// Concept ID = path minus `.md`, relative to root, forward slashes.
pub fn concept_id(root: &Path, path: &Path) -> String {
    let rel = path.strip_prefix(root).unwrap_or(path);
    let s = rel.to_string_lossy().replace('\\', "/");
    if s.len() >= 3 && s[s.len() - 3..].eq_ignore_ascii_case(".md") {
        s[..s.len() - 3].to_string()
    } else {
        s
    }
}

/// Humanize an id or filename into a fallback title: take the last path
/// segment, replace `-`/`_` with spaces, and title-case each word.
fn humanize(id: &str) -> String {
    let last = id.rsplit('/').next().unwrap_or(id);
    let cleaned = last.replace(['-', '_'], " ");
    cleaned
        .split_whitespace()
        .map(|w| {
            let mut chars = w.chars();
            match chars.next() {
                Some(first) => first.to_uppercase().collect::<String>() + chars.as_str(),
                None => String::new(),
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

/// Read the root `index.md` frontmatter (may carry `okf_version`).
fn read_root_index_frontmatter(root: &Path) -> Option<ParsedFrontmatter> {
    let text = std::fs::read_to_string(root.join("index.md")).ok()?;
    let (fm_src, _) = frontmatter::split(&text);
    fm_src.map(frontmatter::parse)
}

/// Bundle name: root `index.md` H1, else the directory name.
pub fn read_bundle_name(root: &Path) -> String {
    if let Ok(text) = std::fs::read_to_string(root.join("index.md")) {
        if let Some(h1) = first_h1(&text) {
            return h1;
        }
    }
    root.file_name()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_default()
}

/// First markdown `# H1` heading text in `text`, if any. Skips a frontmatter
/// block so a `#` inside it is not mistaken for a heading.
pub fn first_h1(text: &str) -> Option<String> {
    let (_, body) = frontmatter::split(text);
    for line in body.lines() {
        let trimmed = line.trim_start();
        if let Some(rest) = trimmed.strip_prefix("# ") {
            return Some(rest.trim().to_owned());
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn concept_id_strips_md_and_root() {
        let root = PathBuf::from("/bundle");
        let id = concept_id(&root, &PathBuf::from("/bundle/tables/orders.md"));
        assert_eq!(id, "tables/orders");
    }

    #[test]
    fn humanizes_fallback_title() {
        assert_eq!(humanize("features/graph-view"), "Graph View");
        assert_eq!(humanize("okf_spec_summary"), "Okf Spec Summary");
    }

    #[test]
    fn first_h1_skips_frontmatter() {
        assert_eq!(
            first_h1("---\nokf_version: \"0.1\"\n---\n# Title Here\n"),
            Some("Title Here".to_string())
        );
    }
}
