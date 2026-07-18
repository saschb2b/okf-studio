use super::diagnostics::{diagnose, propose_repairs};
use super::manifest::{build_manifest, canonical_snapshot, stable_hash};
use super::{
    CacheReceipt, EvidenceCaveat, EvidenceCaveatKind, EvidenceItem, EvidencePacket,
    ExclusionReason, ProviderReceipt, ProviderState, QueryClass, ReceiptCandidate,
    RetrievalCandidate, RetrievalFilters, RetrievalManifest, RetrievalManifestSummary,
    RetrievalOmission, RetrievalReceipt, RetrievalResult, RetrievalRoute, ScoreComponents,
    RETRIEVAL_SCHEMA_VERSION,
};
use crate::Bundle;
use serde::{Deserialize, Serialize};
use std::cmp::Ordering;
use std::collections::{BTreeMap, BTreeSet, HashMap, HashSet, VecDeque};
use std::time::Instant;

const DEFAULT_LIMIT: usize = 24;
const DEFAULT_CONTEXT_BUDGET: usize = 4_096;
const MAX_LIMIT: usize = 100;
const MAX_CONTEXT_BUDGET: usize = 64_000;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RetrievalRequest {
    pub query: String,
    #[serde(default)]
    pub route: Option<RetrievalRoute>,
    #[serde(default)]
    pub filters: RetrievalFilters,
    #[serde(default = "default_limit")]
    pub limit: usize,
    #[serde(default = "default_context_budget")]
    pub context_budget_tokens: usize,
    #[serde(default)]
    pub dense_provider_id: Option<String>,
    #[serde(default)]
    pub reranker_provider_id: Option<String>,
    #[serde(default)]
    pub cache_provider_id: Option<String>,
    #[serde(default)]
    pub provider_window_tokens: Option<usize>,
    #[serde(default)]
    pub allow_remote_text: bool,
}

impl Default for RetrievalRequest {
    fn default() -> Self {
        Self {
            query: String::new(),
            route: None,
            filters: RetrievalFilters::default(),
            limit: DEFAULT_LIMIT,
            context_budget_tokens: DEFAULT_CONTEXT_BUDGET,
            dense_provider_id: None,
            reranker_provider_id: None,
            cache_provider_id: None,
            provider_window_tokens: None,
            allow_remote_text: false,
        }
    }
}

pub fn retrieve(bundle: &Bundle, request: &RetrievalRequest) -> RetrievalResult {
    let manifest = build_manifest(bundle);
    retrieve_manifest(manifest, request)
}

pub fn retrieve_manifest(
    manifest: RetrievalManifest,
    request: &RetrievalRequest,
) -> RetrievalResult {
    let started = Instant::now();
    let query = request.query.trim();
    let query_class = classify_query(query, &manifest);
    let route = request.route.unwrap_or_else(|| route_for(query_class));
    let limit = request.limit.clamp(1, MAX_LIMIT);
    let context_budget = request.context_budget_tokens.clamp(1, MAX_CONTEXT_BUDGET);
    let providers = provider_receipts(request, query_class);
    let mut omissions = Vec::new();
    let eligible = manifest
        .units
        .iter()
        .filter(|unit| unit_matches_filters(unit, &request.filters, &mut omissions))
        .collect::<Vec<_>>();
    let mut candidates = rank_candidates(&manifest, &eligible, query, route);
    candidates.truncate(limit);
    let (evidence, compiled_omissions, included_ids) = compile_context(
        &manifest,
        query,
        &candidates,
        context_budget,
        route,
        request,
    );
    omissions.extend(compiled_omissions);
    let receipt_candidates = candidates
        .iter()
        .map(|candidate| {
            let exclusion = omissions
                .iter()
                .find(|omission| omission.section_id == candidate.unit.section_id)
                .cloned();
            ReceiptCandidate {
                section_id: candidate.unit.section_id.clone(),
                concept_id: candidate.unit.concept_id.clone(),
                included: included_ids.contains(candidate.unit.section_id.as_str()),
                score: candidate.score.clone(),
                matched_terms: candidate.matched_terms.clone(),
                relationship_path: candidate.relationship_path.clone(),
                exclusion,
            }
        })
        .collect::<Vec<_>>();
    let snapshot = canonical_snapshot(&manifest);
    let cache = cache_receipt(request, route, &snapshot);
    let receipt_id = stable_hash(&[
        "okf-retrieval-receipt-v1",
        manifest.bundle_fingerprint.as_str(),
        query,
        route_label(route),
        context_budget.to_string().as_str(),
    ]);
    let receipt = RetrievalReceipt {
        schema_version: RETRIEVAL_SCHEMA_VERSION,
        receipt_id,
        query: query.to_string(),
        query_class,
        route,
        route_reason: route_reason(query_class, request.route.is_some()).to_string(),
        bundle_id: manifest.bundle_id.clone(),
        bundle_fingerprint: manifest.bundle_fingerprint.clone(),
        filters: request.filters.clone(),
        candidates: receipt_candidates,
        omissions,
        context_budget_tokens: context_budget,
        context_tokens_used: evidence.estimated_tokens,
        providers,
        elapsed_micros: started.elapsed().as_micros(),
        cache,
    };
    let diagnostic = diagnose(&manifest, &receipt, &evidence);
    let repairs = propose_repairs(&manifest, &receipt, &diagnostic);
    RetrievalResult {
        manifest: RetrievalManifestSummary {
            bundle_id: manifest.bundle_id,
            bundle_name: manifest.bundle_name,
            bundle_fingerprint: manifest.bundle_fingerprint,
            concept_count: manifest.concept_count,
            unit_count: manifest.unit_count,
        },
        evidence,
        receipt,
        diagnostic,
        repairs,
    }
}

fn default_limit() -> usize {
    DEFAULT_LIMIT
}

fn default_context_budget() -> usize {
    DEFAULT_CONTEXT_BUDGET
}

fn classify_query(query: &str, manifest: &RetrievalManifest) -> QueryClass {
    let normalized = query.to_lowercase();
    let words = tokenize(query);
    if manifest.units.iter().any(|unit| {
        normalized == unit.concept_id.to_lowercase()
            || normalized == unit.concept_title.to_lowercase()
            || normalized == unit.section_id.to_lowercase()
    }) || query.contains('`')
    {
        QueryClass::Exact
    } else if contains_any(
        &normalized,
        &[
            "relationship",
            "related",
            "depends",
            "upstream",
            "downstream",
            "path between",
            "impact",
        ],
    ) {
        QueryClass::Relationship
    } else if contains_any(
        &normalized,
        &[
            "as of",
            "changed since",
            "current",
            "latest",
            "superseded",
            "history",
        ],
    ) {
        QueryClass::Temporal
    } else if contains_any(
        &normalized,
        &[
            "table", "row", "column", "schema", "field", "metric", "count",
        ],
    ) {
        QueryClass::Structured
    } else if contains_any(
        &normalized,
        &[
            "everything",
            "whole bundle",
            "entire bundle",
            "full context",
        ],
    ) {
        QueryClass::FullContext
    } else if contains_any(
        &normalized,
        &[
            "across",
            "overview",
            "summarize",
            "themes",
            "coverage",
            "all concepts",
        ],
    ) {
        QueryClass::Global
    } else if words.len() <= 3 {
        QueryClass::Lexical
    } else if contains_any(
        &normalized,
        &["similar", "meaning", "conceptually", "discover"],
    ) {
        QueryClass::Semantic
    } else {
        QueryClass::Mixed
    }
}

fn route_for(class: QueryClass) -> RetrievalRoute {
    match class {
        QueryClass::Exact | QueryClass::Lexical => RetrievalRoute::ExactLexical,
        QueryClass::Relationship => RetrievalRoute::LexicalGraph,
        QueryClass::Global => RetrievalRoute::Coverage,
        QueryClass::Temporal => RetrievalRoute::TemporalConflict,
        QueryClass::Structured => RetrievalRoute::Structured,
        QueryClass::FullContext => RetrievalRoute::FullContext,
        QueryClass::Semantic | QueryClass::Mixed => RetrievalRoute::HybridFallback,
    }
}

fn route_reason(class: QueryClass, overridden: bool) -> &'static str {
    if overridden {
        return "The user selected this route for the query.";
    }
    match class {
        QueryClass::Exact => "The query names an exact OKF identity or title.",
        QueryClass::Lexical => "The query is a short local lookup.",
        QueryClass::Semantic => {
            "No dense provider is required; Studio combined local lexical and graph evidence."
        }
        QueryClass::Relationship => "The query asks how concepts connect.",
        QueryClass::Global => "The query asks for evidence across the bundle.",
        QueryClass::Temporal => "The query contains a current-state or change constraint.",
        QueryClass::Structured => "The query targets structured or tabular knowledge.",
        QueryClass::FullContext => "The query explicitly requests the whole granted bundle.",
        QueryClass::Mixed => "The query needs more than one local candidate generator.",
    }
}

fn provider_receipts(request: &RetrievalRequest, class: QueryClass) -> Vec<ProviderReceipt> {
    let dense_requested = matches!(class, QueryClass::Semantic | QueryClass::Mixed);
    let dense = match request.dense_provider_id.as_deref() {
        Some(provider_id) if request.allow_remote_text => ProviderReceipt {
            capability: "dense-retrieval".to_string(),
            provider_id: Some(provider_id.to_string()),
            state: ProviderState::Configured,
            remote_text_shared: true,
            detail: "A configured dense adapter may add candidates; the local route remains authoritative for fallback.".to_string(),
        },
        Some(provider_id) => ProviderReceipt {
            capability: "dense-retrieval".to_string(),
            provider_id: Some(provider_id.to_string()),
            state: ProviderState::Degraded,
            remote_text_shared: false,
            detail: "Remote text disclosure was not granted, so Studio used the local fallback.".to_string(),
        },
        None if dense_requested => ProviderReceipt {
            capability: "dense-retrieval".to_string(),
            provider_id: None,
            state: ProviderState::Unavailable,
            remote_text_shared: false,
            detail: "No embedding provider is configured; Studio used exact, lexical, and graph retrieval.".to_string(),
        },
        None => ProviderReceipt {
            capability: "local-retrieval".to_string(),
            provider_id: Some("okf-core".to_string()),
            state: ProviderState::Local,
            remote_text_shared: false,
            detail: "Retrieval stayed on this device.".to_string(),
        },
    };
    let reranker = match request.reranker_provider_id.as_deref() {
        Some(provider_id) if request.allow_remote_text => ProviderReceipt {
            capability: "reranking".to_string(),
            provider_id: Some(provider_id.to_string()),
            state: ProviderState::Configured,
            remote_text_shared: true,
            detail: "Only the bounded candidate set is eligible for configured reranking."
                .to_string(),
        },
        Some(provider_id) => ProviderReceipt {
            capability: "reranking".to_string(),
            provider_id: Some(provider_id.to_string()),
            state: ProviderState::Degraded,
            remote_text_shared: false,
            detail:
                "Remote text disclosure was not granted; deterministic local order was retained."
                    .to_string(),
        },
        None => ProviderReceipt {
            capability: "reranking".to_string(),
            provider_id: None,
            state: ProviderState::Unavailable,
            remote_text_shared: false,
            detail: "No reranker is configured; scores come from deterministic local stages."
                .to_string(),
        },
    };
    vec![dense, reranker]
}

fn unit_matches_filters(
    unit: &&super::RetrievalUnit,
    filters: &RetrievalFilters,
    omissions: &mut Vec<RetrievalOmission>,
) -> bool {
    let matches = filters
        .concept_type
        .as_ref()
        .is_none_or(|value| unit.concept_type.eq_ignore_ascii_case(value))
        && filters
            .tag
            .as_ref()
            .is_none_or(|value| unit.tags.iter().any(|tag| tag.eq_ignore_ascii_case(value)))
        && filters.current_as_of.as_ref().is_none_or(|value| {
            unit.effective_time
                .as_ref()
                .or(unit.timestamp.as_ref())
                .is_some_and(|time| time <= value)
        })
        && filters
            .changed_since
            .as_ref()
            .is_none_or(|value| unit.timestamp.as_ref().is_some_and(|time| time >= value))
        && filters.source_class.as_ref().is_none_or(|value| {
            unit.source_class
                .as_ref()
                .is_some_and(|class| class.eq_ignore_ascii_case(value))
        })
        && filters.owner.as_ref().is_none_or(|value| {
            unit.owner
                .as_ref()
                .is_some_and(|owner| owner.eq_ignore_ascii_case(value))
        });
    if !matches {
        omissions.push(RetrievalOmission {
            section_id: unit.section_id.clone(),
            concept_id: unit.concept_id.clone(),
            reason: ExclusionReason::FilterMismatch,
            detail: "The unit did not satisfy the active retrieval filters.".to_string(),
        });
    }
    matches
}

fn rank_candidates(
    manifest: &RetrievalManifest,
    eligible: &[&super::RetrievalUnit],
    query: &str,
    route: RetrievalRoute,
) -> Vec<RetrievalCandidate> {
    let query_terms = tokenize(query);
    let document_frequencies = document_frequencies(eligible);
    let average_length = eligible
        .iter()
        .map(|unit| tokenize(&unit.text).len())
        .sum::<usize>() as f64
        / eligible.len().max(1) as f64;
    let mut candidates = eligible
        .iter()
        .filter_map(|unit| {
            let exact = exact_score(unit, query);
            let lexical = bm25_score(
                unit,
                &query_terms,
                &document_frequencies,
                eligible.len(),
                average_length,
            );
            let matched_terms = query_terms
                .iter()
                .filter(|term| searchable_text(unit).contains(term.as_str()))
                .cloned()
                .collect::<Vec<_>>();
            let structured = matches!(route, RetrievalRoute::Structured)
                && matches!(unit.kind, super::RetrievalUnitKind::Table);
            let coverage = matches!(route, RetrievalRoute::Coverage) as u8 as f64 * 4.0
                + structured as u8 as f64 * 25.0;
            let authority = authority_score(unit);
            let total = exact + lexical + coverage + authority;
            (total > 0.0 || matches!(route, RetrievalRoute::FullContext)).then(|| {
                RetrievalCandidate {
                    unit: (*unit).clone(),
                    score: ScoreComponents {
                        exact,
                        lexical,
                        graph: 0.0,
                        coverage,
                        authority,
                        total,
                    },
                    matched_terms,
                    relationship_path: Vec::new(),
                    inferred_relationship: false,
                }
            })
        })
        .collect::<Vec<_>>();
    if matches!(
        route,
        RetrievalRoute::LexicalGraph | RetrievalRoute::HybridFallback
    ) {
        expand_graph(manifest, &mut candidates);
    }
    if matches!(route, RetrievalRoute::Coverage) {
        coverage_balance(&mut candidates);
    }
    candidates.sort_by(candidate_order);
    candidates
}

fn exact_score(unit: &super::RetrievalUnit, query: &str) -> f64 {
    let normalized = query.trim().to_lowercase();
    if normalized.is_empty() {
        return 0.0;
    }
    if unit.concept_id.to_lowercase() == normalized || unit.section_id.to_lowercase() == normalized
    {
        10_000.0
    } else if unit.concept_title.to_lowercase() == normalized {
        9_000.0
    } else if unit
        .heading_path
        .iter()
        .any(|heading| heading.to_lowercase() == normalized)
    {
        8_000.0
    } else if unit.tags.iter().any(|tag| tag.to_lowercase() == normalized) {
        7_000.0
    } else if unit.concept_type.to_lowercase() == normalized {
        6_000.0
    } else if unit
        .citations
        .iter()
        .any(|citation| citation.to_lowercase().contains(&normalized))
    {
        5_000.0
    } else if unit.concept_id.to_lowercase().contains(&normalized)
        || unit.concept_title.to_lowercase().contains(&normalized)
        || unit
            .heading_path
            .iter()
            .any(|heading| heading.to_lowercase().contains(&normalized))
    {
        1_000.0
    } else {
        0.0
    }
}

fn bm25_score(
    unit: &super::RetrievalUnit,
    query_terms: &[String],
    document_frequencies: &HashMap<String, usize>,
    document_count: usize,
    average_length: f64,
) -> f64 {
    let tokens = tokenize(&searchable_text(unit));
    if tokens.is_empty() {
        return 0.0;
    }
    let mut frequencies = HashMap::<&str, usize>::new();
    for token in &tokens {
        *frequencies.entry(token.as_str()).or_default() += 1;
    }
    let k1 = 1.2;
    let b = 0.75;
    query_terms
        .iter()
        .map(|term| {
            let frequency = *frequencies.get(term.as_str()).unwrap_or(&0) as f64;
            if frequency == 0.0 {
                return 0.0;
            }
            let df = *document_frequencies.get(term).unwrap_or(&0) as f64;
            let idf = ((document_count as f64 - df + 0.5) / (df + 0.5) + 1.0).ln();
            let length_norm = 1.0 - b + b * tokens.len() as f64 / average_length.max(1.0);
            idf * frequency * (k1 + 1.0) / (frequency + k1 * length_norm)
        })
        .sum::<f64>()
        * 100.0
}

fn document_frequencies(units: &[&super::RetrievalUnit]) -> HashMap<String, usize> {
    let mut frequencies = HashMap::new();
    for unit in units {
        for token in tokenize(&searchable_text(unit))
            .into_iter()
            .collect::<HashSet<_>>()
        {
            *frequencies.entry(token).or_default() += 1;
        }
    }
    frequencies
}

fn searchable_text(unit: &super::RetrievalUnit) -> String {
    format!(
        "{} {} {} {} {} {}",
        unit.concept_id,
        unit.concept_title,
        unit.concept_type,
        unit.heading_path.join(" "),
        unit.tags.join(" "),
        unit.text
    )
    .to_lowercase()
}

fn expand_graph(manifest: &RetrievalManifest, candidates: &mut Vec<RetrievalCandidate>) {
    let seed_ids = candidates
        .iter()
        .take(4)
        .map(|candidate| candidate.unit.concept_id.clone())
        .collect::<Vec<_>>();
    if seed_ids.is_empty() {
        return;
    }
    let units_by_concept = manifest.units.iter().fold(
        HashMap::<&str, Vec<&super::RetrievalUnit>>::new(),
        |mut map, unit| {
            map.entry(unit.concept_id.as_str()).or_default().push(unit);
            map
        },
    );
    let links_by_concept =
        manifest
            .units
            .iter()
            .fold(HashMap::<&str, BTreeSet<&str>>::new(), |mut map, unit| {
                let entry = map.entry(unit.concept_id.as_str()).or_default();
                entry.extend(unit.links.iter().map(String::as_str));
                entry.extend(unit.backlinks.iter().map(String::as_str));
                map
            });
    let existing = candidates
        .iter()
        .map(|candidate| candidate.unit.section_id.clone())
        .collect::<HashSet<_>>();
    let mut added = Vec::new();
    for seed in seed_ids {
        let mut queue = VecDeque::from([(seed.clone(), vec![seed.clone()], 0_usize)]);
        let mut seen = HashSet::from([seed.clone()]);
        while let Some((concept_id, path, depth)) = queue.pop_front() {
            if depth >= 2 {
                continue;
            }
            for neighbor in links_by_concept
                .get(concept_id.as_str())
                .into_iter()
                .flat_map(|values| values.iter().copied())
            {
                if !seen.insert(neighbor.to_string()) {
                    continue;
                }
                let mut next_path = path.clone();
                next_path.push(neighbor.to_string());
                if let Some(units) = units_by_concept.get(neighbor) {
                    for unit in units.iter().take(1) {
                        if existing.contains(unit.section_id.as_str()) {
                            continue;
                        }
                        let graph = 80.0 / (depth + 1) as f64;
                        added.push(RetrievalCandidate {
                            unit: (*unit).clone(),
                            score: ScoreComponents {
                                exact: 0.0,
                                lexical: 0.0,
                                graph,
                                coverage: 0.0,
                                authority: authority_score(unit),
                                total: graph + authority_score(unit),
                            },
                            matched_terms: Vec::new(),
                            relationship_path: next_path.clone(),
                            inferred_relationship: false,
                        });
                    }
                }
                queue.push_back((neighbor.to_string(), next_path, depth + 1));
            }
        }
    }
    candidates.extend(added);
}

fn coverage_balance(candidates: &mut [RetrievalCandidate]) {
    let mut seen_types = HashSet::new();
    let mut seen_concepts = HashSet::new();
    for candidate in candidates {
        if seen_types.insert(candidate.unit.concept_type.clone()) {
            candidate.score.coverage += 35.0;
        }
        if seen_concepts.insert(candidate.unit.concept_id.clone()) {
            candidate.score.coverage += 15.0;
        }
        candidate.score.total = candidate.score.exact
            + candidate.score.lexical
            + candidate.score.graph
            + candidate.score.coverage
            + candidate.score.authority;
    }
}

fn authority_score(unit: &super::RetrievalUnit) -> f64 {
    let source = unit.source_class.as_deref().unwrap_or_default();
    if matches!(source, "primary" | "authoritative" | "official") {
        20.0
    } else if unit.resource.is_some() || !unit.citations.is_empty() {
        5.0
    } else {
        0.0
    }
}

fn candidate_order(left: &RetrievalCandidate, right: &RetrievalCandidate) -> Ordering {
    right
        .score
        .total
        .total_cmp(&left.score.total)
        .then_with(|| left.unit.concept_id.cmp(&right.unit.concept_id))
        .then_with(|| {
            left.unit
                .structural_ordinal
                .cmp(&right.unit.structural_ordinal)
        })
}

fn compile_context(
    manifest: &RetrievalManifest,
    query: &str,
    candidates: &[RetrievalCandidate],
    budget: usize,
    route: RetrievalRoute,
    request: &RetrievalRequest,
) -> (EvidencePacket, Vec<RetrievalOmission>, HashSet<String>) {
    let snapshot = canonical_snapshot(manifest);
    if matches!(route, RetrievalRoute::FullContext)
        && request
            .provider_window_tokens
            .is_some_and(|window| snapshot.estimated_tokens <= window)
        && snapshot.estimated_tokens <= budget
    {
        let items = manifest
            .units
            .iter()
            .map(|unit| evidence_item(unit, Vec::new()))
            .collect::<Vec<_>>();
        let ids = items.iter().map(|item| item.section_id.clone()).collect();
        return (
            EvidencePacket {
                schema_version: RETRIEVAL_SCHEMA_VERSION,
                manifest_fingerprint: manifest.bundle_fingerprint.clone(),
                query: query.to_string(),
                estimated_tokens: snapshot.estimated_tokens,
                bytes: snapshot.bytes,
                caveats: caveats_for(&items, manifest),
                items,
                requires_abstention: false,
            },
            Vec::new(),
            ids,
        );
    }

    let mut items = Vec::new();
    let mut omissions = Vec::new();
    let mut included = HashSet::new();
    let mut content_hashes = HashSet::new();
    let mut used = 0;
    for candidate in candidates {
        if !content_hashes.insert(candidate.unit.content_hash.clone()) {
            omissions.push(omission(
                candidate,
                ExclusionReason::DuplicateEvidence,
                "An equivalent evidence body was already included.",
            ));
            continue;
        }
        if used + candidate.unit.token_estimate > budget {
            omissions.push(omission(
                candidate,
                ExclusionReason::ContextBudget,
                "The coherent unit did not fit the remaining context budget.",
            ));
            continue;
        }
        used += candidate.unit.token_estimate;
        included.insert(candidate.unit.section_id.clone());
        items.push(evidence_item(
            &candidate.unit,
            candidate.relationship_path.clone(),
        ));
    }
    let caveats = caveats_for(&items, manifest);
    let requires_abstention = items.is_empty()
        || caveats
            .iter()
            .any(|caveat| caveat.kind == EvidenceCaveatKind::Conflict)
        || ((request.filters.source_class.is_some() || request.filters.owner.is_some())
            && items.iter().all(|item| {
                manifest
                    .units
                    .iter()
                    .find(|unit| unit.section_id == item.section_id)
                    .is_none_or(|unit| unit.source_class.is_none() && unit.owner.is_none())
            }));
    let bytes = items.iter().map(|item| item.text.len()).sum();
    (
        EvidencePacket {
            schema_version: RETRIEVAL_SCHEMA_VERSION,
            manifest_fingerprint: manifest.bundle_fingerprint.clone(),
            query: query.to_string(),
            items,
            caveats,
            estimated_tokens: used,
            bytes,
            requires_abstention,
        },
        omissions,
        included,
    )
}

fn evidence_item(unit: &super::RetrievalUnit, relationship_path: Vec<String>) -> EvidenceItem {
    EvidenceItem {
        section_id: unit.section_id.clone(),
        concept_id: unit.concept_id.clone(),
        concept_title: unit.concept_title.clone(),
        heading_path: unit.heading_path.clone(),
        source_range: unit.source_range.clone(),
        text: unit.text.clone(),
        citations: unit.citations.clone(),
        relationship_path,
        token_estimate: unit.token_estimate,
    }
}

fn caveats_for(items: &[EvidenceItem], manifest: &RetrievalManifest) -> Vec<EvidenceCaveat> {
    let mut caveats = Vec::new();
    let included = items
        .iter()
        .filter_map(|item| {
            manifest
                .units
                .iter()
                .find(|unit| unit.section_id == item.section_id)
        })
        .collect::<Vec<_>>();
    let mut by_heading = BTreeMap::<String, Vec<&super::RetrievalUnit>>::new();
    for unit in &included {
        let key = unit
            .heading_path
            .last()
            .cloned()
            .unwrap_or_else(|| unit.concept_title.clone())
            .to_lowercase();
        by_heading.entry(key).or_default().push(unit);
        if unit.health.broken_link_count > 0 {
            caveats.push(EvidenceCaveat {
                kind: EvidenceCaveatKind::BrokenLink,
                concept_ids: vec![unit.concept_id.clone()],
                message: format!(
                    "{} has {} unresolved bundle link(s).",
                    unit.concept_title, unit.health.broken_link_count
                ),
            });
        }
        if !unit.links.is_empty() && items.iter().any(|item| item.relationship_path.len() > 1) {
            caveats.push(EvidenceCaveat {
                kind: EvidenceCaveatKind::InferredRelationship,
                concept_ids: vec![unit.concept_id.clone()],
                message: "The route followed an authored OKF link; the link itself does not imply a causal relationship.".to_string(),
            });
        }
    }
    for units in by_heading.values().filter(|units| units.len() > 1) {
        let hashes = units
            .iter()
            .map(|unit| unit.content_hash.as_str())
            .collect::<HashSet<_>>();
        if hashes.len() > 1 {
            caveats.push(EvidenceCaveat {
                kind: EvidenceCaveatKind::Conflict,
                concept_ids: units.iter().map(|unit| unit.concept_id.clone()).collect(),
                message: "Multiple sources make different claims under the same heading; no silent authority decision was made.".to_string(),
            });
        }
    }
    caveats.sort_by(|left, right| {
        format!("{:?}", left.kind)
            .cmp(&format!("{:?}", right.kind))
            .then_with(|| left.concept_ids.cmp(&right.concept_ids))
    });
    caveats.dedup();
    caveats
}

fn omission(
    candidate: &RetrievalCandidate,
    reason: ExclusionReason,
    detail: &str,
) -> RetrievalOmission {
    RetrievalOmission {
        section_id: candidate.unit.section_id.clone(),
        concept_id: candidate.unit.concept_id.clone(),
        reason,
        detail: detail.to_string(),
    }
}

fn cache_receipt(
    request: &RetrievalRequest,
    route: RetrievalRoute,
    snapshot: &super::CanonicalSnapshot,
) -> CacheReceipt {
    let eligible = request.cache_provider_id.is_some()
        && request.allow_remote_text
        && request
            .provider_window_tokens
            .is_some_and(|window| snapshot.estimated_tokens <= window)
        && matches!(route, RetrievalRoute::FullContext);
    CacheReceipt {
        eligible,
        cache_id: eligible.then(|| {
            stable_hash(&[
                "okf-cache-v1",
                snapshot.snapshot_id.as_str(),
                request.cache_provider_id.as_deref().unwrap_or_default(),
            ])
        }),
        state: if eligible {
            "eligible-not-created"
        } else if request.cache_provider_id.is_none() {
            "provider-unavailable"
        } else if !request.allow_remote_text {
            "disclosure-not-granted"
        } else {
            "snapshot-too-large-or-route-ineligible"
        }
        .to_string(),
        provider_id: request.cache_provider_id.clone(),
        scope_fingerprint: snapshot.manifest_fingerprint.clone(),
    }
}

fn tokenize(text: &str) -> Vec<String> {
    text.split(|character: char| !character.is_alphanumeric())
        .map(str::to_lowercase)
        .filter(|token| token.chars().count() > 1)
        .collect()
}

fn contains_any(haystack: &str, needles: &[&str]) -> bool {
    needles.iter().any(|needle| haystack.contains(needle))
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{Concept, Confidence};
    use std::collections::BTreeMap;

    #[test]
    fn exact_identity_beats_repeated_prose_mentions() {
        let bundle = bundle(vec![
            concept(
                "metrics/revenue",
                "Revenue",
                "Metric",
                "# Revenue\n\nNet recognized revenue.",
            ),
            concept(
                "guides/reporting",
                "Reporting",
                "Guide",
                "# Reporting\n\nRevenue revenue revenue revenue.",
            ),
        ]);
        let result = retrieve(
            &bundle,
            &RetrievalRequest {
                query: "metrics/revenue".to_string(),
                ..RetrievalRequest::default()
            },
        );

        assert_eq!(result.receipt.route, RetrievalRoute::ExactLexical);
        assert_eq!(result.evidence.items[0].concept_id, "metrics/revenue");
        assert!(result.receipt.candidates[0].score.exact >= 10_000.0);
    }

    #[test]
    fn graph_route_includes_bounded_connected_evidence_with_a_path() {
        let mut a = concept("a", "Alpha", "Topic", "# Alpha\n\nRoot signal.");
        a.links = vec!["b".to_string()];
        let mut b = concept("b", "Beta", "Topic", "# Beta\n\nConnected evidence.");
        b.cited_by = vec!["a".to_string()];
        let result = retrieve(
            &bundle(vec![a, b]),
            &RetrievalRequest {
                query: "What is related to root signal?".to_string(),
                ..RetrievalRequest::default()
            },
        );

        assert_eq!(result.receipt.route, RetrievalRoute::LexicalGraph);
        let connected = result
            .receipt
            .candidates
            .iter()
            .find(|candidate| candidate.concept_id == "b")
            .expect("graph expansion should include b");
        assert_eq!(connected.relationship_path, ["a", "b"]);
    }

    #[test]
    fn context_budget_omits_whole_units_and_records_the_reason() {
        let result = retrieve(
            &bundle(vec![
                concept(
                    "a",
                    "Alpha",
                    "Topic",
                    &format!("# Alpha\n\n{}", "alpha ".repeat(80)),
                ),
                concept(
                    "b",
                    "Beta",
                    "Topic",
                    &format!("# Beta\n\n{}", "alpha ".repeat(80)),
                ),
            ]),
            &RetrievalRequest {
                query: "alpha".to_string(),
                context_budget_tokens: 100,
                ..RetrievalRequest::default()
            },
        );

        assert!(result.evidence.items.len() <= 1);
        assert!(result
            .receipt
            .omissions
            .iter()
            .any(|item| item.reason == ExclusionReason::ContextBudget));
    }

    #[test]
    fn semantic_query_degrades_to_local_without_sharing_text() {
        let result = retrieve(
            &bundle(vec![concept(
                "a",
                "Alpha",
                "Topic",
                "# Alpha\n\nMeaning and intent.",
            )]),
            &RetrievalRequest {
                query: "Discover conceptually similar knowledge".to_string(),
                ..RetrievalRequest::default()
            },
        );

        assert_eq!(result.receipt.route, RetrievalRoute::HybridFallback);
        assert!(result.receipt.providers.iter().any(|provider| {
            provider.capability == "dense-retrieval"
                && provider.state == ProviderState::Unavailable
                && !provider.remote_text_shared
        }));
    }

    #[test]
    fn authority_filter_abstains_when_required_metadata_is_absent() {
        let result = retrieve(
            &bundle(vec![concept("a", "Alpha", "Topic", "# Alpha\n\nA claim.")]),
            &RetrievalRequest {
                query: "current alpha".to_string(),
                filters: RetrievalFilters {
                    source_class: Some("official".to_string()),
                    ..RetrievalFilters::default()
                },
                ..RetrievalRequest::default()
            },
        );

        assert!(result.evidence.items.is_empty());
        assert!(result.evidence.requires_abstention);
        assert_eq!(
            result.diagnostic.class,
            super::super::DiagnosticClass::FilterMismatch
        );
    }

    fn concept(id: &str, title: &str, concept_type: &str, body: &str) -> Concept {
        Concept {
            id: id.to_string(),
            concept_type: concept_type.to_string(),
            title: title.to_string(),
            description: format!("{title} description"),
            tags: Vec::new(),
            timestamp: None,
            resource: None,
            extra: BTreeMap::new(),
            body: body.to_string(),
            links: Vec::new(),
            external_links: Vec::new(),
            broken_links: Vec::new(),
            cited_by: Vec::new(),
            degree: 0,
        }
    }

    fn bundle(concepts: Vec<Concept>) -> Bundle {
        Bundle {
            root: String::new(),
            name: "Fixture".to_string(),
            okf_version: Some("0.1".to_string()),
            odsf_version: None,
            concepts,
            indexes: Vec::new(),
            log: Vec::new(),
            issues: Vec::new(),
            confidence: Confidence::Confident,
        }
    }
}
