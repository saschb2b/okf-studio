use okf_core::query;
use okf_core::retrieval::{build_manifest, retrieve, RetrievalRequest, RetrievalRoute};
use okf_core::{Bundle, Concept, Confidence};
use serde::Deserialize;
use std::collections::{BTreeMap, BTreeSet};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct FrozenQuery {
    id: String,
    query: String,
    relevant_concept_ids: Vec<String>,
    expected_route: String,
    abstain: bool,
}

#[test]
fn frozen_corpus_separates_query_classes_and_retrieval_from_answer_failure() {
    let corpus: Vec<FrozenQuery> =
        serde_json::from_str(include_str!("fixtures/retrieval-corpus.json"))
            .expect("frozen corpus should parse");
    let bundle = evaluation_bundle();
    let mut route_labels = BTreeSet::new();
    let mut exact_recall = None;
    let mut relationship_recall = None;

    for case in &corpus {
        let result = retrieve(
            &bundle,
            &RetrievalRequest {
                query: case.query.clone(),
                provider_window_tokens: Some(64_000),
                context_budget_tokens: 64_000,
                ..RetrievalRequest::default()
            },
        );
        let retrieved = result
            .evidence
            .items
            .iter()
            .map(|item| item.concept_id.as_str())
            .collect::<BTreeSet<_>>();
        let relevant = case
            .relevant_concept_ids
            .iter()
            .map(String::as_str)
            .collect::<BTreeSet<_>>();
        let recall = if relevant.is_empty() {
            1.0
        } else {
            relevant.intersection(&retrieved).count() as f64 / relevant.len() as f64
        };
        assert!(
            recall >= 0.5,
            "{} should retrieve at least half its frozen evidence, got {recall}",
            case.id
        );
        assert_eq!(
            route_label(result.receipt.route),
            case.expected_route,
            "{}",
            case.id
        );
        if case.abstain {
            assert!(
                result.evidence.requires_abstention || relevant.is_empty(),
                "{} must not silently claim authority",
                case.id
            );
        }
        route_labels.insert(route_label(result.receipt.route));
        if case.id == "exact-id" {
            exact_recall = Some(recall);
        } else if case.id == "relationship-impact" {
            relationship_recall = Some(recall);
        }
    }

    assert!(
        route_labels.len() >= 5,
        "the corpus must exercise distinct route winners"
    );
    assert_eq!(exact_recall, Some(1.0));
    assert_eq!(relationship_recall, Some(1.0));
}

#[test]
fn frozen_corpus_is_order_independent_across_two_runs() {
    let mut corpus: Vec<FrozenQuery> =
        serde_json::from_str(include_str!("fixtures/retrieval-corpus.json"))
            .expect("frozen corpus should parse");
    let bundle = evaluation_bundle();
    let forward = retrieval_signatures(&bundle, &corpus);
    corpus.reverse();
    let reversed = retrieval_signatures(&bundle, &corpus);

    assert_eq!(forward, reversed);
}

#[test]
fn lexical_manifest_improves_heading_lookup_over_concept_substring_search() {
    let bundle = evaluation_bundle();
    let baseline = query::search(&bundle, "USDC target", 10);
    let result = retrieve(
        &bundle,
        &RetrievalRequest {
            query: "USDC target".to_string(),
            ..RetrievalRequest::default()
        },
    );

    assert!(
        baseline.is_empty(),
        "the baseline intentionally cannot combine separated terms"
    );
    assert_eq!(result.evidence.items[0].concept_id, "tables/targets");
    assert!(result.receipt.candidates[0].score.lexical > 0.0);
}

#[test]
fn generated_scale_manifest_keeps_all_ten_thousand_stable_identities() {
    let concepts = (0..10_000)
        .map(|index| {
            concept(
                &format!("generated/concept-{index:05}"),
                &format!("Generated concept {index:05}"),
                "Generated",
                &format!("# Generated concept {index:05}\n\nDeterministic scale fixture value {index:05}."),
            )
        })
        .collect::<Vec<_>>();
    let bundle = bundle(concepts);
    let first = build_manifest(&bundle);
    let second = build_manifest(&bundle);

    assert_eq!(first.concept_count, 10_000);
    assert_eq!(first.unit_count, 10_000);
    assert_eq!(first.bundle_fingerprint, second.bundle_fingerprint);
    assert_eq!(
        first
            .units
            .iter()
            .map(|unit| &unit.section_id)
            .collect::<BTreeSet<_>>()
            .len(),
        10_000
    );
}

fn route_label(route: RetrievalRoute) -> &'static str {
    match route {
        RetrievalRoute::ExactLexical => "exact-lexical",
        RetrievalRoute::LexicalGraph => "lexical-graph",
        RetrievalRoute::Coverage => "coverage",
        RetrievalRoute::TemporalConflict => "temporal-conflict",
        RetrievalRoute::Structured => "structured",
        RetrievalRoute::FullContext => "full-context",
        RetrievalRoute::HybridFallback => "hybrid-fallback",
    }
}

fn retrieval_signatures(
    bundle: &Bundle,
    corpus: &[FrozenQuery],
) -> BTreeMap<String, (String, Vec<String>, bool)> {
    corpus
        .iter()
        .map(|case| {
            let result = retrieve(
                bundle,
                &RetrievalRequest {
                    query: case.query.clone(),
                    provider_window_tokens: Some(64_000),
                    context_budget_tokens: 64_000,
                    ..RetrievalRequest::default()
                },
            );
            (
                case.id.clone(),
                (
                    route_label(result.receipt.route).to_string(),
                    result
                        .evidence
                        .items
                        .iter()
                        .map(|item| item.section_id.clone())
                        .collect(),
                    result.evidence.requires_abstention,
                ),
            )
        })
        .collect()
}

fn evaluation_bundle() -> Bundle {
    let mut revenue = concept(
        "metrics/revenue",
        "Revenue",
        "Metric",
        "# Revenue\n\nRecognized subscription income after refunds.",
    );
    revenue.links = vec!["reports/board".to_string()];
    revenue.external_links = vec!["https://example.com/revenue-policy".to_string()];
    let mut board = concept(
        "reports/board",
        "Board report",
        "Report",
        "# Board report\n\nDepends on the Revenue metric for the monthly board pack.",
    );
    board.cited_by = vec!["metrics/revenue".to_string()];
    let mut current = concept(
        "policies/current",
        "Retention policy",
        "Policy",
        "# Definition\n\nRetain records for 30 days.",
    );
    current.timestamp = Some("2026-01-01T00:00:00Z".to_string());
    current.extra.insert(
        "source_class".to_string(),
        serde_json::Value::String("official".to_string()),
    );
    current.extra.insert(
        "supersedes".to_string(),
        serde_json::Value::String("policies/old".to_string()),
    );
    let mut old = concept(
        "policies/old",
        "Retention policy archive",
        "Policy",
        "# Definition\n\nRetain records for 90 days.",
    );
    old.timestamp = Some("2024-01-01T00:00:00Z".to_string());
    let table = concept(
        "tables/targets",
        "Targets",
        "Table",
        "# Annual target\n\n| Year | Currency | Value |\n| ---: | --- | ---: |\n| 2026 | USDC | 42 |",
    );
    bundle(vec![revenue, board, current, old, table])
}

fn concept(id: &str, title: &str, concept_type: &str, body: &str) -> Concept {
    Concept {
        id: id.to_string(),
        concept_type: concept_type.to_string(),
        title: title.to_string(),
        description: format!("{title} description"),
        tags: vec![concept_type.to_lowercase()],
        timestamp: None,
        resource: None,
        extra: BTreeMap::new(),
        body: body.to_string(),
        links: Vec::new(),
        external_links: Vec::new(),
        broken_links: Vec::new(),
        cited_by: Vec::new(),
        degree: 0,
        ..Default::default()
    }
}

fn bundle(concepts: Vec<Concept>) -> Bundle {
    Bundle {
        root: String::new(),
        name: "Retrieval benchmark".to_string(),
        okf_version: Some("0.1".to_string()),
        odsf_version: None,
        extra: Default::default(),
        concepts,
        indexes: Vec::new(),
        log: Vec::new(),
        issues: Vec::new(),
        confidence: Confidence::Confident,
    }
}
