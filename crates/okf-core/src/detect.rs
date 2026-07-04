//! Bundle detection — walk a folder and decide which directories are bundle roots.
//!
//! Implements `docs/architecture/bundle-detection.md`:
//!   - A directory whose `index.md` frontmatter declares `okf_version` is a
//!     CONFIDENT root.
//!   - Otherwise a directory that (recursively) contains ≥1 concept with a
//!     non-empty `type` is a CANDIDATE root. A typed concept belongs to the
//!     nearest enclosing directory that has its own `index.md` (the top of a
//!     contiguous `index.md` chain) — so a plain *container* folder that merely
//!     holds several `index.md`-bearing bundle directories yields one candidate
//!     PER bundle, not a single merged root. Loose concepts with no `index.md`
//!     anywhere fall back to the scanned folder as one candidate.
//!   - Overlaps resolve outermost-wins: a confident root absorbs nested
//!     candidates/indexes; the outermost qualifying root is kept and the list
//!     is de-duplicated.
//!
//! The walk is depth-bounded, skips ignored/hidden directories, and is
//! cycle-safe on symlinks (it does not follow them).

use crate::frontmatter;
use crate::model::{BundleRoot, Confidence};
use crate::parse;
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use walkdir::WalkDir;

/// Scan `folder` for OKF bundle roots, descending at most `max_depth` levels
/// (clamped to a sane range).
pub fn scan(folder: &Path, max_depth: usize) -> Vec<BundleRoot> {
    // Per-directory facts: whether its index.md declares okf_version.
    let mut confident_dirs: Vec<PathBuf> = Vec::new();
    // Concepts grouped by their nearest scanned ancestor are computed lazily;
    // here we just record which directories directly contain a typed concept.
    let mut typed_concept_dirs: Vec<PathBuf> = Vec::new();

    for entry in WalkDir::new(folder)
        .max_depth(max_depth.clamp(1, 64))
        .follow_links(false) // cycle-safe: never follow symlinks
        .into_iter()
        .filter_entry(|e| !parse::is_ignored_dir(e.path(), folder))
        .filter_map(Result::ok)
    {
        if entry.file_type().is_dir() {
            if dir_index_has_okf_version(entry.path()) {
                confident_dirs.push(entry.path().to_path_buf());
            }
        } else if entry.file_type().is_file() && is_typed_concept(folder, entry.path()) {
            if let Some(parent) = entry.path().parent() {
                typed_concept_dirs.push(parent.to_path_buf());
            }
        }
    }

    // Keep only the OUTERMOST confident roots (a confident root absorbs any
    // confident or candidate dir nested beneath it).
    let mut kept: Vec<(PathBuf, Confidence)> = Vec::new();
    for dir in &confident_dirs {
        if confident_dirs
            .iter()
            .any(|c| c != dir && is_ancestor_or_self(c, dir))
        {
            continue; // nested inside another confident root
        }
        kept.push((dir.clone(), Confidence::Confident));
    }

    // Candidate roots survive only where they neither sit inside a confident
    // root nor contain one: a candidate that wraps a confident root is just a
    // container folder, and the confident inner root is the real bundle.
    for dir in candidate_roots(folder, &typed_concept_dirs) {
        let inside_confident = confident_dirs.iter().any(|c| is_ancestor_or_self(c, &dir));
        let wraps_confident = confident_dirs.iter().any(|c| is_ancestor_or_self(&dir, c));
        if inside_confident || wraps_confident {
            continue;
        }
        kept.push((dir, Confidence::Candidate));
    }

    // Final outermost-wins de-dup across whatever survived (e.g. nested
    // candidate trees), preferring the outermost path.
    kept.sort_by_key(|p| p.0.components().count());
    let mut roots: Vec<(PathBuf, Confidence)> = Vec::new();
    for (path, conf) in kept {
        if roots.iter().any(|(k, _)| k == &path) {
            continue; // exact dupe
        }
        if roots
            .iter()
            .any(|(k, _)| k != &path && is_ancestor_or_self(k, &path))
        {
            continue; // absorbed by an outer root already kept
        }
        roots.push((path, conf));
    }

    roots
        .into_iter()
        .map(|(path, conf)| build_root(folder, &path, conf))
        .collect()
}

/// The candidate bundle roots implied by the typed-concept directories: each
/// concept maps to its enclosing bundle root (see `bundle_root_for`), and the
/// distinct roots are returned. This splits a container of several
/// `index.md`-bearing bundles into one candidate each, instead of merging them.
fn candidate_roots(folder: &Path, typed_concept_dirs: &[PathBuf]) -> Vec<PathBuf> {
    let mut roots: Vec<PathBuf> = typed_concept_dirs
        .iter()
        .map(|dir| bundle_root_for(dir, folder))
        .collect();
    roots.sort();
    roots.dedup();
    roots
}

/// The bundle root that owns a typed concept living in `concept_dir`: the
/// nearest ancestor (inclusive, within `folder`) that has its own `index.md`
/// and whose parent does NOT — i.e. the top of a contiguous `index.md` chain, a
/// bundle boundary. When no ancestor carries an `index.md`, the concept is a
/// loose file and its root is the scanned `folder` itself.
fn bundle_root_for(concept_dir: &Path, folder: &Path) -> PathBuf {
    let mut cur = concept_dir;
    loop {
        if has_index_md(cur) {
            // A boundary is a directory whose parent (within the scanned folder)
            // has no index.md — nothing above it in the same chain to absorb it.
            let parent_has_index = cur != folder
                && cur
                    .parent()
                    .filter(|p| p.starts_with(folder))
                    .is_some_and(has_index_md);
            if !parent_has_index {
                return cur.to_path_buf();
            }
        }
        if cur == folder {
            break;
        }
        match cur.parent() {
            Some(p) if p.starts_with(folder) => cur = p,
            _ => break,
        }
    }
    folder.to_path_buf()
}

/// True if `dir` has its own `index.md` file (a bundle-root marker).
fn has_index_md(dir: &Path) -> bool {
    dir.join("index.md").is_file()
}

/// True if `index.md` in `dir` has frontmatter declaring a non-empty `okf_version`.
fn dir_index_has_okf_version(dir: &Path) -> bool {
    let Ok(text) = std::fs::read_to_string(dir.join("index.md")) else {
        return false;
    };
    let (fm_src, _) = frontmatter::split(&text);
    fm_src
        .map(frontmatter::parse)
        .and_then(|fm| fm.scalar("okf_version").map(|v| !v.is_empty()))
        .unwrap_or(false)
}

/// True if `path` is a non-reserved `.md` concept with a non-empty `type`.
fn is_typed_concept(_folder: &Path, path: &Path) -> bool {
    let name = path.file_name().map(|n| n.to_string_lossy().to_ascii_lowercase());
    let is_md = path
        .extension()
        .map(|x| x.eq_ignore_ascii_case("md"))
        .unwrap_or(false);
    if !is_md {
        return false;
    }
    if let Some(n) = &name {
        if parse::RESERVED.contains(&n.as_str()) {
            return false;
        }
    }
    let Ok(text) = std::fs::read_to_string(path) else {
        return false;
    };
    let (fm_src, _) = frontmatter::split(&text);
    fm_src
        .map(frontmatter::parse)
        .and_then(|fm| fm.scalar("type").map(|t| !t.is_empty()))
        .unwrap_or(false)
}

/// Assemble a [`BundleRoot`] descriptor for a detected root directory.
fn build_root(folder: &Path, root: &Path, confidence: Confidence) -> BundleRoot {
    // Count concepts and collect distinct types via the parse enumerator.
    let concepts = parse::read_concepts(root);
    let concept_count = concepts.len() as u32;
    let mut types: BTreeMap<String, ()> = BTreeMap::new();
    for c in &concepts {
        if !c.concept_type.is_empty() {
            types.insert(c.concept_type.clone(), ());
        }
    }
    let types: Vec<String> = types.into_keys().collect();

    let okf_version = read_okf_version(root);
    let name = parse::read_bundle_name(root);
    let rel_path = rel_path(folder, root);

    BundleRoot {
        root: root.display().to_string(),
        name,
        rel_path,
        okf_version,
        confidence,
        concept_count,
        types,
    }
}

/// The `okf_version` declared in a directory's `index.md`, if any.
fn read_okf_version(root: &Path) -> Option<String> {
    let text = std::fs::read_to_string(root.join("index.md")).ok()?;
    let (fm_src, _) = frontmatter::split(&text);
    fm_src
        .map(frontmatter::parse)?
        .scalar("okf_version")
        .map(str::to_owned)
}

/// Path of `root` relative to the scanned `folder` ("." when they are equal).
fn rel_path(folder: &Path, root: &Path) -> String {
    match root.strip_prefix(folder) {
        Ok(p) => {
            let s = p.to_string_lossy().replace('\\', "/");
            if s.is_empty() {
                ".".to_string()
            } else {
                s
            }
        }
        Err(_) => root.display().to_string(),
    }
}

/// True if `ancestor` is `descendant` or a prefix directory of it.
fn is_ancestor_or_self(ancestor: &Path, descendant: &Path) -> bool {
    descendant.starts_with(ancestor)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ancestor_check() {
        assert!(is_ancestor_or_self(
            Path::new("/a/b"),
            Path::new("/a/b/c")
        ));
        assert!(is_ancestor_or_self(Path::new("/a/b"), Path::new("/a/b")));
        assert!(!is_ancestor_or_self(
            Path::new("/a/b"),
            Path::new("/a/x")
        ));
    }

    #[test]
    fn ignores_build_and_hidden_dirs() {
        let folder = Path::new("/root");
        assert!(parse::is_ignored_dir(Path::new("/root/node_modules"), folder));
        assert!(parse::is_ignored_dir(Path::new("/root/.git"), folder));
        assert!(!parse::is_ignored_dir(Path::new("/root/features"), folder));
        assert!(!parse::is_ignored_dir(folder, folder)); // never ignore the root itself
    }
}
