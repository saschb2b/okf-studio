//! Parser assertions over the frozen OKF agent benchmark corpus.

use okf_core::model::IssueLevel;
use okf_core::{read_bundle, Bundle};
use serde::Deserialize;
use std::path::{Path, PathBuf};

#[derive(Debug, Deserialize)]
struct Manifest {
    fixtures: Vec<Fixture>,
}

#[derive(Debug, Deserialize)]
struct Fixture {
    id: String,
    kind: String,
    path: Option<String>,
    expected: Expected,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Expected {
    concept_count: usize,
    error_count: Option<usize>,
    warning_count: Option<usize>,
    broken_link_count: Option<usize>,
    orphan_concept_ids: Option<Vec<String>>,
    unknown_type: Option<String>,
    conflict_concept_ids: Option<Vec<String>>,
    missing_metadata: Option<Vec<String>>,
}

fn benchmark_root() -> PathBuf {
    Path::new(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../benchmarks/okf-agent"
    ))
    .canonicalize()
    .expect("benchmark corpus should exist")
}

fn fixture(id: &str) -> (Bundle, Expected) {
    let root = benchmark_root();
    let manifest: Manifest = serde_json::from_str(
        &std::fs::read_to_string(root.join("manifest.json"))
            .expect("benchmark manifest should be readable"),
    )
    .expect("benchmark manifest should be valid JSON");
    let fixture = manifest
        .fixtures
        .into_iter()
        .find(|fixture| fixture.id == id)
        .unwrap_or_else(|| panic!("fixture {id} should be declared"));
    assert_eq!(fixture.kind, "bundle", "{id} should be a bundle fixture");
    let path = fixture
        .path
        .unwrap_or_else(|| panic!("fixture {id} should declare a path"));
    (read_bundle(&root.join(path)), fixture.expected)
}

fn issue_count(bundle: &Bundle, level: IssueLevel) -> usize {
    bundle
        .issues
        .iter()
        .filter(|issue| issue.level == level)
        .count()
}

fn assert_declared_counts(bundle: &Bundle, expected: &Expected) {
    assert_eq!(bundle.concepts.len(), expected.concept_count);
    assert_eq!(
        issue_count(bundle, IssueLevel::Error),
        expected
            .error_count
            .expect("fixture should declare errorCount")
    );
    assert_eq!(
        issue_count(bundle, IssueLevel::Warning),
        expected
            .warning_count
            .expect("fixture should declare warningCount")
    );
}

#[test]
fn conformant_linked_fixture_preserves_metric_lineage() {
    let (bundle, expected) = fixture("conformant-linked");
    assert_declared_counts(&bundle, &expected);
    assert_eq!(
        bundle
            .concepts
            .iter()
            .map(|concept| concept.broken_links.len())
            .sum::<usize>(),
        expected
            .broken_link_count
            .expect("fixture should declare brokenLinkCount")
    );

    let metric = bundle
        .concepts
        .iter()
        .find(|concept| concept.id == "metrics/net-revenue")
        .expect("net revenue should parse");
    assert_eq!(
        metric.links,
        ["concepts/customer-orders", "runbooks/refund-audit"]
    );
    assert!(
        metric
            .body
            .contains("gross\\_usd} - \\text{refunded\\_usd}"),
        "the calculation must remain available as benchmark evidence"
    );
}

#[test]
fn thin_fixture_remains_valid_without_optional_metadata() {
    let (bundle, expected) = fixture("thin-bundle");
    assert_declared_counts(&bundle, &expected);

    let concept = bundle
        .concepts
        .first()
        .expect("thin fixture should contain its retention concept");
    assert_eq!(concept.id, "retention");
    assert_eq!(concept.concept_type, "Note");
    assert_eq!(concept.description, "");
    assert!(concept.tags.is_empty());
    assert_eq!(concept.timestamp, None);
    assert_eq!(concept.resource, None);
    assert_eq!(
        expected
            .missing_metadata
            .expect("fixture should declare missingMetadata"),
        ["description", "tags", "timestamp", "resource"]
    );
}

#[test]
fn disconnected_fixture_exposes_one_broken_link_and_one_orphan() {
    let (bundle, expected) = fixture("disconnected-broken");
    assert_declared_counts(&bundle, &expected);

    let broken = bundle
        .concepts
        .iter()
        .flat_map(|concept| &concept.broken_links)
        .collect::<Vec<_>>();
    assert_eq!(broken, ["dashboards/freshness.md"]);
    assert_eq!(
        broken.len(),
        expected
            .broken_link_count
            .expect("fixture should declare brokenLinkCount")
    );

    let orphan_ids = bundle
        .concepts
        .iter()
        .filter(|concept| concept.degree == 0)
        .map(|concept| concept.id.clone())
        .collect::<Vec<_>>();
    assert_eq!(
        orphan_ids,
        expected
            .orphan_concept_ids
            .expect("fixture should declare orphanConceptIds")
    );
}

#[test]
fn malformed_fixture_remains_readable_and_preserves_unknown_types() {
    let (bundle, expected) = fixture("malformed-tolerated");
    assert_declared_counts(&bundle, &expected);

    let error_ids = bundle
        .issues
        .iter()
        .filter(|issue| issue.level == IssueLevel::Error)
        .filter_map(|issue| issue.concept_id.clone())
        .collect::<Vec<_>>();
    assert_eq!(error_ids, ["missing-type", "no-frontmatter"]);

    let unknown = bundle
        .concepts
        .iter()
        .find(|concept| concept.id == "unknown-type")
        .expect("unknown type concept should remain readable");
    assert_eq!(
        Some(&unknown.concept_type),
        expected.unknown_type.as_ref(),
        "producer-defined types must survive parsing"
    );
}

#[test]
fn conflicting_fixture_keeps_both_stale_source_claims() {
    let (bundle, expected) = fixture("conflicting-stale");
    assert_declared_counts(&bundle, &expected);

    let conflict_ids = expected
        .conflict_concept_ids
        .expect("fixture should declare conflictConceptIds");
    for id in &conflict_ids {
        let concept = bundle
            .concepts
            .iter()
            .find(|concept| &concept.id == id)
            .unwrap_or_else(|| panic!("conflict concept {id} should parse"));
        assert_eq!(concept.timestamp.as_deref(), Some("2021-01-01T00:00:00Z"));
    }

    let finance = bundle
        .concepts
        .iter()
        .find(|concept| concept.id == "metrics/finance-revenue")
        .expect("finance revenue should parse");
    let sales = bundle
        .concepts
        .iter()
        .find(|concept| concept.id == "metrics/sales-revenue")
        .expect("sales revenue should parse");
    assert!(finance.body.contains("includes refunds"));
    assert!(sales.body.contains("excludes refunds"));
}
