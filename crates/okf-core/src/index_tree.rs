//! `index.md` parsing and synthesis for progressive-disclosure navigation.
//!
//! For every directory in the bundle we emit one [`IndexNode`]. If the directory
//! has an `index.md`, parse it into a title (`# H1`) and headed sections of
//! `* [Title](href) - description` bullets; otherwise synthesize a listing of
//! that directory's own concepts (marked `synthesized: true`).
//!
//! Entry resolution reuses the link rules: a concept entry's `target` is the
//! resolved Concept ID; a directory entry (href ending in `/`) targets the
//! subdirectory path. The root `index.md` may carry frontmatter (`okf_version`),
//! which is split off before parsing.

use crate::frontmatter;
use crate::links;
use crate::model::{Concept, EntryKind, IndexEntry, IndexNode, IndexSection};
use regex::Regex;
use std::collections::{BTreeSet, HashSet};
use std::path::Path;
use std::sync::OnceLock;
use walkdir::WalkDir;

/// Build the index-tree for a bundle, one node per directory, sorted by `dir`.
pub fn build(root: &Path, concepts: &[Concept]) -> Vec<IndexNode> {
    let ids: HashSet<String> = concepts.iter().map(|c| c.id.clone()).collect();

    // Every directory under the root (including the root itself, dir = "").
    let mut dirs: BTreeSet<String> = BTreeSet::new();
    dirs.insert(String::new());
    for entry in WalkDir::new(root)
        .follow_links(false)
        .into_iter()
        .filter_entry(|e| !crate::parse::is_ignored_dir(e.path(), root))
        .filter_map(Result::ok)
        .filter(|e| e.file_type().is_dir())
    {
        dirs.insert(rel_dir(root, entry.path()));
    }

    dirs.into_iter()
        .map(|dir| node_for_dir(root, &dir, concepts, &ids))
        .collect()
}

/// Build the [`IndexNode`] for one directory: parse its `index.md` or synthesize.
fn node_for_dir(root: &Path, dir: &str, concepts: &[Concept], ids: &HashSet<String>) -> IndexNode {
    let index_path = if dir.is_empty() {
        root.join("index.md")
    } else {
        root.join(dir).join("index.md")
    };

    if let Ok(text) = std::fs::read_to_string(&index_path) {
        parse_index(dir, &text, ids)
    } else {
        synthesize(dir, concepts)
    }
}

/// Parse an `index.md` body into a node. Frontmatter (root only) is split off.
fn parse_index(dir: &str, text: &str, ids: &HashSet<String>) -> IndexNode {
    let (_, body) = frontmatter::split(text);

    let title = first_h1(body).unwrap_or_else(|| dir_title(dir));

    let mut sections: Vec<IndexSection> = Vec::new();
    let mut current: Option<IndexSection> = None;
    // The implicit "lead" section for bullets before any `# Heading`.
    let mut had_heading = false;

    for raw in body.lines() {
        let line = raw.trim_end_matches('\r');
        let trimmed = line.trim_start();

        if let Some(heading) = trimmed.strip_prefix("# ") {
            had_heading = true;
            if let Some(prev) = current.take() {
                if !prev.entries.is_empty() {
                    sections.push(prev);
                }
            }
            current = Some(IndexSection {
                heading: heading.trim().to_string(),
                entries: Vec::new(),
            });
            continue;
        }

        if let Some(entry) = parse_bullet(trimmed, dir, ids) {
            // Bullets before any heading form an unnamed lead section.
            if current.is_none() && !had_heading {
                current = Some(IndexSection {
                    heading: String::new(),
                    entries: Vec::new(),
                });
            }
            if let Some(section) = current.as_mut() {
                section.entries.push(entry);
            }
        }
    }

    if let Some(last) = current.take() {
        if !last.entries.is_empty() {
            sections.push(last);
        }
    }

    IndexNode {
        dir: dir.to_string(),
        title,
        synthesized: false,
        sections,
    }
}

/// `* [Title](href) - description` / `- [Title](href)`, description optional.
fn bullet_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(r"^[*\-]\s+\[([^\]]*)\]\(([^)\s]+)\)(?:\s*[-–—]\s*(.*))?$").unwrap()
    })
}

/// Parse one bullet line into an [`IndexEntry`], or `None` if it is not a
/// link bullet. `dir` anchors relative hrefs for concept resolution.
fn parse_bullet(line: &str, dir: &str, ids: &HashSet<String>) -> Option<IndexEntry> {
    let caps = bullet_re().captures(line)?;
    let title = caps.get(1).map(|m| m.as_str().trim().to_string()).unwrap_or_default();
    let href = caps.get(2)?.as_str();
    let description = caps
        .get(3)
        .map(|m| m.as_str().trim().to_string())
        .unwrap_or_default();

    // Skip external links — index entries point inside the bundle.
    if links::is_external(href) {
        return None;
    }

    if let Some(subdir) = href.strip_suffix('/') {
        // Directory entry: target is the subdirectory path relative to root.
        let target = join_dir(dir, subdir);
        Some(IndexEntry {
            title,
            target,
            description,
            kind: EntryKind::Directory,
        })
    } else {
        // Concept entry: resolve the href to a Concept ID. Use a synthetic
        // source id in this directory so relative resolution is anchored here.
        let anchor = if dir.is_empty() {
            "index".to_string()
        } else {
            format!("{dir}/index")
        };
        let without_anchor = href.split('#').next().unwrap_or(href);
        let target =
            links::resolve(without_anchor, &anchor).unwrap_or_else(|| without_anchor.to_string());
        // Keep the entry even if the target does not resolve to a known concept;
        // navigation renders it and validation reports broken links separately.
        let _ = ids; // resolution does not require existence for index display
        Some(IndexEntry {
            title,
            target,
            description,
            kind: EntryKind::Concept,
        })
    }
}

/// Synthesize a node listing a directory's own (immediate) concepts.
fn synthesize(dir: &str, concepts: &[Concept]) -> IndexNode {
    let mut entries: Vec<IndexEntry> = concepts
        .iter()
        .filter(|c| is_immediate_child(dir, &c.id))
        .map(|c| IndexEntry {
            title: c.title.clone(),
            target: c.id.clone(),
            description: c.description.clone(),
            kind: EntryKind::Concept,
        })
        .collect();
    entries.sort_by(|a, b| a.title.cmp(&b.title));

    let sections = if entries.is_empty() {
        Vec::new()
    } else {
        vec![IndexSection {
            heading: String::new(),
            entries,
        }]
    };

    IndexNode {
        dir: dir.to_string(),
        title: dir_title(dir),
        synthesized: true,
        sections,
    }
}

/// True if concept `id` lives directly in directory `dir` (no deeper nesting).
fn is_immediate_child(dir: &str, id: &str) -> bool {
    match id.rsplit_once('/') {
        Some((parent, _)) => parent == dir,
        None => dir.is_empty(),
    }
}

/// Directory path relative to root, forward-slashed; "" for the root itself.
fn rel_dir(root: &Path, path: &Path) -> String {
    let rel = path.strip_prefix(root).unwrap_or(path);
    rel.to_string_lossy().replace('\\', "/")
}

/// Join a base directory with a sub-path, dropping empty segments.
fn join_dir(dir: &str, sub: &str) -> String {
    let sub = sub.trim_matches('/');
    if dir.is_empty() {
        sub.to_string()
    } else if sub.is_empty() {
        dir.to_string()
    } else {
        format!("{dir}/{sub}")
    }
}

/// A human title for a directory ("" → "Bundle Root").
fn dir_title(dir: &str) -> String {
    if dir.is_empty() {
        "Bundle Root".to_string()
    } else {
        dir.rsplit('/').next().unwrap_or(dir).to_string()
    }
}

/// First `# H1` heading in `text`.
fn first_h1(text: &str) -> Option<String> {
    for line in text.lines() {
        let trimmed = line.trim_start();
        if let Some(rest) = trimmed.strip_prefix("# ") {
            return Some(rest.trim().to_string());
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ids(items: &[&str]) -> HashSet<String> {
        items.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn parses_sections_and_entries() {
        let text = "# Architecture\n\nIntro prose.\n\n* [Tech Stack](tech-stack.md) - Tauri and why.\n* [Data Model](data-model.md)\n";
        let node = parse_index("architecture", text, &ids(&[]));
        assert_eq!(node.title, "Architecture");
        assert!(!node.synthesized);
        // One lead section with two entries.
        let all: Vec<_> = node.sections.iter().flat_map(|s| &s.entries).collect();
        assert_eq!(all.len(), 2);
        assert_eq!(all[0].title, "Tech Stack");
        assert_eq!(all[0].target, "architecture/tech-stack");
        assert_eq!(all[0].description, "Tauri and why.");
        assert_eq!(all[1].description, ""); // missing description tolerated
    }

    #[test]
    fn directory_entry_detected() {
        let text = "# Top\n* [Features](features/) - the features.\n";
        let node = parse_index("", text, &ids(&[]));
        let e = &node.sections[0].entries[0];
        assert_eq!(e.kind, EntryKind::Directory);
        assert_eq!(e.target, "features");
    }

    #[test]
    fn dash_bullets_and_anchor() {
        let text = "- [X](/a/b.md#sec) - note\n";
        let node = parse_index("z", text, &ids(&[]));
        let e = &node.sections[0].entries[0];
        assert_eq!(e.target, "a/b");
        assert_eq!(e.description, "note");
    }
}
