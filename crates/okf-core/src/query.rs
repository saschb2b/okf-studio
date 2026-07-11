//! Bounded, deterministic bundle queries used by Studio's agent tools.

use crate::{Bundle, Concept};
use serde::Serialize;
use std::collections::{HashMap, HashSet, VecDeque};

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
    use crate::{Concept, Confidence};
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
        }
    }

    fn bundle(concepts: Vec<Concept>) -> Bundle {
        Bundle {
            root: String::new(),
            name: "Test".to_string(),
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
