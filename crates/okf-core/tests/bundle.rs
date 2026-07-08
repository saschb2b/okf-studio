//! Integration tests against the real OKF bundle shipped at the repo's `docs/`
//! directory, plus tolerance tests on synthetic bundles in a tempdir.
//!
//! These exercise the public surface (`scan_bundles`, `read_bundle`) end to end
//! and assert the tolerant-consumer guarantees: malformed input becomes an
//! issue, never a panic.

use okf_core::model::{Confidence, EntryKind, IssueLevel};
use okf_core::{read_bundle, scan_bundles};
use std::fs;
use std::path::{Path, PathBuf};

/// Absolute path to the real `docs/` bundle (repo root / docs).
fn docs_dir() -> PathBuf {
    Path::new(concat!(env!("CARGO_MANIFEST_DIR"), "/../../docs"))
        .canonicalize()
        .expect("docs/ bundle should exist")
}

#[test]
fn scan_detects_docs_as_confident_root() {
    let docs = docs_dir();
    // Scan the parent so detection has to pick docs/ out as the root.
    let parent = docs.parent().expect("docs has a parent");
    let roots = scan_bundles(parent);

    let docs_root = roots
        .iter()
        .find(|r| Path::new(&r.root) == docs.as_path())
        .expect("docs/ should be detected as a bundle root");

    assert_eq!(docs_root.confidence, Confidence::Confident);
    assert_eq!(docs_root.okf_version.as_deref(), Some("0.1"));
    assert_eq!(docs_root.concept_count, 43, "docs/ has 43 concepts");
    assert!(
        !docs_root.types.is_empty(),
        "distinct concept types should be collected"
    );
    // Types must be sorted + distinct.
    let mut sorted = docs_root.types.clone();
    sorted.sort();
    assert_eq!(docs_root.types, sorted);
}

#[test]
fn scan_on_docs_itself_detects_root() {
    let docs = docs_dir();
    let roots = scan_bundles(&docs);
    // The chosen folder may itself be the root.
    assert!(
        roots
            .iter()
            .any(|r| Path::new(&r.root) == docs.as_path()
                && r.confidence == Confidence::Confident),
        "scanning docs/ directly should detect it as a confident root"
    );
}

#[test]
fn read_bundle_docs_full_shape() {
    let docs = docs_dir();
    let bundle = read_bundle(&docs);

    assert_eq!(bundle.concepts.len(), 43, "43 concepts parsed");
    assert_eq!(bundle.okf_version.as_deref(), Some("0.1"));
    assert_eq!(bundle.confidence, Confidence::Confident);

    // Zero error-level issues: the bundle is conformant.
    let errors: Vec<_> = bundle
        .issues
        .iter()
        .filter(|i| i.level == IssueLevel::Error)
        .collect();
    assert!(
        errors.is_empty(),
        "expected no error issues, got: {:?}",
        errors
    );

    // Every concept has a non-empty type and id.
    for c in &bundle.concepts {
        assert!(!c.id.is_empty());
        assert!(!c.concept_type.is_empty(), "{} has empty type", c.id);
    }
}

#[test]
fn known_edge_overview_links_graph_view() {
    let docs = docs_dir();
    let bundle = read_bundle(&docs);

    let overview = bundle
        .concepts
        .iter()
        .find(|c| c.id == "product/overview")
        .expect("product/overview concept exists");
    assert!(
        overview.links.iter().any(|l| l == "features/graph-view"),
        "product/overview should link to features/graph-view (relative ../ link), got {:?}",
        overview.links
    );

    let graph_view = bundle
        .concepts
        .iter()
        .find(|c| c.id == "features/graph-view")
        .expect("features/graph-view concept exists");
    assert!(
        graph_view.cited_by.iter().any(|c| c == "product/overview"),
        "features/graph-view should be cited_by product/overview, got {:?}",
        graph_view.cited_by
    );
    // Degree must equal out + in links.
    assert_eq!(
        graph_view.degree,
        (graph_view.links.len() + graph_view.cited_by.len()) as u32
    );
}

#[test]
fn docs_index_tree_has_root_node() {
    let docs = docs_dir();
    let bundle = read_bundle(&docs);

    let root_node = bundle
        .indexes
        .iter()
        .find(|n| n.dir.is_empty())
        .expect("a root IndexNode (dir == \"\") exists");
    assert!(!root_node.synthesized, "the root has a real index.md");
    assert!(
        !root_node.sections.is_empty(),
        "root index should parse into sections"
    );

    // The root index lists the product/, features/, etc. subdirectories as
    // directory entries somewhere, and concept entries resolve to ids.
    let has_concept_entry = bundle
        .indexes
        .iter()
        .flat_map(|n| &n.sections)
        .flat_map(|s| &s.entries)
        .any(|e| e.kind == EntryKind::Concept);
    assert!(has_concept_entry, "index tree should have concept entries");
}

#[test]
fn docs_log_has_entries() {
    let docs = docs_dir();
    let bundle = read_bundle(&docs);
    assert!(!bundle.log.is_empty(), "log.md should parse to >=1 entry");
    let first = &bundle.log[0];
    // Newest-first; the top entry's heading is a verbatim ISO date. Assert the
    // shape (YYYY-MM-DD), not a fixed day, so maintaining log.md doesn't break it.
    let parts: Vec<&str> = first.date.split('-').collect();
    assert!(
        parts.len() == 3
            && parts
                .iter()
                .all(|p| !p.is_empty() && p.chars().all(|c| c.is_ascii_digit())),
        "newest log entry should be a verbatim ISO YYYY-MM-DD heading, got {:?}",
        first.date
    );
    assert!(!first.entries.is_empty());
}

// ---------------------------------------------------------------------------
// Tolerance tests on synthetic bundles.
// ---------------------------------------------------------------------------

/// Create a unique temp directory under the system temp dir.
fn temp_bundle(tag: &str) -> PathBuf {
    let mut dir = std::env::temp_dir();
    let pid = std::process::id();
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    dir.push(format!("okf-core-test-{tag}-{pid}-{nanos}"));
    fs::create_dir_all(&dir).unwrap();
    dir
}

fn write(dir: &Path, rel: &str, contents: &str) {
    let path = dir.join(rel);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).unwrap();
    }
    fs::write(path, contents).unwrap();
}

#[test]
fn root_index_versions_are_read() {
    let dir = temp_bundle("odsf-version");
    write(
        &dir,
        "index.md",
        "---\nodsf_version: \"0.1\"\nokf_version: \"0.1\"\n---\n# Design system\n* [Button](components/button.md)\n",
    );
    write(
        &dir,
        "components/button.md",
        "---\ntype: Component\n---\nA button.\n",
    );
    let bundle = read_bundle(&dir);
    assert_eq!(bundle.okf_version.as_deref(), Some("0.1"));
    assert_eq!(bundle.odsf_version.as_deref(), Some("0.1"));

    // A plain OKF bundle (no odsf_version) reads as None, never an error.
    let plain = temp_bundle("no-odsf");
    write(&plain, "index.md", "---\nokf_version: \"0.1\"\n---\n# Plain\n");
    write(&plain, "x.md", "---\ntype: Note\n---\nBody.\n");
    assert_eq!(read_bundle(&plain).odsf_version, None);
}

#[test]
fn concept_missing_type_yields_error_not_panic() {
    let dir = temp_bundle("missing-type");
    write(&dir, "index.md", "---\nokf_version: \"0.1\"\n---\n# Tiny\n");
    // Frontmatter present but no type -> error.
    write(&dir, "a.md", "---\ntitle: A\n---\n# A\n");
    // No frontmatter at all -> error.
    write(&dir, "b.md", "# B has no frontmatter\n");
    // A good concept so the bundle is non-empty.
    write(&dir, "c.md", "---\ntype: Note\ntitle: C\n---\n# C\n");

    let bundle = read_bundle(&dir);
    assert_eq!(bundle.concepts.len(), 3);

    let a = bundle.concepts.iter().find(|c| c.id == "a").unwrap();
    assert_eq!(a.concept_type, "", "missing type stays empty, not a panic");

    let errors: Vec<_> = bundle
        .issues
        .iter()
        .filter(|i| i.level == IssueLevel::Error)
        .collect();
    assert!(
        errors.iter().any(|i| i.concept_id.as_deref() == Some("a")),
        "a.md (no type) should produce an error"
    );
    assert!(
        errors.iter().any(|i| i.concept_id.as_deref() == Some("b")),
        "b.md (no frontmatter) should produce an error"
    );

    fs::remove_dir_all(&dir).ok();
}

#[test]
fn broken_link_goes_to_broken_links_and_warning() {
    let dir = temp_bundle("broken-link");
    write(&dir, "index.md", "---\nokf_version: \"0.1\"\n---\n# B\n");
    write(
        &dir,
        "a.md",
        "---\ntype: Note\n---\n# A\nSee [missing](./nope.md) and [ok](b.md).\n",
    );
    write(&dir, "b.md", "---\ntype: Note\n---\n# B\n");

    let bundle = read_bundle(&dir);
    let a = bundle.concepts.iter().find(|c| c.id == "a").unwrap();
    assert_eq!(a.links, vec!["b"], "valid link resolves");
    assert_eq!(
        a.broken_links,
        vec!["./nope.md"],
        "broken link preserved verbatim"
    );

    let warns: Vec<_> = bundle
        .issues
        .iter()
        .filter(|i| i.level == IssueLevel::Warning)
        .collect();
    assert!(
        warns
            .iter()
            .any(|i| i.concept_id.as_deref() == Some("a") && i.message.contains("nope.md")),
        "broken cross-link should warn"
    );

    fs::remove_dir_all(&dir).ok();
}

#[test]
fn absolute_relative_and_dotdot_links_all_resolve() {
    let dir = temp_bundle("link-forms");
    write(&dir, "index.md", "---\nokf_version: \"0.1\"\n---\n# L\n");
    // Bundle-absolute, same-dir relative, and parent-relative links.
    write(
        &dir,
        "sub/start.md",
        "---\ntype: Note\n---\n# Start\n\
         [abs](/target.md) [rel](sibling.md) [up](../top.md)\n",
    );
    write(&dir, "sub/sibling.md", "---\ntype: Note\n---\n# Sibling\n");
    write(&dir, "target.md", "---\ntype: Note\n---\n# Target\n");
    write(&dir, "top.md", "---\ntype: Note\n---\n# Top\n");

    let bundle = read_bundle(&dir);
    let start = bundle.concepts.iter().find(|c| c.id == "sub/start").unwrap();
    let mut links = start.links.clone();
    links.sort();
    assert_eq!(
        links,
        vec!["sub/sibling".to_string(), "target".to_string(), "top".to_string()],
        "absolute, relative, and .. links all resolve; got {:?}",
        start.links
    );
    assert!(start.broken_links.is_empty());

    fs::remove_dir_all(&dir).ok();
}

#[test]
fn missing_index_is_synthesized() {
    let dir = temp_bundle("synth-index");
    write(&dir, "index.md", "---\nokf_version: \"0.1\"\n---\n# Root\n");
    // A subdirectory with concepts but no index.md.
    write(&dir, "sub/one.md", "---\ntype: Note\ntitle: One\n---\n# One\n");
    write(&dir, "sub/two.md", "---\ntype: Note\ntitle: Two\n---\n# Two\n");

    let bundle = read_bundle(&dir);
    let sub = bundle
        .indexes
        .iter()
        .find(|n| n.dir == "sub")
        .expect("sub/ should get an IndexNode");
    assert!(sub.synthesized, "sub/ lacked index.md, so it is synthesized");
    let titles: Vec<_> = sub
        .sections
        .iter()
        .flat_map(|s| &s.entries)
        .map(|e| e.title.as_str())
        .collect();
    assert!(titles.contains(&"One") && titles.contains(&"Two"));

    fs::remove_dir_all(&dir).ok();
}

#[test]
fn empty_or_garbage_dir_never_panics() {
    let dir = temp_bundle("garbage");
    write(&dir, "weird.md", "\u{feff}---\nnot: closed\ntype 没有 colon line\n");
    write(&dir, "binary.md", "\x00\x01\x02 not utf clean? still text\n");
    // Should not panic and should produce a Bundle.
    let bundle = read_bundle(&dir);
    assert!(!bundle.concepts.is_empty());

    // Scanning a candidate (no okf_version) tree should not panic either.
    let roots = scan_bundles(&dir);
    let _ = roots; // may be empty or candidate, both fine

    fs::remove_dir_all(&dir).ok();
}

#[test]
fn candidate_root_without_okf_version() {
    let dir = temp_bundle("candidate");
    // No root index.md / okf_version, but a typed concept -> candidate.
    write(&dir, "thing.md", "---\ntype: Note\n---\n# Thing\n");
    let roots = scan_bundles(&dir);
    assert!(
        roots
            .iter()
            .any(|r| r.confidence == Confidence::Candidate),
        "a typed concept with no okf_version is a candidate root"
    );

    fs::remove_dir_all(&dir).ok();
}

#[test]
fn container_of_index_bundles_splits_into_one_root_each() {
    // A plain container folder (no index.md of its own) holding several bundle
    // directories that each carry their own index.md but no okf_version — like
    // GoogleCloudPlatform/knowledge-catalog's okf/bundles. Detection must yield
    // one candidate PER bundle, not a single merged root over all their concepts.
    let dir = temp_bundle("container");
    for b in ["alpha", "beta", "gamma"] {
        write(&dir, &format!("{b}/index.md"), "# Bundle\n* [x](x.md)\n");
        write(&dir, &format!("{b}/x.md"), "---\ntype: Note\n---\n# X\n");
    }
    let roots = scan_bundles(&dir);
    assert_eq!(roots.len(), 3, "each index.md-bearing subdir is its own bundle");
    assert!(roots.iter().all(|r| r.confidence == Confidence::Candidate));
    let paths: std::collections::BTreeSet<&str> =
        roots.iter().map(|r| r.rel_path.as_str()).collect();
    assert_eq!(paths, ["alpha", "beta", "gamma"].into_iter().collect());

    fs::remove_dir_all(&dir).ok();
}

#[test]
fn nested_index_sections_do_not_split_a_single_bundle() {
    // One candidate bundle whose section subdir also carries an index.md must
    // stay a single root — the boundary rule stops at the top of the contiguous
    // index.md chain (here `mybundle`, whose container has none), not every
    // index.md below it.
    let dir = temp_bundle("sections");
    write(&dir, "mybundle/index.md", "# My bundle\n");
    write(&dir, "mybundle/note.md", "---\ntype: Note\n---\n# Root note\n");
    write(&dir, "mybundle/section/index.md", "# Section\n");
    write(&dir, "mybundle/section/deep.md", "---\ntype: Note\n---\n# Deep\n");
    let roots = scan_bundles(&dir);
    assert_eq!(roots.len(), 1, "nested index.md sections don't split the bundle");
    assert_eq!(roots[0].rel_path, "mybundle");

    fs::remove_dir_all(&dir).ok();
}

#[test]
fn scan_respects_max_depth() {
    let dir = temp_bundle("depth");
    // A typed concept nested three directories below the chosen folder.
    write(&dir, "a/b/c/deep.md", "---\ntype: Note\n---\n# Deep\n");

    // A shallow scan can't reach it; a deeper scan finds it.
    let shallow = okf_core::scan_bundles_with_depth(&dir, 2);
    assert!(
        shallow.is_empty(),
        "a concept three levels down is out of reach at max_depth=2"
    );
    let deep = okf_core::scan_bundles_with_depth(&dir, 8);
    assert!(
        deep.iter().any(|r| r.concept_count >= 1),
        "the nested concept is detected with a deeper scan"
    );

    fs::remove_dir_all(&dir).ok();
}

