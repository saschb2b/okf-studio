//! Deterministic compatibility assertions over reduced third-party OKF bundles.

use okf_core::model::IssueLevel;
use okf_core::read_bundle;
use serde::Deserialize;
use serde_json::Value;
use std::collections::{BTreeMap, BTreeSet};
use std::path::{Path, PathBuf};

#[derive(Debug, Deserialize)]
struct Manifest {
    source: Source,
    bundles: Vec<Fixture>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Source {
    repository: String,
    commit: String,
    retrieved_on: String,
    license: String,
}

#[derive(Debug, Deserialize)]
struct Fixture {
    id: String,
    path: String,
    expected: Expected,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Expected {
    concept_count: usize,
    edge_count: usize,
    broken_link_count: usize,
    error_count: usize,
    warning_count: usize,
    types: BTreeSet<String>,
    extras: BTreeMap<String, BTreeMap<String, Value>>,
}

fn corpus_root() -> PathBuf {
    Path::new(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/tests/fixtures/producer-corpus"
    ))
    .canonicalize()
    .expect("producer compatibility corpus should exist")
}

fn issue_count(bundle: &okf_core::Bundle, level: IssueLevel) -> usize {
    bundle
        .issues
        .iter()
        .filter(|issue| issue.level == level)
        .count()
}

#[test]
fn pinned_producer_corpus_matches_declared_graph_validation_and_extensions() {
    let root = corpus_root();
    let manifest: Manifest = serde_json::from_str(
        &std::fs::read_to_string(root.join("manifest.json"))
            .expect("producer manifest should be readable"),
    )
    .expect("producer manifest should be valid JSON");

    assert_eq!(
        manifest.source.repository,
        "https://github.com/GoogleCloudPlatform/knowledge-catalog"
    );
    assert_eq!(manifest.source.commit.len(), 40, "source must pin a commit");
    assert_eq!(manifest.source.retrieved_on, "2026-07-23");
    assert_eq!(manifest.source.license, "Apache-2.0");
    assert!(root.join("LICENSE-Apache-2.0.txt").is_file());

    for fixture in manifest.bundles {
        let bundle = read_bundle(&root.join(&fixture.path));
        let expected = fixture.expected;

        assert_eq!(
            bundle.concepts.len(),
            expected.concept_count,
            "{} concept count",
            fixture.id
        );
        assert_eq!(
            bundle
                .concepts
                .iter()
                .map(|concept| concept.links.len())
                .sum::<usize>(),
            expected.edge_count,
            "{} directed edge count",
            fixture.id
        );
        assert_eq!(
            bundle
                .concepts
                .iter()
                .map(|concept| concept.broken_links.len())
                .sum::<usize>(),
            expected.broken_link_count,
            "{} broken link count",
            fixture.id
        );
        assert_eq!(
            issue_count(&bundle, IssueLevel::Error),
            expected.error_count,
            "{} errors",
            fixture.id
        );
        assert_eq!(
            issue_count(&bundle, IssueLevel::Warning),
            expected.warning_count,
            "{} warnings",
            fixture.id
        );

        let types = bundle
            .concepts
            .iter()
            .map(|concept| concept.concept_type.clone())
            .collect::<BTreeSet<_>>();
        assert_eq!(types, expected.types, "{} type vocabulary", fixture.id);

        let extras = bundle
            .concepts
            .iter()
            .filter(|concept| !concept.extra.is_empty())
            .map(|concept| (concept.id.clone(), concept.extra.clone()))
            .collect::<BTreeMap<_, _>>();
        assert_eq!(
            extras, expected.extras,
            "{} preserved extensions",
            fixture.id
        );
    }
}
