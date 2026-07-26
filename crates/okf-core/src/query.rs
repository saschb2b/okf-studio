//! Bounded, deterministic bundle queries used by Studio's agent tools.

use crate::{Bundle, Concept, Confidence, IssueLevel};
use serde::Serialize;
use std::collections::{BTreeMap, HashMap, HashSet, VecDeque};

const MAX_SNIPPET_CHARS: usize = 240;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchMatch {
    pub id: String,
    pub title: String,
    #[serde(rename = "type")]
    pub concept_type: String,
    pub description: String,
    pub snippet: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CountByValue {
    pub value: String,
    pub count: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InventoryConcept {
    pub id: String,
    pub title: String,
    #[serde(rename = "type")]
    pub concept_type: String,
    pub description: String,
    pub tags: Vec<String>,
    pub outgoing_links: usize,
    pub incoming_links: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InventoryResult {
    pub name: String,
    pub okf_version: Option<String>,
    pub odsf_version: Option<String>,
    pub extra: BTreeMap<String, serde_json::Value>,
    pub confidence: String,
    pub concept_count: usize,
    pub matching_count: usize,
    pub error_count: usize,
    pub warning_count: usize,
    pub types: Vec<CountByValue>,
    pub tags: Vec<CountByValue>,
    pub concepts: Vec<InventoryConcept>,
    pub next_offset: Option<usize>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConceptReadResult {
    pub id: String,
    pub title: String,
    #[serde(rename = "type")]
    pub concept_type: String,
    pub description: String,
    pub tags: Vec<String>,
    pub timestamp: Option<String>,
    pub resource: Option<String>,
    pub total_lines: usize,
    pub start_line: usize,
    pub content: String,
    pub next_line: Option<usize>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceReference {
    pub uri: String,
    pub kinds: Vec<String>,
    pub concept_ids: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceResult {
    pub matching_count: usize,
    pub sources: Vec<SourceReference>,
    pub next_offset: Option<usize>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ValidationLevel {
    All,
    Error,
    Warning,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ValidationIssue {
    pub concept_id: Option<String>,
    pub level: String,
    pub message: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ValidationResult {
    pub error_count: usize,
    pub warning_count: usize,
    pub matching_count: usize,
    pub issues: Vec<ValidationIssue>,
    pub next_offset: Option<usize>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TraversalDirection {
    Outgoing,
    Incoming,
    Both,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TraversalConcept {
    pub id: String,
    pub title: String,
    #[serde(rename = "type")]
    pub concept_type: String,
    pub depth: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TraversalEdge {
    pub source: String,
    pub target: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TraversalResult {
    pub concepts: Vec<TraversalConcept>,
    pub edges: Vec<TraversalEdge>,
    pub truncated: bool,
}

/// Search concept identity, metadata, and Markdown body. Results are scored so
/// identity matches precede prose matches and remain stable between calls.
pub fn search(bundle: &Bundle, query: &str, limit: usize) -> Vec<SearchMatch> {
    let needle = query.trim().to_lowercase();
    if needle.is_empty() || limit == 0 {
        return Vec::new();
    }
    let mut matches = bundle
        .concepts
        .iter()
        .filter_map(|concept| match_score(concept, &needle).map(|score| (score, concept)))
        .collect::<Vec<_>>();
    matches.sort_by(|(left_score, left), (right_score, right)| {
        right_score
            .cmp(left_score)
            .then_with(|| left.title.cmp(&right.title))
            .then_with(|| left.id.cmp(&right.id))
    });
    matches
        .into_iter()
        .take(limit)
        .map(|(_, concept)| SearchMatch {
            id: concept.id.clone(),
            title: concept.title.clone(),
            concept_type: concept.concept_type.clone(),
            description: concept.description.clone(),
            snippet: matching_snippet(concept, &needle),
        })
        .collect()
}

/// Summarize and page the bundle inventory. Filters are case-insensitive;
/// prefix matches concept IDs, while type and tag require exact values.
pub fn inventory(
    bundle: &Bundle,
    prefix: Option<&str>,
    concept_type: Option<&str>,
    tag: Option<&str>,
    offset: usize,
    limit: usize,
) -> InventoryResult {
    let prefix = normalized_filter(prefix);
    let concept_type = normalized_filter(concept_type);
    let tag = normalized_filter(tag);
    let concepts = bundle
        .concepts
        .iter()
        .filter(|concept| {
            prefix
                .as_ref()
                .is_none_or(|value| concept.id.to_lowercase().starts_with(value))
                && concept_type
                    .as_ref()
                    .is_none_or(|value| concept.concept_type.to_lowercase() == value.as_str())
                && tag.as_ref().is_none_or(|value| {
                    concept
                        .tags
                        .iter()
                        .any(|item| item.to_lowercase() == *value)
                })
        })
        .collect::<Vec<_>>();
    let matching_count = concepts.len();
    let page = concepts
        .into_iter()
        .skip(offset)
        .take(limit)
        .map(inventory_concept)
        .collect::<Vec<_>>();
    let next_offset = (offset + page.len() < matching_count).then_some(offset + page.len());
    let (error_count, warning_count) = issue_counts(bundle);
    InventoryResult {
        name: bundle.name.clone(),
        okf_version: bundle.okf_version.clone(),
        odsf_version: bundle.odsf_version.clone(),
        extra: bundle.extra.clone(),
        confidence: match bundle.confidence {
            Confidence::Confident => "confident",
            Confidence::Candidate => "candidate",
        }
        .to_string(),
        concept_count: bundle.concepts.len(),
        matching_count,
        error_count,
        warning_count,
        types: counts(bundle.concepts.iter().map(|concept| &concept.concept_type)),
        tags: counts(bundle.concepts.iter().flat_map(|concept| &concept.tags)),
        concepts: page,
        next_offset,
    }
}

/// Read a line-bounded page of one parsed concept body with its core metadata.
pub fn read_concept(
    bundle: &Bundle,
    concept_id: &str,
    start_line: usize,
    limit: usize,
) -> Option<ConceptReadResult> {
    let concept = bundle.concepts.iter().find(|item| item.id == concept_id)?;
    let lines = concept.body.split_inclusive('\n').collect::<Vec<_>>();
    let total_lines = lines.len();
    let start_index = start_line.saturating_sub(1).min(total_lines);
    let content = lines
        .iter()
        .skip(start_index)
        .take(limit)
        .copied()
        .collect::<String>();
    let consumed = limit.min(total_lines.saturating_sub(start_index));
    let next_index = start_index + consumed;
    Some(ConceptReadResult {
        id: concept.id.clone(),
        title: concept.title.clone(),
        concept_type: concept.concept_type.clone(),
        description: concept.description.clone(),
        tags: concept.tags.clone(),
        timestamp: concept.timestamp.clone(),
        resource: concept.resource.clone(),
        total_lines,
        start_line: start_index + 1,
        content,
        next_line: (next_index < total_lines).then_some(next_index + 1),
    })
}

/// Deduplicate canonical resources and external citations across the bundle.
/// An optional concept ID restricts discovery to one parsed concept.
pub fn sources(
    bundle: &Bundle,
    concept_id: Option<&str>,
    offset: usize,
    limit: usize,
) -> SourceResult {
    let mut by_uri = BTreeMap::<String, (HashSet<String>, HashSet<String>)>::new();
    for concept in bundle
        .concepts
        .iter()
        .filter(|concept| concept_id.is_none_or(|id| concept.id == id))
    {
        if let Some(resource) = concept.resource.as_deref().filter(|uri| !uri.is_empty()) {
            let entry = by_uri.entry(resource.to_string()).or_default();
            entry.0.insert("resource".to_string());
            entry.1.insert(concept.id.clone());
        }
        for citation in concept.external_links.iter().filter(|uri| !uri.is_empty()) {
            let entry = by_uri.entry(citation.clone()).or_default();
            entry.0.insert("citation".to_string());
            entry.1.insert(concept.id.clone());
        }
    }
    let matching_count = by_uri.len();
    let sources = by_uri
        .into_iter()
        .skip(offset)
        .take(limit)
        .map(|(uri, (kinds, concept_ids))| SourceReference {
            uri,
            kinds: sorted_values(kinds),
            concept_ids: sorted_values(concept_ids),
        })
        .collect::<Vec<_>>();
    let next_offset = (offset + sources.len() < matching_count).then_some(offset + sources.len());
    SourceResult {
        matching_count,
        sources,
        next_offset,
    }
}

/// Return a bounded page of the validator output already computed while the
/// bundle was parsed.
pub fn validation_issues(
    bundle: &Bundle,
    level: ValidationLevel,
    offset: usize,
    limit: usize,
) -> ValidationResult {
    let (error_count, warning_count) = issue_counts(bundle);
    let matching = bundle
        .issues
        .iter()
        .filter(|issue| match level {
            ValidationLevel::All => true,
            ValidationLevel::Error => issue.level == IssueLevel::Error,
            ValidationLevel::Warning => issue.level == IssueLevel::Warning,
        })
        .collect::<Vec<_>>();
    let matching_count = matching.len();
    let issues = matching
        .into_iter()
        .skip(offset)
        .take(limit)
        .map(|issue| ValidationIssue {
            concept_id: issue.concept_id.clone(),
            level: match issue.level {
                IssueLevel::Error => "error",
                IssueLevel::Warning => "warning",
            }
            .to_string(),
            message: issue.message.clone(),
        })
        .collect::<Vec<_>>();
    let next_offset = (offset + issues.len() < matching_count).then_some(offset + issues.len());
    ValidationResult {
        error_count,
        warning_count,
        matching_count,
        issues,
        next_offset,
    }
}

/// Traverse resolved OKF links from one concept with a cycle-safe breadth-first
/// search. The start concept is always first and has depth zero.
pub fn traverse(
    bundle: &Bundle,
    start_id: &str,
    direction: TraversalDirection,
    max_depth: usize,
    limit: usize,
) -> Option<TraversalResult> {
    let by_id = bundle
        .concepts
        .iter()
        .map(|concept| (concept.id.as_str(), concept))
        .collect::<HashMap<_, _>>();
    let start = *by_id.get(start_id)?;
    if limit == 0 {
        return Some(TraversalResult {
            concepts: Vec::new(),
            edges: Vec::new(),
            truncated: true,
        });
    }

    let mut concepts = vec![traversal_concept(start, 0)];
    let mut edges = Vec::new();
    let mut seen = HashSet::from([start.id.as_str()]);
    let mut queue = VecDeque::from([(start, 0_usize)]);
    let mut truncated = false;

    while let Some((concept, depth)) = queue.pop_front() {
        if depth >= max_depth {
            continue;
        }
        for (source_id, target_id, neighbor_id) in neighbor_edges(concept, direction) {
            let Some(neighbor) = by_id.get(neighbor_id).copied() else {
                continue;
            };
            if !seen.contains(neighbor.id.as_str()) {
                if concepts.len() >= limit {
                    truncated = true;
                    continue;
                }
                seen.insert(neighbor.id.as_str());
                concepts.push(traversal_concept(neighbor, depth + 1));
                queue.push_back((neighbor, depth + 1));
            }
            edges.push(TraversalEdge {
                source: source_id.to_string(),
                target: target_id.to_string(),
            });
        }
    }
    edges.sort_by(|left, right| {
        left.source
            .cmp(&right.source)
            .then_with(|| left.target.cmp(&right.target))
    });
    edges.dedup();
    Some(TraversalResult {
        concepts,
        edges,
        truncated,
    })
}

fn match_score(concept: &Concept, needle: &str) -> Option<u8> {
    let fields = [
        (100, concept.title.to_lowercase()),
        (90, concept.id.to_lowercase()),
        (70, concept.concept_type.to_lowercase()),
        (60, concept.tags.join(" ").to_lowercase()),
        (50, concept.description.to_lowercase()),
        (10, concept.body.to_lowercase()),
    ];
    fields
        .into_iter()
        .find_map(|(score, field)| field.contains(needle).then_some(score))
}

fn normalized_filter(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|item| !item.is_empty())
        .map(str::to_lowercase)
}

fn inventory_concept(concept: &Concept) -> InventoryConcept {
    InventoryConcept {
        id: concept.id.clone(),
        title: concept.title.clone(),
        concept_type: concept.concept_type.clone(),
        description: concept.description.clone(),
        tags: concept.tags.clone(),
        outgoing_links: concept.links.len(),
        incoming_links: concept.cited_by.len(),
    }
}

fn counts<'a>(values: impl Iterator<Item = &'a String>) -> Vec<CountByValue> {
    let mut counts = BTreeMap::<String, usize>::new();
    for value in values.filter(|value| !value.is_empty()) {
        *counts.entry(value.clone()).or_default() += 1;
    }
    let mut result = counts
        .into_iter()
        .map(|(value, count)| CountByValue { value, count })
        .collect::<Vec<_>>();
    result.sort_by(|left, right| {
        right
            .count
            .cmp(&left.count)
            .then_with(|| left.value.cmp(&right.value))
    });
    result
}

fn sorted_values(values: HashSet<String>) -> Vec<String> {
    let mut values = values.into_iter().collect::<Vec<_>>();
    values.sort();
    values
}

fn issue_counts(bundle: &Bundle) -> (usize, usize) {
    bundle.issues.iter().fold((0, 0), |counts, issue| {
        if issue.level == IssueLevel::Error {
            (counts.0 + 1, counts.1)
        } else {
            (counts.0, counts.1 + 1)
        }
    })
}

fn matching_snippet(concept: &Concept, needle: &str) -> String {
    let source = concept
        .body
        .lines()
        .find(|line| line.to_lowercase().contains(needle))
        .unwrap_or(&concept.description)
        .trim();
    let mut snippet = source.chars().take(MAX_SNIPPET_CHARS).collect::<String>();
    if source.chars().count() > MAX_SNIPPET_CHARS {
        snippet.push('…');
    }
    snippet
}

fn neighbor_edges(concept: &Concept, direction: TraversalDirection) -> Vec<(&str, &str, &str)> {
    let mut edges = Vec::new();
    if matches!(
        direction,
        TraversalDirection::Outgoing | TraversalDirection::Both
    ) {
        edges.extend(
            concept
                .links
                .iter()
                .map(|target| (concept.id.as_str(), target.as_str(), target.as_str())),
        );
    }
    if matches!(
        direction,
        TraversalDirection::Incoming | TraversalDirection::Both
    ) {
        edges.extend(
            concept
                .cited_by
                .iter()
                .map(|source| (source.as_str(), concept.id.as_str(), source.as_str())),
        );
    }
    edges
}

fn traversal_concept(concept: &Concept, depth: usize) -> TraversalConcept {
    TraversalConcept {
        id: concept.id.clone(),
        title: concept.title.clone(),
        concept_type: concept.concept_type.clone(),
        depth,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{Concept, Confidence, Issue};
    use std::collections::BTreeMap;

    #[test]
    fn search_prioritizes_identity_and_bounds_snippets() {
        let bundle = bundle(vec![
            concept(
                "tables/orders",
                "Orders",
                "Table",
                "Daily revenue",
                vec!["metrics/revenue"],
            ),
            concept(
                "metrics/revenue",
                "Revenue",
                "Metric",
                "Order revenue definition",
                vec![],
            ),
        ]);
        let results = search(&bundle, "revenue", 10);
        assert_eq!(
            results
                .iter()
                .map(|item| item.id.as_str())
                .collect::<Vec<_>>(),
            ["metrics/revenue", "tables/orders"]
        );
        assert!(results
            .iter()
            .all(|item| item.snippet.chars().count() <= MAX_SNIPPET_CHARS + 1));
        assert!(search(&bundle, "", 10).is_empty());
    }

    #[test]
    fn traversal_is_cycle_safe_directional_and_depth_bounded() {
        let mut bundle = bundle(vec![
            concept("a", "A", "Topic", "", vec!["b"]),
            concept("b", "B", "Topic", "", vec!["c"]),
            concept("c", "C", "Topic", "", vec!["a"]),
        ]);
        crate::graph::link_graph(&mut bundle.concepts);
        let result = traverse(&bundle, "a", TraversalDirection::Outgoing, 1, 10).unwrap();
        assert_eq!(
            result
                .concepts
                .iter()
                .map(|item| item.id.as_str())
                .collect::<Vec<_>>(),
            ["a", "b"]
        );
        let incoming = traverse(&bundle, "a", TraversalDirection::Incoming, 2, 10).unwrap();
        assert_eq!(
            incoming
                .concepts
                .iter()
                .map(|item| item.id.as_str())
                .collect::<Vec<_>>(),
            ["a", "c", "b"]
        );
        assert!(traverse(&bundle, "missing", TraversalDirection::Both, 2, 10).is_none());
        assert!(incoming
            .edges
            .iter()
            .any(|edge| edge.source == "c" && edge.target == "a"));
        let capped = traverse(&bundle, "a", TraversalDirection::Both, 3, 1).unwrap();
        assert!(capped.truncated);
        assert!(capped.edges.is_empty());
    }

    #[test]
    fn inventory_filters_counts_and_pages_without_paths() {
        let mut orders = concept("tables/orders", "Orders", "Table", "", vec![]);
        orders.tags = vec!["commerce".to_string(), "core".to_string()];
        let mut customers = concept("tables/customers", "Customers", "Table", "", vec![]);
        customers.tags = vec!["commerce".to_string()];
        let metric = concept("metrics/revenue", "Revenue", "Metric", "", vec![]);
        let bundle = bundle(vec![metric, customers, orders]);

        let first = inventory(
            &bundle,
            Some("tables/"),
            Some("table"),
            Some("commerce"),
            0,
            1,
        );
        assert_eq!(first.concept_count, 3);
        assert_eq!(first.matching_count, 2);
        assert_eq!(first.concepts.len(), 1);
        assert_eq!(first.next_offset, Some(1));
        assert_eq!(
            first.types[0],
            CountByValue {
                value: "Table".to_string(),
                count: 2
            }
        );
        assert_eq!(
            first.tags[0],
            CountByValue {
                value: "commerce".to_string(),
                count: 2
            }
        );

        let second = inventory(&bundle, Some("tables/"), Some("TABLE"), None, 1, 1);
        assert_eq!(second.concepts[0].id, "tables/orders");
        assert_eq!(second.next_offset, None);
    }

    #[test]
    fn validation_filters_severity_and_pages() {
        let mut bundle = bundle(Vec::new());
        bundle.issues = vec![
            Issue {
                concept_id: Some("a".to_string()),
                level: IssueLevel::Error,
                message: "Missing type".to_string(),
            },
            Issue {
                concept_id: Some("b".to_string()),
                level: IssueLevel::Warning,
                message: "Broken link".to_string(),
            },
            Issue {
                concept_id: None,
                level: IssueLevel::Warning,
                message: "Missing index".to_string(),
            },
        ];
        let warnings = validation_issues(&bundle, ValidationLevel::Warning, 0, 1);
        assert_eq!(warnings.error_count, 1);
        assert_eq!(warnings.warning_count, 2);
        assert_eq!(warnings.matching_count, 2);
        assert_eq!(warnings.issues[0].level, "warning");
        assert_eq!(warnings.next_offset, Some(1));
    }

    #[test]
    fn concept_read_pages_body_lines_and_preserves_metadata() {
        let mut item = concept("guides/read", "Read", "Guide", "one\ntwo\nthree", vec![]);
        item.tags = vec!["agent".to_string()];
        item.resource = Some("https://example.com/read".to_string());
        let bundle = bundle(vec![item]);
        let first = read_concept(&bundle, "guides/read", 1, 2).unwrap();
        assert_eq!(first.content, "one\ntwo\n");
        assert_eq!(first.total_lines, 3);
        assert_eq!(first.next_line, Some(3));
        assert_eq!(first.resource.as_deref(), Some("https://example.com/read"));
        let last = read_concept(&bundle, "guides/read", 3, 2).unwrap();
        assert_eq!(last.content, "three");
        assert_eq!(last.next_line, None);
        assert!(read_concept(&bundle, "missing", 1, 2).is_none());
    }

    #[test]
    fn sources_deduplicate_kinds_concepts_and_page_stably() {
        let mut first = concept("a", "A", "Topic", "", vec![]);
        first.resource = Some("https://example.com/shared".to_string());
        first.external_links = vec![
            "https://example.com/citation".to_string(),
            "https://example.com/shared".to_string(),
        ];
        let mut second = concept("b", "B", "Topic", "", vec![]);
        second.external_links = vec!["https://example.com/shared".to_string()];
        let bundle = bundle(vec![second, first]);
        let result = sources(&bundle, None, 0, 10);
        assert_eq!(result.matching_count, 2);
        assert_eq!(result.sources[0].uri, "https://example.com/citation");
        assert_eq!(result.sources[1].kinds, ["citation", "resource"]);
        assert_eq!(result.sources[1].concept_ids, ["a", "b"]);
        let filtered = sources(&bundle, Some("a"), 1, 1);
        assert_eq!(filtered.matching_count, 2);
        assert_eq!(filtered.sources.len(), 1);
        assert_eq!(filtered.next_offset, None);
    }

    fn concept(id: &str, title: &str, concept_type: &str, body: &str, links: Vec<&str>) -> Concept {
        Concept {
            id: id.to_string(),
            concept_type: concept_type.to_string(),
            title: title.to_string(),
            description: String::new(),
            tags: Vec::new(),
            timestamp: None,
            resource: None,
            extra: BTreeMap::new(),
            body: body.to_string(),
            links: links.into_iter().map(str::to_string).collect(),
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
            name: "Test".to_string(),
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
}
