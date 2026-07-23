use super::{
    CanonicalSnapshot, RetrievalClaimCitation, RetrievalEvidenceSource, RetrievalHealth,
    RetrievalManifest, RetrievalUnit, RetrievalUnitKind, SourceRange, RETRIEVAL_PRODUCER,
    RETRIEVAL_SCHEMA_VERSION,
};
use crate::evidence;
use crate::{Bundle, Concept};
use sha2::{Digest, Sha256};

pub fn build_manifest(bundle: &Bundle) -> RetrievalManifest {
    let bundle_id = stable_hash(&[
        bundle.name.as_str(),
        bundle.okf_version.as_deref().unwrap_or(""),
    ]);
    let mut units = bundle
        .concepts
        .iter()
        .flat_map(section_concept)
        .collect::<Vec<_>>();
    units.sort_by(|left, right| {
        left.concept_id
            .cmp(&right.concept_id)
            .then_with(|| left.structural_ordinal.cmp(&right.structural_ordinal))
    });
    let fingerprint_input = units
        .iter()
        .flat_map(|unit| [unit.section_id.as_str(), unit.content_hash.as_str()])
        .collect::<Vec<_>>();
    let bundle_fingerprint = stable_hash(&fingerprint_input);
    RetrievalManifest {
        schema_version: RETRIEVAL_SCHEMA_VERSION,
        producer: RETRIEVAL_PRODUCER.to_string(),
        bundle_id,
        bundle_name: bundle.name.clone(),
        bundle_fingerprint,
        concept_count: bundle.concepts.len(),
        unit_count: units.len(),
        units,
    }
}

pub fn canonical_snapshot(manifest: &RetrievalManifest) -> CanonicalSnapshot {
    let text = manifest
        .units
        .iter()
        .map(|unit| {
            let heading = if unit.heading_path.is_empty() {
                unit.concept_title.clone()
            } else {
                format!("{} / {}", unit.concept_title, unit.heading_path.join(" / "))
            };
            format!(
                "<!-- okf:{}#{} -->\n## {}\n\n{}",
                unit.concept_id, unit.section_id, heading, unit.text
            )
        })
        .collect::<Vec<_>>()
        .join("\n\n");
    CanonicalSnapshot {
        manifest_fingerprint: manifest.bundle_fingerprint.clone(),
        snapshot_id: stable_hash(&[
            "okf-canonical-snapshot-v1",
            manifest.bundle_id.as_str(),
            manifest.bundle_fingerprint.as_str(),
        ]),
        estimated_tokens: estimate_tokens(&text),
        bytes: text.len(),
        text,
    }
}

fn section_concept(concept: &Concept) -> Vec<RetrievalUnit> {
    let authored_evidence = evidence::inspect(concept);
    let evidence_sources = authored_evidence
        .sources
        .iter()
        .map(|source| RetrievalEvidenceSource {
            source_id: source.id.clone(),
            title: source.title.clone(),
            uri: source.uri.clone(),
            locator: source.locator.clone(),
            observed_at: source.observed_at.clone(),
            source_digest: source.source_digest.clone(),
            evidence_digest: source.evidence_digest.clone(),
            adapter_id: source.adapter_id.clone(),
            adapter_version: source.adapter_version,
            media_type: source.media_type.clone(),
            last_checked_at: source.last_checked_at.clone(),
            last_status: source.last_status.clone(),
            last_fingerprint: source.last_fingerprint.clone(),
        })
        .collect::<Vec<_>>();
    let sections = structural_sections(&concept.body);
    let sections = if sections.is_empty() {
        vec![SectionDraft {
            heading_path: Vec::new(),
            start_line: 1,
            end_line: 1,
            text: concept.description.clone(),
        }]
    } else {
        sections
    };
    sections
        .into_iter()
        .enumerate()
        .map(|(ordinal, section)| {
            let content_hash = stable_hash(&[section.text.as_str()]);
            let heading_key = section.heading_path.join("/");
            let section_id = stable_hash(&[
                concept.id.as_str(),
                heading_key.as_str(),
                ordinal.to_string().as_str(),
                content_hash.as_str(),
            ]);
            let kind = if contains_markdown_table(&section.text) {
                RetrievalUnitKind::Table
            } else if section.heading_path.is_empty() {
                RetrievalUnitKind::Introduction
            } else {
                RetrievalUnitKind::Section
            };
            let claim_citations = authored_evidence
                .citations
                .iter()
                .filter(|citation| (section.start_line..=section.end_line).contains(&citation.line))
                .map(|citation| RetrievalClaimCitation {
                    source_id: citation.source_id.clone(),
                    line: citation.line,
                })
                .collect();
            RetrievalUnit {
                section_id,
                content_hash,
                concept_id: concept.id.clone(),
                concept_title: concept.title.clone(),
                concept_type: concept.concept_type.clone(),
                heading_path: section.heading_path,
                structural_ordinal: ordinal,
                kind,
                source_range: SourceRange {
                    start_line: section.start_line,
                    end_line: section.end_line,
                },
                token_estimate: estimate_tokens(&section.text),
                text: section.text,
                tags: concept.tags.clone(),
                timestamp: concept.timestamp.clone(),
                effective_time: extra_string(concept, "effective_from")
                    .or_else(|| extra_string(concept, "effective_time")),
                effective_until: extra_string(concept, "effective_until"),
                review_after: extra_string(concept, "review_after"),
                lifecycle: extra_string(concept, "lifecycle"),
                confidence: extra_confidence(concept),
                source_class: extra_string(concept, "source_class"),
                owner: extra_string(concept, "owner"),
                supersedes: extra_strings(concept, "supersedes"),
                superseded_by: extra_strings(concept, "superseded_by"),
                contradicts: extra_strings(concept, "contradicts"),
                resource: concept.resource.clone(),
                citations: concept.external_links.clone(),
                evidence_sources: evidence_sources.clone(),
                claim_citations,
                links: concept.links.clone(),
                backlinks: concept.cited_by.clone(),
                health: RetrievalHealth {
                    broken_link_count: concept.broken_links.len(),
                    missing_description: concept.description.trim().is_empty(),
                    missing_timestamp: concept.timestamp.is_none(),
                },
            }
        })
        .collect()
}

fn extra_confidence(concept: &Concept) -> Option<String> {
    match concept.extra.get("confidence") {
        Some(serde_json::Value::Number(value)) => Some(value.to_string()),
        Some(serde_json::Value::String(value)) => {
            let trimmed = value.trim();
            (!trimmed.is_empty()).then(|| trimmed.to_string())
        }
        _ => None,
    }
}

fn extra_string(concept: &Concept, key: &str) -> Option<String> {
    concept
        .extra
        .get(key)
        .and_then(serde_json::Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

fn extra_strings(concept: &Concept, key: &str) -> Vec<String> {
    match concept.extra.get(key) {
        Some(serde_json::Value::String(value)) => vec![value.clone()],
        Some(serde_json::Value::Array(values)) => values
            .iter()
            .filter_map(serde_json::Value::as_str)
            .map(str::to_string)
            .collect(),
        _ => Vec::new(),
    }
}

#[derive(Debug)]
struct SectionDraft {
    heading_path: Vec<String>,
    start_line: usize,
    end_line: usize,
    text: String,
}

fn structural_sections(markdown: &str) -> Vec<SectionDraft> {
    let lines = markdown.lines().collect::<Vec<_>>();
    if lines.is_empty() {
        return Vec::new();
    }
    let mut drafts = Vec::new();
    let mut heading_stack = Vec::<String>::new();
    let mut current_start = 1;
    let mut current_path = Vec::new();
    let mut current_lines = Vec::<&str>::new();
    let mut in_fence = false;

    for (index, line) in lines.iter().enumerate() {
        let trimmed = line.trim_start();
        if trimmed.starts_with("```") || trimmed.starts_with("~~~") {
            in_fence = !in_fence;
        }
        let heading = (!in_fence).then(|| parse_heading(line)).flatten();
        if let Some((level, title)) = heading {
            push_section(
                &mut drafts,
                &current_path,
                current_start,
                index,
                &current_lines,
            );
            heading_stack.truncate(level.saturating_sub(1));
            while heading_stack.len() < level.saturating_sub(1) {
                heading_stack.push(String::new());
            }
            heading_stack.push(title);
            current_path = heading_stack
                .iter()
                .filter(|part| !part.is_empty())
                .cloned()
                .collect();
            current_start = index + 1;
            current_lines = vec![line];
        } else {
            current_lines.push(line);
        }
    }
    push_section(
        &mut drafts,
        &current_path,
        current_start,
        lines.len(),
        &current_lines,
    );
    drafts
}

fn push_section(
    drafts: &mut Vec<SectionDraft>,
    heading_path: &[String],
    start_line: usize,
    end_line: usize,
    lines: &[&str],
) {
    let text = lines.join("\n").trim().to_string();
    if text.is_empty() {
        return;
    }
    drafts.push(SectionDraft {
        heading_path: heading_path.to_vec(),
        start_line,
        end_line: end_line.max(start_line),
        text,
    });
}

fn parse_heading(line: &str) -> Option<(usize, String)> {
    let trimmed = line.trim_start();
    let count = trimmed
        .chars()
        .take_while(|character| *character == '#')
        .count();
    if !(1..=6).contains(&count) || trimmed.chars().nth(count) != Some(' ') {
        return None;
    }
    let title = trimmed[count + 1..].trim().trim_end_matches('#').trim();
    (!title.is_empty()).then(|| (count, title.to_string()))
}

fn contains_markdown_table(text: &str) -> bool {
    let lines = text.lines().collect::<Vec<_>>();
    lines.windows(2).any(|pair| {
        pair[0].contains('|')
            && pair[1]
                .split('|')
                .filter(|cell| !cell.trim().is_empty())
                .all(|cell| {
                    let cell = cell.trim();
                    !cell.is_empty()
                        && cell
                            .chars()
                            .all(|character| matches!(character, '-' | ':' | ' '))
                })
    })
}

pub(crate) fn estimate_tokens(text: &str) -> usize {
    text.chars().count().div_ceil(4).max(1)
}

pub(crate) fn stable_hash(parts: &[&str]) -> String {
    let mut digest = Sha256::new();
    for part in parts {
        digest.update(part.len().to_le_bytes());
        digest.update(part.as_bytes());
    }
    format!("sha256-{:x}", digest.finalize())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{Confidence, Issue};
    use std::collections::BTreeMap;

    #[test]
    fn manifest_preserves_structural_sections_tables_and_source_identity() {
        let bundle = bundle_with_body(
            "# Revenue\n\nDefinition.\n\n## Values\n\n| Year | USDC |\n| ---: | ---: |\n| 2025 | 42 |",
        );
        let manifest = build_manifest(&bundle);

        assert_eq!(manifest.units.len(), 2);
        assert_eq!(manifest.units[0].heading_path, ["Revenue"]);
        assert_eq!(manifest.units[1].kind, RetrievalUnitKind::Table);
        assert!(manifest.units[1].text.contains("| 2025 | 42 |"));
        assert_eq!(manifest.units[1].source_range.start_line, 5);
        assert!(!manifest.units[1].section_id.contains('\\'));
        assert!(!manifest.units[1].section_id.contains('/'));
    }

    #[test]
    fn rebuild_is_deterministic_and_a_content_change_moves_only_its_section_identity() {
        let original = build_manifest(&bundle_with_body("# A\n\nAlpha\n\n## B\n\nBeta"));
        let same = build_manifest(&bundle_with_body("# A\n\nAlpha\n\n## B\n\nBeta"));
        let changed = build_manifest(&bundle_with_body("# A\n\nAlpha\n\n## B\n\nGamma"));

        assert_eq!(original, same);
        assert_eq!(original.units[0].section_id, changed.units[0].section_id);
        assert_ne!(original.units[1].section_id, changed.units[1].section_id);
        assert_ne!(original.bundle_fingerprint, changed.bundle_fingerprint);
    }

    #[test]
    fn canonical_snapshot_is_bound_to_the_manifest_fingerprint() {
        let manifest = build_manifest(&bundle_with_body("# A\n\nAlpha"));
        let snapshot = canonical_snapshot(&manifest);

        assert_eq!(snapshot.manifest_fingerprint, manifest.bundle_fingerprint);
        assert!(snapshot.text.contains("<!-- okf:concepts/revenue#"));
        assert!(snapshot.bytes > 0);
        assert!(snapshot.estimated_tokens > 0);
    }

    #[test]
    fn manifest_projects_advisory_reliability_fields() {
        let mut bundle = bundle_with_body("# A\n\nAlpha");
        let concept = &mut bundle.concepts[0];
        concept
            .extra
            .insert("confidence".to_string(), serde_json::json!(0.8));
        concept
            .extra
            .insert("lifecycle".to_string(), serde_json::json!("deprecated"));
        concept.extra.insert(
            "effective_from".to_string(),
            serde_json::json!("2026-01-01"),
        );
        concept.extra.insert(
            "effective_until".to_string(),
            serde_json::json!("2026-12-31"),
        );
        concept
            .extra
            .insert("review_after".to_string(), serde_json::json!("2026-06-01"));
        concept.extra.insert(
            "superseded_by".to_string(),
            serde_json::json!(["concepts/current"]),
        );
        concept.extra.insert(
            "contradicts".to_string(),
            serde_json::json!(["concepts/disputed"]),
        );

        let unit = build_manifest(&bundle).units.remove(0);
        assert_eq!(unit.confidence.as_deref(), Some("0.8"));
        assert_eq!(unit.lifecycle.as_deref(), Some("deprecated"));
        assert_eq!(unit.effective_time.as_deref(), Some("2026-01-01"));
        assert_eq!(unit.effective_until.as_deref(), Some("2026-12-31"));
        assert_eq!(unit.review_after.as_deref(), Some("2026-06-01"));
        assert_eq!(unit.superseded_by, ["concepts/current"]);
        assert_eq!(unit.contradicts, ["concepts/disputed"]);
    }

    #[test]
    fn manifest_projects_claim_level_evidence_with_its_source_identity() {
        let mut bundle = bundle_with_body("# A\n\nSupported.[^report]\n\n## B\n\nOther");
        let concept = &mut bundle.concepts[0];
        concept.extra.insert(
            "provenance".to_string(),
            serde_json::json!({
                "report": {
                    "title": "Public report",
                    "uri": "https://example.com/report",
                    "observed_at": "2026-07-22T00:00:00Z",
                    "source_digest": format!("sha256-{}", "a".repeat(64)),
                    "adapter": {"id": "html", "version": 1},
                    "media_type": "text/html"
                }
            }),
        );
        concept.extra.insert(
            "evidence".to_string(),
            serde_json::json!({
                "report": {"provenance_id": "report", "locator": "Paragraph 4"}
            }),
        );

        let manifest = build_manifest(&bundle);
        assert_eq!(manifest.units[0].claim_citations[0].source_id, "report");
        assert_eq!(manifest.units[0].claim_citations[0].line, 3);
        assert_eq!(
            manifest.units[0].evidence_sources[0].uri.as_deref(),
            Some("https://example.com/report")
        );
        assert_eq!(
            manifest.units[0].evidence_sources[0].locator.as_deref(),
            Some("Paragraph 4")
        );
        assert!(manifest.units[1].claim_citations.is_empty());
    }

    fn bundle_with_body(body: &str) -> Bundle {
        Bundle {
            root: "C:\\private\\bundle".to_string(),
            name: "Finance".to_string(),
            okf_version: Some("0.1".to_string()),
            odsf_version: None,
            extra: Default::default(),
            concepts: vec![Concept {
                id: "concepts/revenue".to_string(),
                concept_type: "Metric".to_string(),
                title: "Revenue".to_string(),
                description: "Recognized revenue".to_string(),
                tags: vec!["finance".to_string()],
                timestamp: Some("2026-07-01T00:00:00Z".to_string()),
                resource: Some("https://example.com/revenue".to_string()),
                extra: BTreeMap::new(),
                body: body.to_string(),
                links: Vec::new(),
                external_links: vec!["https://example.com/policy".to_string()],
                broken_links: Vec::new(),
                cited_by: Vec::new(),
                degree: 0,
            }],
            indexes: Vec::new(),
            log: Vec::new(),
            issues: Vec::<Issue>::new(),
            confidence: Confidence::Confident,
        }
    }
}
