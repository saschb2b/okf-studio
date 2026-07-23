//! Deterministic knowledge-health analysis over an already readable OKF bundle.
//!
//! Health findings are guidance, not another parser gate. Conformance findings
//! mirror the existing validator exactly; every other category is explicitly a
//! fact about bundle shape or a heuristic that may deserve human review.

use crate::evidence;
use crate::model::{Bundle, EntryKind, Issue, IssueLevel};
use serde::Serialize;
use std::collections::{BTreeMap, BTreeSet};

pub const HEALTH_SCHEMA_VERSION: u32 = 1;
pub const MAX_HEALTH_CONCEPTS: usize = 10_000;
pub const MAX_HEALTH_LINKS: usize = 50_000;

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum HealthCategory {
    Conformance,
    GraphConnectivity,
    Navigation,
    Provenance,
    Freshness,
    Duplication,
    CoverageHint,
    Writing,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum HealthBasis {
    Fact,
    Heuristic,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum HealthSeverity {
    Error,
    Warning,
    Advisory,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum HealthRepairability {
    Deterministic,
    Guided,
    NotRepairable,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HealthEvidence {
    pub kind: String,
    pub label: String,
    pub value: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HealthFinding {
    pub id: String,
    pub rule_id: String,
    pub rule_version: String,
    pub category: HealthCategory,
    pub severity: HealthSeverity,
    pub basis: HealthBasis,
    pub summary: String,
    pub why: String,
    pub evidence: Vec<HealthEvidence>,
    pub affected_concept_ids: Vec<String>,
    pub repairability: HealthRepairability,
    pub suppression_fingerprint: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HealthCounts {
    pub errors: usize,
    pub warnings: usize,
    pub advisories: usize,
    pub facts: usize,
    pub heuristics: usize,
    pub by_category: BTreeMap<HealthCategory, usize>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HealthReport {
    pub schema_version: u32,
    pub bundle_fingerprint: String,
    pub analyzed_concepts: usize,
    pub analyzed_links: usize,
    pub counts: HealthCounts,
    pub findings: Vec<HealthFinding>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HealthLimitExceeded {
    pub dimension: String,
    pub actual: usize,
    pub maximum: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HealthRepair {
    pub finding_id: String,
    pub action: String,
    pub target: String,
    pub description: String,
}

struct FindingInput<'a> {
    rule_id: &'a str,
    rule_version: &'a str,
    category: HealthCategory,
    severity: HealthSeverity,
    basis: HealthBasis,
    summary: String,
    why: String,
    evidence: Vec<HealthEvidence>,
    affected: Vec<String>,
    repairability: HealthRepairability,
}

/// Analyze one parsed snapshot. Refusing an oversized analysis never changes
/// whether the bundle itself can be opened or rendered.
pub fn analyze(bundle: &Bundle) -> Result<HealthReport, HealthLimitExceeded> {
    let concept_count = bundle.concepts.len();
    if concept_count > MAX_HEALTH_CONCEPTS {
        return Err(HealthLimitExceeded {
            dimension: "concepts".to_string(),
            actual: concept_count,
            maximum: MAX_HEALTH_CONCEPTS,
        });
    }
    let link_count = bundle
        .concepts
        .iter()
        .map(|concept| concept.links.len() + concept.broken_links.len())
        .sum::<usize>();
    if link_count > MAX_HEALTH_LINKS {
        return Err(HealthLimitExceeded {
            dimension: "links".to_string(),
            actual: link_count,
            maximum: MAX_HEALTH_LINKS,
        });
    }

    let mut findings = Vec::new();
    findings.extend(bundle.issues.iter().map(conformance_finding));
    add_graph_findings(bundle, &mut findings);
    add_navigation_findings(bundle, &mut findings);
    add_provenance_findings(bundle, &mut findings);
    add_freshness_findings(bundle, &mut findings);
    add_reliability_findings(bundle, &mut findings);
    add_duplication_findings(bundle, &mut findings);
    add_coverage_findings(bundle, &mut findings);
    add_writing_findings(bundle, &mut findings);
    findings.sort_by(|left, right| {
        severity_rank(left.severity)
            .cmp(&severity_rank(right.severity))
            .then_with(|| left.category.cmp(&right.category))
            .then_with(|| left.rule_id.cmp(&right.rule_id))
            .then_with(|| left.id.cmp(&right.id))
    });
    let counts = counts(&findings);
    Ok(HealthReport {
        schema_version: HEALTH_SCHEMA_VERSION,
        bundle_fingerprint: bundle_fingerprint(bundle),
        analyzed_concepts: concept_count,
        analyzed_links: link_count,
        counts,
        findings,
    })
}

/// Return a deterministic repair recipe only when the rule can name an exact
/// mechanical action. The recipe is still read-only; reviewed staging owns any
/// subsequent edit.
pub fn suggested_repair(finding: &HealthFinding) -> Option<HealthRepair> {
    if finding.repairability != HealthRepairability::Deterministic {
        return None;
    }
    let target = evidence_value(finding, "path")?;
    let (action, description) = match finding.rule_id.as_str() {
        "okf.conformance.index-frontmatter" => (
            "remove-disallowed-index-frontmatter",
            "Remove the YAML frontmatter block from this non-root index.md.",
        ),
        "okf.conformance.root-version" => (
            "declare-okf-version",
            "Add okf_version: \"0.1\" to the root index.md frontmatter.",
        ),
        "okf.navigation.synthesized-index" => (
            "create-index",
            "Create the missing index.md and list the affected concepts with bundle-relative links.",
        ),
        "okf.duplication.duplicate-tag" => (
            "deduplicate-tags",
            "Keep the first occurrence of each tag and remove later exact duplicates.",
        ),
        _ => return None,
    };
    Some(HealthRepair {
        finding_id: finding.id.clone(),
        action: action.to_string(),
        target: target.to_string(),
        description: description.to_string(),
    })
}

pub fn bundle_fingerprint(bundle: &Bundle) -> String {
    let mut state = String::new();
    push_part(&mut state, &bundle.name);
    push_part(
        &mut state,
        bundle.okf_version.as_deref().unwrap_or_default(),
    );
    let mut concepts = bundle.concepts.iter().collect::<Vec<_>>();
    concepts.sort_by(|left, right| left.id.cmp(&right.id));
    for concept in concepts {
        for value in [
            concept.id.as_str(),
            concept.concept_type.as_str(),
            concept.title.as_str(),
            concept.description.as_str(),
            concept.timestamp.as_deref().unwrap_or_default(),
            concept.resource.as_deref().unwrap_or_default(),
            concept.body.as_str(),
        ] {
            push_part(&mut state, value);
        }
        for value in concept
            .tags
            .iter()
            .chain(&concept.links)
            .chain(&concept.external_links)
            .chain(&concept.broken_links)
        {
            push_part(&mut state, value);
        }
        push_part(
            &mut state,
            &serde_json::to_string(&concept.extra).unwrap_or_default(),
        );
    }
    for index in &bundle.indexes {
        push_part(&mut state, &index.dir);
        push_part(
            &mut state,
            if index.synthesized {
                "synthesized"
            } else {
                "authored"
            },
        );
        for entry in index.sections.iter().flat_map(|section| &section.entries) {
            push_part(&mut state, &entry.target);
            push_part(&mut state, &entry.title);
        }
    }
    for issue in &bundle.issues {
        push_part(&mut state, issue.concept_id.as_deref().unwrap_or_default());
        push_part(
            &mut state,
            if issue.level == IssueLevel::Error {
                "error"
            } else {
                "warning"
            },
        );
        push_part(&mut state, &issue.message);
    }
    format!("okf-health-revision-{:016x}", fnv1a(state.as_bytes()))
}

fn conformance_finding(issue: &Issue) -> HealthFinding {
    let (rule_id, repairability) = if issue.message.contains("missing YAML frontmatter") {
        (
            "okf.conformance.frontmatter-required",
            HealthRepairability::Guided,
        )
    } else if issue.message.contains("'type' field") || issue.message.contains("no 'type'") {
        ("okf.conformance.type-required", HealthRepairability::Guided)
    } else if issue.message.contains("link target not found") {
        ("okf.conformance.link-target", HealthRepairability::Guided)
    } else if issue
        .message
        .contains("index.md should carry no frontmatter")
    {
        (
            "okf.conformance.index-frontmatter",
            HealthRepairability::Deterministic,
        )
    } else if issue.message.contains("does not declare okf_version") {
        (
            "okf.conformance.root-version",
            HealthRepairability::Deterministic,
        )
    } else if issue.message.contains("log heading") {
        ("okf.conformance.log-date", HealthRepairability::Guided)
    } else {
        ("okf.conformance.validator", HealthRepairability::Guided)
    };
    let path = issue
        .message
        .split_once(':')
        .map(|(path, _)| path)
        .or(issue.concept_id.as_deref())
        .unwrap_or("bundle");
    finding(FindingInput {
        rule_id,
        rule_version: "1.0.0",
        category: HealthCategory::Conformance,
        severity: if issue.level == IssueLevel::Error {
            HealthSeverity::Error
        } else {
            HealthSeverity::Warning
        },
        basis: HealthBasis::Fact,
        summary: issue.message.clone(),
        why: "This finding comes directly from the OKF v0.1 conformance validator.".to_string(),
        evidence: vec![
            evidence("path", "Reported path", path),
            evidence("validator", "Validator output", &issue.message),
        ],
        affected: issue.concept_id.iter().cloned().collect(),
        repairability,
    })
}

fn add_graph_findings(bundle: &Bundle, findings: &mut Vec<HealthFinding>) {
    for concept in bundle.concepts.iter().filter(|concept| concept.degree == 0) {
        findings.push(finding(FindingInput {
            rule_id: "okf.graph.orphan-concept",
            rule_version: "1.0.0",
            category: HealthCategory::GraphConnectivity,
            severity: HealthSeverity::Advisory,
            basis: HealthBasis::Heuristic,
            summary: format!("{} has no resolved links or backlinks", concept.title),
            why: "An isolated concept can be intentional, but agents cannot reach it by traversing the knowledge graph.".to_string(),
            evidence: vec![evidence("degree", "Resolved graph degree", "0"), evidence("path", "Concept path", &format!("{}.md", concept.id))],
            affected: vec![concept.id.clone()],
            repairability: HealthRepairability::Guided,
        }));
    }
}

fn add_navigation_findings(bundle: &Bundle, findings: &mut Vec<HealthFinding>) {
    for index in bundle.indexes.iter().filter(|index| index.synthesized) {
        let mut affected = index
            .sections
            .iter()
            .flat_map(|section| &section.entries)
            .filter(|entry| entry.kind == EntryKind::Concept)
            .map(|entry| entry.target.clone())
            .collect::<Vec<_>>();
        affected.sort();
        if affected.is_empty() {
            continue;
        }
        let path = if index.dir.is_empty() {
            "index.md".to_string()
        } else {
            format!("{}/index.md", index.dir)
        };
        findings.push(finding(FindingInput {
            rule_id: "okf.navigation.synthesized-index",
            rule_version: "1.0.0",
            category: HealthCategory::Navigation,
            severity: HealthSeverity::Warning,
            basis: HealthBasis::Fact,
            summary: format!("Studio synthesized navigation for {path}"),
            why: "The directory has no authored index.md. Studio can still render it, but agents and other OKF consumers do not receive the same curated navigation.".to_string(),
            evidence: vec![evidence("path", "Missing navigation file", &path), evidence("concept-count", "Immediate concepts", &affected.len().to_string())],
            affected,
            repairability: HealthRepairability::Deterministic,
        }));
    }

    for index in bundle.indexes.iter().filter(|index| !index.synthesized) {
        let listed = index
            .sections
            .iter()
            .flat_map(|section| &section.entries)
            .filter(|entry| entry.kind == EntryKind::Concept)
            .map(|entry| entry.target.as_str())
            .collect::<BTreeSet<_>>();
        for concept in bundle
            .concepts
            .iter()
            .filter(|concept| parent_dir(&concept.id) == index.dir)
        {
            if listed.contains(concept.id.as_str()) {
                continue;
            }
            findings.push(finding(FindingInput {
                rule_id: "okf.navigation.unlisted-concept",
                rule_version: "1.0.0",
                category: HealthCategory::Navigation,
                severity: HealthSeverity::Advisory,
                basis: HealthBasis::Heuristic,
                summary: format!("{} is not listed in its authored index", concept.title),
                why: "The concept remains readable and searchable, but curated folder navigation does not expose it directly.".to_string(),
                evidence: vec![evidence("path", "Concept path", &format!("{}.md", concept.id)), evidence("index", "Authored index", &index_path(&index.dir))],
                affected: vec![concept.id.clone()],
                repairability: HealthRepairability::Guided,
            }));
        }
    }
}

fn add_provenance_findings(bundle: &Bundle, findings: &mut Vec<HealthFinding>) {
    for concept in bundle.concepts.iter().filter(|concept| {
        concept.resource.as_deref().is_none_or(str::is_empty)
            && concept.external_links.is_empty()
            && !evidence::has_authored_source_signal(concept)
    }) {
        findings.push(finding(FindingInput {
            rule_id: "okf.provenance.no-source-signal",
            rule_version: "1.0.0",
            category: HealthCategory::Provenance,
            severity: HealthSeverity::Advisory,
            basis: HealthBasis::Heuristic,
            summary: format!("{} has no authored source signal", concept.title),
            why: "No resource field or external citation was found. Original knowledge may not require one, so this is a review hint rather than a conformance problem.".to_string(),
            evidence: vec![evidence("resource-count", "Resource and citation count", "0"), evidence("path", "Concept path", &format!("{}.md", concept.id))],
            affected: vec![concept.id.clone()],
            repairability: HealthRepairability::Guided,
        }));
    }

    for concept in &bundle.concepts {
        let authored = evidence::inspect(concept);
        let source_ids = authored
            .sources
            .iter()
            .map(|source| source.id.as_str())
            .collect::<BTreeSet<_>>();
        let cited_ids = authored
            .citations
            .iter()
            .map(|citation| citation.source_id.as_str())
            .collect::<BTreeSet<_>>();
        let path = format!("{}.md", concept.id);

        for source_id in authored.invalid_source_ids {
            findings.push(finding(FindingInput {
                rule_id: "okf.evidence.invalid-source",
                rule_version: "1.0.0",
                category: HealthCategory::Provenance,
                severity: HealthSeverity::Advisory,
                basis: HealthBasis::Fact,
                summary: format!("{} has an unreadable evidence entry", concept.title),
                why: "The optional evidence map needs a safe source ID and object value before Studio can connect claims to it.".to_string(),
                evidence: vec![
                    evidence("path", "Concept path", &path),
                    evidence("source-id", "Evidence source", &source_id),
                ],
                affected: vec![concept.id.clone()],
                repairability: HealthRepairability::Guided,
            }));
        }
        if authored.truncated {
            findings.push(finding(FindingInput {
                rule_id: "okf.evidence.source-limit",
                rule_version: "1.0.0",
                category: HealthCategory::Provenance,
                severity: HealthSeverity::Advisory,
                basis: HealthBasis::Fact,
                summary: format!("{} exceeds the evidence inspection limit", concept.title),
                why: format!(
                    "Studio inspected the first {} evidence sources and left the remaining producer data preserved but uninterpreted.",
                    evidence::MAX_EVIDENCE_SOURCES
                ),
                evidence: vec![
                    evidence("path", "Concept path", &path),
                    evidence(
                        "limit",
                        "Inspected source limit",
                        &evidence::MAX_EVIDENCE_SOURCES.to_string(),
                    ),
                ],
                affected: vec![concept.id.clone()],
                repairability: HealthRepairability::Guided,
            }));
        }
        for citation in authored
            .citations
            .iter()
            .filter(|citation| !source_ids.contains(citation.source_id.as_str()))
        {
            findings.push(finding(FindingInput {
                rule_id: "okf.evidence.dangling-citation",
                rule_version: "1.0.0",
                category: HealthCategory::Provenance,
                severity: HealthSeverity::Advisory,
                basis: HealthBasis::Fact,
                summary: format!(
                    "{} cites missing evidence {}",
                    concept.title, citation.source_id
                ),
                why: "The claim marker has no matching entry in the optional evidence map. This does not change OKF conformance.".to_string(),
                evidence: vec![
                    evidence("path", "Concept path", &path),
                    evidence("line", "Body line", &citation.line.to_string()),
                    evidence("source-id", "Missing evidence source", &citation.source_id),
                ],
                affected: vec![concept.id.clone()],
                repairability: HealthRepairability::Guided,
            }));
        }
        for source in authored
            .sources
            .iter()
            .filter(|source| !cited_ids.contains(source.id.as_str()))
        {
            findings.push(finding(FindingInput {
                rule_id: "okf.evidence.unused-source",
                rule_version: "1.0.0",
                category: HealthCategory::Provenance,
                severity: HealthSeverity::Advisory,
                basis: HealthBasis::Heuristic,
                summary: format!("{} is not connected to a claim", source.title),
                why: "The evidence source is inspectable but no structured claim marker names it. Concept-wide evidence can be intentional, so this is a review hint.".to_string(),
                evidence: vec![
                    evidence("path", "Concept path", &path),
                    evidence("source-id", "Evidence source", &source.id),
                ],
                affected: vec![concept.id.clone()],
                repairability: HealthRepairability::Guided,
            }));
        }
        for source in &authored.sources {
            let (severity, summary, why) = match source.last_status.as_str() {
                "changed" => (
                    HealthSeverity::Warning,
                    format!("{} changed since its authored observation", source.title),
                    "The explicit source check returned a different content fingerprint. This proves a change in the fetched representation, not that the concept is factually wrong.",
                ),
                "unavailable" => (
                    HealthSeverity::Advisory,
                    format!("{} was unavailable at its last check", source.title),
                    "The explicit source check could not retrieve the public evidence. Temporary failure or removal does not prove that the concept is factually wrong.",
                ),
                _ => continue,
            };
            let mut details = vec![
                evidence("path", "Concept path", &path),
                evidence("source-id", "Evidence source", &source.id),
                evidence("last-status", "Last check status", &source.last_status),
            ];
            if let Some(checked_at) = &source.last_checked_at {
                details.push(evidence("last-checked-at", "Last checked", checked_at));
            }
            if let Some(fingerprint) = &source.last_fingerprint {
                details.push(evidence(
                    "last-fingerprint",
                    "Observed fingerprint",
                    fingerprint,
                ));
            }
            findings.push(finding(FindingInput {
                rule_id: if source.last_status == "changed" {
                    "okf.evidence.source-changed"
                } else {
                    "okf.evidence.source-unavailable"
                },
                rule_version: "1.0.0",
                category: HealthCategory::Freshness,
                severity,
                basis: HealthBasis::Fact,
                summary,
                why: why.to_string(),
                evidence: details,
                affected: vec![concept.id.clone()],
                repairability: HealthRepairability::Guided,
            }));
        }
    }
}

fn add_freshness_findings(bundle: &Bundle, findings: &mut Vec<HealthFinding>) {
    for concept in bundle
        .concepts
        .iter()
        .filter(|concept| concept.timestamp.as_deref().is_none_or(str::is_empty))
    {
        findings.push(finding(FindingInput {
            rule_id: "okf.freshness.missing-timestamp",
            rule_version: "1.0.0",
            category: HealthCategory::Freshness,
            severity: HealthSeverity::Advisory,
            basis: HealthBasis::Heuristic,
            summary: format!("{} has no freshness timestamp", concept.title),
            why: "A timestamp is optional in OKF v0.1, but without one an agent cannot distinguish current knowledge from an undated claim.".to_string(),
            evidence: vec![evidence("timestamp", "Timestamp", "absent"), evidence("path", "Concept path", &format!("{}.md", concept.id))],
            affected: vec![concept.id.clone()],
            repairability: HealthRepairability::Guided,
        }));
    }
}

fn add_reliability_findings(bundle: &Bundle, findings: &mut Vec<HealthFinding>) {
    let ids = bundle
        .concepts
        .iter()
        .map(|concept| concept.id.as_str())
        .collect::<BTreeSet<_>>();
    let mut supersedes = BTreeMap::<String, BTreeSet<String>>::new();

    for concept in &bundle.concepts {
        let lifecycle = concept
            .extra
            .get("lifecycle")
            .and_then(serde_json::Value::as_str);
        if lifecycle.is_some_and(|value| {
            !matches!(
                value,
                "draft" | "active" | "deprecated" | "superseded" | "retired"
            )
        }) {
            let value = lifecycle.unwrap_or_default();
            findings.push(finding(FindingInput {
                rule_id: "okf.reliability.unknown-lifecycle",
                rule_version: "1.0.0",
                category: HealthCategory::Freshness,
                severity: HealthSeverity::Advisory,
                basis: HealthBasis::Fact,
                summary: format!("{} has an unknown lifecycle value", concept.title),
                why: "The advisory reliability profile cannot derive a lifecycle state from this producer-defined value.".to_string(),
                evidence: vec![
                    evidence("path", "Concept path", &format!("{}.md", concept.id)),
                    evidence("lifecycle", "Authored value", value),
                ],
                affected: vec![concept.id.clone()],
                repairability: HealthRepairability::Guided,
            }));
        }
        if let Some(confidence) = concept.extra.get("confidence") {
            let valid = confidence
                .as_f64()
                .or_else(|| confidence.as_str().and_then(|value| value.parse().ok()))
                .is_some_and(|value| (0.0..=1.0).contains(&value));
            if !valid {
                findings.push(finding(FindingInput {
                    rule_id: "okf.reliability.invalid-confidence",
                    rule_version: "1.0.0",
                    category: HealthCategory::Freshness,
                    severity: HealthSeverity::Advisory,
                    basis: HealthBasis::Fact,
                    summary: format!("{} has invalid authored confidence", concept.title),
                    why: "Confidence is advisory, but Studio can qualify retrieval only when the value is a number from 0 to 1.".to_string(),
                    evidence: vec![
                        evidence("path", "Concept path", &format!("{}.md", concept.id)),
                        evidence("confidence", "Authored value", &confidence.to_string()),
                    ],
                    affected: vec![concept.id.clone()],
                    repairability: HealthRepairability::Guided,
                }));
            }
        }

        for target in extra_string_values(concept.extra.get("supersedes")) {
            if ids.contains(target.as_str()) {
                supersedes
                    .entry(concept.id.clone())
                    .or_default()
                    .insert(target);
            }
        }
        for replacement in extra_string_values(concept.extra.get("superseded_by")) {
            if ids.contains(replacement.as_str()) {
                supersedes
                    .entry(replacement)
                    .or_default()
                    .insert(concept.id.clone());
            }
        }
        if let Some(namespaces) = concept
            .extra
            .get("relationships")
            .and_then(serde_json::Value::as_object)
        {
            for relations in namespaces.values().filter_map(serde_json::Value::as_object) {
                for target in extra_string_values(relations.get("supersedes")) {
                    if ids.contains(target.as_str()) {
                        supersedes
                            .entry(concept.id.clone())
                            .or_default()
                            .insert(target);
                    }
                }
            }
        }
    }

    // Repeatedly peel nodes with no incoming or no outgoing edge. What remains
    // is the bounded cycle-affected core. This is linear in the authored graph
    // and avoids recursive traversal on a 10,000-concept health report.
    let mut active = supersedes
        .iter()
        .flat_map(|(source, targets)| {
            std::iter::once(source.clone()).chain(targets.iter().cloned())
        })
        .collect::<BTreeSet<_>>();
    let mut incoming = BTreeMap::<String, BTreeSet<String>>::new();
    for (source, targets) in &supersedes {
        for target in targets {
            incoming
                .entry(target.clone())
                .or_default()
                .insert(source.clone());
        }
    }
    let mut indegree = active
        .iter()
        .map(|id| (id.clone(), incoming.get(id).map_or(0, BTreeSet::len)))
        .collect::<BTreeMap<_, _>>();
    let mut outdegree = active
        .iter()
        .map(|id| (id.clone(), supersedes.get(id).map_or(0, BTreeSet::len)))
        .collect::<BTreeMap<_, _>>();
    let mut queue = active
        .iter()
        .filter(|id| indegree[*id] == 0 || outdegree[*id] == 0)
        .cloned()
        .collect::<Vec<_>>();
    while let Some(id) = queue.pop() {
        if !active.remove(&id) {
            continue;
        }
        for target in supersedes.get(&id).into_iter().flatten() {
            if active.contains(target) {
                let degree = indegree.entry(target.clone()).or_default();
                *degree = degree.saturating_sub(1);
                if *degree == 0 {
                    queue.push(target.clone());
                }
            }
        }
        for source in incoming.get(&id).into_iter().flatten() {
            if active.contains(source) {
                let degree = outdegree.entry(source.clone()).or_default();
                *degree = degree.saturating_sub(1);
                if *degree == 0 {
                    queue.push(source.clone());
                }
            }
        }
    }
    if !active.is_empty() {
        let affected = active.into_iter().collect::<Vec<_>>();
        findings.push(finding(FindingInput {
            rule_id: "okf.reliability.supersession-cycle",
            rule_version: "1.0.0",
            category: HealthCategory::Freshness,
            severity: HealthSeverity::Warning,
            basis: HealthBasis::Fact,
            summary: "Supersession relationships contain a cycle".to_string(),
            why: "A cycle makes it impossible to identify a terminal replacement. Studio reports the authored graph without choosing a current concept.".to_string(),
            evidence: vec![evidence(
                "cycle",
                "Cycle-affected concepts",
                &affected.join(" → "),
            )],
            affected,
            repairability: HealthRepairability::Guided,
        }));
    }
}

fn extra_string_values(value: Option<&serde_json::Value>) -> Vec<String> {
    match value {
        Some(serde_json::Value::String(value)) if !value.trim().is_empty() => {
            vec![value.trim().to_string()]
        }
        Some(serde_json::Value::Array(values)) => values
            .iter()
            .filter_map(serde_json::Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_string)
            .collect(),
        _ => Vec::new(),
    }
}

fn add_duplication_findings(bundle: &Bundle, findings: &mut Vec<HealthFinding>) {
    let mut by_title = BTreeMap::<String, Vec<String>>::new();
    for concept in &bundle.concepts {
        by_title
            .entry(normalize(&concept.title))
            .or_default()
            .push(concept.id.clone());
        let mut seen = BTreeSet::new();
        let mut duplicates = BTreeSet::new();
        for tag in &concept.tags {
            if !seen.insert(tag) {
                duplicates.insert(tag.clone());
            }
        }
        if !duplicates.is_empty() {
            findings.push(finding(FindingInput {
                rule_id: "okf.duplication.duplicate-tag",
                rule_version: "1.0.0",
                category: HealthCategory::Duplication,
                severity: HealthSeverity::Advisory,
                basis: HealthBasis::Fact,
                summary: format!("{} repeats one or more tags", concept.title),
                why: "The same exact tag occurs more than once in this concept's parsed metadata."
                    .to_string(),
                evidence: vec![
                    evidence("path", "Concept path", &format!("{}.md", concept.id)),
                    evidence(
                        "tags",
                        "Repeated tags",
                        &duplicates.into_iter().collect::<Vec<_>>().join(", "),
                    ),
                ],
                affected: vec![concept.id.clone()],
                repairability: HealthRepairability::Deterministic,
            }));
        }
    }
    for (title, mut affected) in by_title.into_iter().filter(|(_, ids)| ids.len() > 1) {
        affected.sort();
        findings.push(finding(FindingInput {
            rule_id: "okf.duplication.same-title",
            rule_version: "1.0.0",
            category: HealthCategory::Duplication,
            severity: HealthSeverity::Warning,
            basis: HealthBasis::Heuristic,
            summary: format!("{} concepts share the title \"{title}\"", affected.len()),
            why: "Matching normalized titles can represent valid views of one subject or accidental duplication; review identity before merging anything.".to_string(),
            evidence: vec![evidence("normalized-title", "Normalized title", &title), evidence("concept-count", "Matching concepts", &affected.len().to_string())],
            affected,
            repairability: HealthRepairability::Guided,
        }));
    }
}

fn add_coverage_findings(bundle: &Bundle, findings: &mut Vec<HealthFinding>) {
    for concept in bundle
        .concepts
        .iter()
        .filter(|concept| concept.description.trim().is_empty())
    {
        findings.push(finding(FindingInput {
            rule_id: "okf.coverage.missing-description",
            rule_version: "1.0.0",
            category: HealthCategory::CoverageHint,
            severity: HealthSeverity::Advisory,
            basis: HealthBasis::Heuristic,
            summary: format!("{} has no short description", concept.title),
            why: "Descriptions are optional, but inventory and search results have less context without one.".to_string(),
            evidence: vec![evidence("description", "Description", "absent"), evidence("path", "Concept path", &format!("{}.md", concept.id))],
            affected: vec![concept.id.clone()],
            repairability: HealthRepairability::Guided,
        }));
    }
}

fn add_writing_findings(bundle: &Bundle, findings: &mut Vec<HealthFinding>) {
    for concept in &bundle.concepts {
        let path = format!("{}.md", concept.id);
        let structured_shape = writing_shape_is_structured(&concept.concept_type);
        let deliberate_repetition = allows_deliberate_repetition(&concept.concept_type);
        let lines = concept.body.lines().collect::<Vec<_>>();
        let non_empty = lines
            .iter()
            .enumerate()
            .filter(|(_, line)| !line.trim().is_empty())
            .collect::<Vec<_>>();

        if let Some((line_index, line)) = non_empty.first() {
            let normalized = normalize(line);
            if !is_quoted_or_code(line)
                && [
                    "in today's",
                    "when it comes to",
                    "let's dive",
                    "it is important to note",
                ]
                .iter()
                .any(|phrase| normalized.contains(phrase))
            {
                findings.push(writing_finding(
                    "okf.writing.generic-opener",
                    concept,
                    &path,
                    *line_index + 1,
                    line,
                    "The concept opens with generic framing",
                    "The opening delays the reader's answer. Review whether the concept can begin with its governing fact.",
                ));
            }
        }

        if let Some((line_index, line)) = non_empty.last() {
            let normalized = normalize(line);
            if !is_quoted_or_code(line)
                && [
                    "in conclusion",
                    "ultimately",
                    "there you have it",
                    "i hope this helps",
                ]
                .iter()
                .any(|phrase| normalized.contains(phrase))
            {
                findings.push(writing_finding(
                    "okf.writing.generic-closer",
                    concept,
                    &path,
                    *line_index + 1,
                    line,
                    "The concept ends with a generic summary",
                    "The closing may repeat the body without adding knowledge. Review it in context before removing anything.",
                ));
            }
        }

        let mut in_code_fence = false;
        for (line_index, line) in lines.iter().enumerate() {
            let trimmed = line.trim();
            if trimmed.starts_with("```") || trimmed.starts_with("~~~") {
                in_code_fence = !in_code_fence;
                continue;
            }
            if in_code_fence {
                continue;
            }
            if trimmed.starts_with('#') && trimmed.trim_matches('#').trim().is_empty() {
                findings.push(writing_finding(
                    "okf.writing.empty-heading",
                    concept,
                    &path,
                    line_index + 1,
                    line,
                    "The concept contains an empty heading",
                    "An empty heading adds navigation structure without naming a subject.",
                ));
            }
            let heading_depth = trimmed
                .chars()
                .take_while(|character| *character == '#')
                .count();
            if heading_depth >= 5 && trimmed.chars().nth(heading_depth) == Some(' ') {
                findings.push(writing_finding(
                    "okf.writing.excessive-heading-depth",
                    concept,
                    &path,
                    line_index + 1,
                    line,
                    "The concept uses a deeply nested heading",
                    "Five or more heading levels can hide the concept's main structure. Confirm that the hierarchy is necessary.",
                ));
            }
        }

        let paragraphs = concept
            .body
            .split("\n\n")
            .map(str::trim)
            .filter(|paragraph| !paragraph.is_empty())
            .collect::<Vec<_>>();
        for (index, pair) in paragraphs.windows(2).enumerate() {
            let normalized = normalize(pair[0]);
            if !deliberate_repetition
                && normalized.chars().count() >= 40
                && normalized == normalize(pair[1])
            {
                findings.push(finding(FindingInput {
                    rule_id: "okf.writing.duplicate-paragraph",
                    rule_version: "1.0.0",
                    category: HealthCategory::Writing,
                    severity: HealthSeverity::Advisory,
                    basis: HealthBasis::Heuristic,
                    summary: format!("{} repeats an adjacent paragraph", concept.title),
                    why: "Adjacent repeated prose can be an accidental generation or merge artifact. Compare both paragraphs before deleting either one.".to_string(),
                    evidence: vec![
                        evidence("path", "Concept path", &path),
                        evidence("paragraph", "Repeated paragraph", &bounded_excerpt(pair[0])),
                        evidence("position", "Paragraph position", &(index + 1).to_string()),
                    ],
                    affected: vec![concept.id.clone()],
                    repairability: HealthRepairability::Guided,
                }));
            }
        }

        let labelled_bullets = lines
            .iter()
            .filter(|line| {
                let line = line.trim_start();
                line.starts_with("- **") && (line.contains("**:") || line.contains("**. "))
            })
            .count();
        if labelled_bullets >= 3 && !structured_shape {
            findings.push(finding(FindingInput {
                rule_id: "okf.writing.bold-label-list",
                rule_version: "1.0.0",
                category: HealthCategory::Writing,
                severity: HealthSeverity::Advisory,
                basis: HealthBasis::Heuristic,
                summary: format!("{} uses repeated bold-label bullets", concept.title),
                why: "Labelled bullets are valid for independent fields, but connected reasoning is easier to follow as prose or a table. Review the information shape.".to_string(),
                evidence: vec![
                    evidence("path", "Concept path", &path),
                    evidence("count", "Matching bullets", &labelled_bullets.to_string()),
                ],
                affected: vec![concept.id.clone()],
                repairability: HealthRepairability::Guided,
            }));
        }
    }
}

fn writing_shape_is_structured(concept_type: &str) -> bool {
    let concept_type = concept_type.to_lowercase();
    [
        "reference",
        "runbook",
        "playbook",
        "checklist",
        "incident",
        "procedure",
        "schema",
        "standard",
    ]
    .iter()
    .any(|shape| concept_type.contains(shape))
}

fn allows_deliberate_repetition(concept_type: &str) -> bool {
    let concept_type = concept_type.to_lowercase();
    ["runbook", "playbook", "incident", "procedure", "standard"]
        .iter()
        .any(|shape| concept_type.contains(shape))
}

fn is_quoted_or_code(line: &str) -> bool {
    matches!(
        line.trim_start().chars().next(),
        Some('>' | '"' | '\'' | '“' | '`')
    )
}

fn writing_finding(
    rule_id: &'static str,
    concept: &crate::Concept,
    path: &str,
    line_number: usize,
    line: &str,
    summary: &'static str,
    why: &'static str,
) -> HealthFinding {
    finding(FindingInput {
        rule_id,
        rule_version: "1.0.0",
        category: HealthCategory::Writing,
        severity: HealthSeverity::Advisory,
        basis: HealthBasis::Heuristic,
        summary: format!("{}: {summary}", concept.title),
        why: why.to_string(),
        evidence: vec![
            evidence("path", "Concept path", path),
            evidence("line", "Line", &line_number.to_string()),
            evidence("excerpt", "Excerpt", &bounded_excerpt(line)),
        ],
        affected: vec![concept.id.clone()],
        repairability: HealthRepairability::Guided,
    })
}

fn bounded_excerpt(value: &str) -> String {
    value.chars().take(160).collect()
}

fn finding(mut input: FindingInput<'_>) -> HealthFinding {
    input.affected.sort();
    input.affected.dedup();
    let mut state = String::new();
    push_part(&mut state, input.rule_id);
    push_part(&mut state, input.rule_version);
    for concept_id in &input.affected {
        push_part(&mut state, concept_id);
    }
    for item in &input.evidence {
        push_part(&mut state, &item.kind);
        push_part(&mut state, &item.value);
    }
    let suppression_fingerprint =
        format!("okf-health-suppression-{:016x}", fnv1a(state.as_bytes()));
    HealthFinding {
        id: format!(
            "okf-health-finding-{:016x}",
            fnv1a(suppression_fingerprint.as_bytes())
        ),
        rule_id: input.rule_id.to_string(),
        rule_version: input.rule_version.to_string(),
        category: input.category,
        severity: input.severity,
        basis: input.basis,
        summary: input.summary,
        why: input.why,
        evidence: input.evidence,
        affected_concept_ids: input.affected,
        repairability: input.repairability,
        suppression_fingerprint,
    }
}

fn evidence(kind: &str, label: &str, value: &str) -> HealthEvidence {
    HealthEvidence {
        kind: kind.to_string(),
        label: label.to_string(),
        value: value.to_string(),
    }
}

fn evidence_value<'a>(finding: &'a HealthFinding, kind: &str) -> Option<&'a str> {
    finding
        .evidence
        .iter()
        .find(|item| item.kind == kind)
        .map(|item| item.value.as_str())
}

fn counts(findings: &[HealthFinding]) -> HealthCounts {
    let mut result = HealthCounts {
        errors: 0,
        warnings: 0,
        advisories: 0,
        facts: 0,
        heuristics: 0,
        by_category: BTreeMap::new(),
    };
    for finding in findings {
        match finding.severity {
            HealthSeverity::Error => result.errors += 1,
            HealthSeverity::Warning => result.warnings += 1,
            HealthSeverity::Advisory => result.advisories += 1,
        }
        match finding.basis {
            HealthBasis::Fact => result.facts += 1,
            HealthBasis::Heuristic => result.heuristics += 1,
        }
        *result.by_category.entry(finding.category).or_default() += 1;
    }
    result
}

fn index_path(dir: &str) -> String {
    if dir.is_empty() {
        "index.md".to_string()
    } else {
        format!("{dir}/index.md")
    }
}

fn parent_dir(id: &str) -> &str {
    id.rsplit_once('/').map_or("", |(parent, _)| parent)
}

fn normalize(value: &str) -> String {
    value
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .to_lowercase()
}

fn severity_rank(severity: HealthSeverity) -> u8 {
    match severity {
        HealthSeverity::Error => 0,
        HealthSeverity::Warning => 1,
        HealthSeverity::Advisory => 2,
    }
}

fn push_part(state: &mut String, value: &str) {
    state.push_str(&value.len().to_string());
    state.push(':');
    state.push_str(value);
    state.push('|');
}

fn fnv1a(bytes: &[u8]) -> u64 {
    bytes.iter().fold(0xcbf29ce484222325, |hash, byte| {
        (hash ^ u64::from(*byte)).wrapping_mul(0x100000001b3)
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{read_bundle, Concept, Confidence, IndexNode};
    use std::collections::{BTreeMap, BTreeSet};
    use std::path::Path;

    #[test]
    fn benchmark_findings_are_stable_and_keep_heuristics_out_of_conformance() {
        let root = Path::new(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../benchmarks/okf-agent/fixtures/disconnected-broken"
        ));
        let bundle = read_bundle(root);
        let first = analyze(&bundle).expect("health report");
        let second = analyze(&bundle).expect("same health report");
        assert_eq!(first, second);
        assert!(first.bundle_fingerprint.starts_with("okf-health-revision-"));
        assert!(first.findings.iter().any(|finding| {
            finding.rule_id == "okf.graph.orphan-concept" && finding.basis == HealthBasis::Heuristic
        }));
        let ids = first
            .findings
            .iter()
            .filter(|finding| {
                finding.rule_id == "okf.conformance.link-target"
                    || finding.rule_id == "okf.graph.orphan-concept"
            })
            .map(|finding| finding.id.as_str())
            .collect::<BTreeSet<_>>();
        assert_eq!(
            ids,
            BTreeSet::from([
                "okf-health-finding-9325d2de61f1f4b6",
                "okf-health-finding-f329fea2c55df54b",
            ])
        );
        assert!(first.findings.iter().all(|finding| {
            finding.category != HealthCategory::Conformance || finding.basis == HealthBasis::Fact
        }));
    }

    #[test]
    fn malformed_bundle_remains_analyzable_and_repairs_stay_explicit() {
        let root = Path::new(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../benchmarks/okf-agent/fixtures/malformed-tolerated"
        ));
        let bundle = read_bundle(root);
        let report = analyze(&bundle).expect("tolerant health report");
        assert_eq!(bundle.concepts.len(), 4);
        assert!(report.counts.errors >= 2);
        let missing_type = report
            .findings
            .iter()
            .find(|finding| finding.rule_id == "okf.conformance.type-required")
            .expect("missing type finding");
        assert_eq!(missing_type.repairability, HealthRepairability::Guided);
        assert!(suggested_repair(missing_type).is_none());
    }

    #[test]
    fn reliability_metadata_and_cycles_stay_advisory() {
        let concept = |id: &str, target: &str, confidence: serde_json::Value| Concept {
            id: id.to_string(),
            concept_type: "Policy".to_string(),
            title: id.to_string(),
            description: "Policy fixture".to_string(),
            tags: Vec::new(),
            timestamp: Some("2026-07-23T00:00:00Z".to_string()),
            resource: None,
            extra: BTreeMap::from([
                ("lifecycle".to_string(), serde_json::json!("active")),
                ("confidence".to_string(), confidence),
                ("supersedes".to_string(), serde_json::json!([target])),
            ]),
            body: "Policy".to_string(),
            links: vec![target.to_string()],
            external_links: Vec::new(),
            broken_links: Vec::new(),
            cited_by: vec![target.to_string()],
            degree: 2,
        };
        let bundle = Bundle {
            root: String::new(),
            name: "Reliability".to_string(),
            okf_version: Some("0.1".to_string()),
            odsf_version: None,
            extra: BTreeMap::new(),
            concepts: vec![
                concept("policy/a", "policy/b", serde_json::json!(0.8)),
                concept("policy/b", "policy/a", serde_json::json!(4)),
            ],
            indexes: Vec::new(),
            log: Vec::new(),
            issues: Vec::new(),
            confidence: Confidence::Confident,
        };

        let report = analyze(&bundle).expect("reliability report");
        let cycle = report
            .findings
            .iter()
            .find(|finding| finding.rule_id == "okf.reliability.supersession-cycle")
            .expect("cycle finding");
        assert_eq!(cycle.severity, HealthSeverity::Warning);
        assert_eq!(cycle.basis, HealthBasis::Fact);
        assert_eq!(cycle.affected_concept_ids, ["policy/a", "policy/b"]);
        assert!(report
            .findings
            .iter()
            .any(|finding| finding.rule_id == "okf.reliability.invalid-confidence"));
        assert!(bundle.issues.is_empty());
    }

    #[test]
    fn evidence_health_joins_claim_locations_and_source_status_without_claiming_truth() {
        let concept = Concept {
            id: "research/result".to_string(),
            concept_type: "Research".to_string(),
            title: "Research result".to_string(),
            description: "Evidence health fixture".to_string(),
            tags: Vec::new(),
            timestamp: Some("2026-07-23T00:00:00Z".to_string()),
            resource: None,
            extra: BTreeMap::from([
                (
                    "provenance".to_string(),
                    serde_json::json!({
                        "report": {
                            "title": "Public report",
                            "uri": "https://example.com/report",
                            "observed_at": "2026-07-22T00:00:00Z",
                            "source_digest": format!("sha256-{}", "a".repeat(64)),
                            "adapter": {"id": "html", "version": 1}
                        }
                    }),
                ),
                (
                    "evidence".to_string(),
                    serde_json::json!({
                        "report": {
                            "provenance_id": "report",
                            "last_checked_at": "2026-07-23T00:00:00Z",
                            "last_status": "changed",
                            "last_fingerprint": format!("sha256-{}", "b".repeat(64))
                        }
                    }),
                ),
                ("lifecycle".to_string(), serde_json::json!("active")),
                (
                    "contradicts".to_string(),
                    serde_json::json!(["research/alternate"]),
                ),
            ]),
            body: "Supported claim.[^report]\n\nUnsupported claim.[^missing]".to_string(),
            links: Vec::new(),
            external_links: Vec::new(),
            broken_links: Vec::new(),
            cited_by: Vec::new(),
            degree: 0,
        };
        let bundle = Bundle {
            root: String::new(),
            name: "Evidence".to_string(),
            okf_version: Some("0.1".to_string()),
            odsf_version: None,
            extra: BTreeMap::new(),
            concepts: vec![concept],
            indexes: Vec::new(),
            log: Vec::new(),
            issues: Vec::new(),
            confidence: Confidence::Confident,
        };

        let report = analyze(&bundle).expect("evidence report");
        let dangling = report
            .findings
            .iter()
            .find(|finding| finding.rule_id == "okf.evidence.dangling-citation")
            .expect("dangling citation");
        assert_eq!(evidence_value(dangling, "line"), Some("3"));
        assert_eq!(dangling.basis, HealthBasis::Fact);
        let changed = report
            .findings
            .iter()
            .find(|finding| finding.rule_id == "okf.evidence.source-changed")
            .expect("changed source");
        assert_eq!(changed.severity, HealthSeverity::Warning);
        assert!(changed
            .why
            .contains("not that the concept is factually wrong"));
        assert!(!report
            .findings
            .iter()
            .any(|finding| finding.rule_id == "okf.provenance.no-source-signal"));
    }

    #[test]
    fn limits_health_analysis_without_affecting_the_bundle() {
        let concept = Concept {
            id: "x".to_string(),
            concept_type: "Note".to_string(),
            title: "X".to_string(),
            description: String::new(),
            tags: Vec::new(),
            timestamp: None,
            resource: None,
            extra: BTreeMap::new(),
            body: String::new(),
            links: Vec::new(),
            external_links: Vec::new(),
            broken_links: Vec::new(),
            cited_by: Vec::new(),
            degree: 0,
        };
        let bundle = Bundle {
            root: String::new(),
            name: "Large".to_string(),
            okf_version: Some("0.1".to_string()),
            odsf_version: None,
            extra: Default::default(),
            concepts: vec![concept; MAX_HEALTH_CONCEPTS + 1],
            indexes: Vec::<IndexNode>::new(),
            log: Vec::new(),
            issues: Vec::new(),
            confidence: Confidence::Confident,
        };
        let limit = analyze(&bundle).expect_err("analysis limit");
        assert_eq!(limit.dimension, "concepts");
        assert_eq!(bundle.concepts.len(), MAX_HEALTH_CONCEPTS + 1);
    }

    #[test]
    fn accepts_the_exact_scale_contract_and_rejects_one_extra_link() {
        let concepts = (0..MAX_HEALTH_CONCEPTS)
            .map(|index| Concept {
                id: format!("concept-{index:05}"),
                concept_type: "Note".to_string(),
                title: format!("Concept {index:05}"),
                description: "Bounded generated concept".to_string(),
                tags: Vec::new(),
                timestamp: Some("2026-07-18T00:00:00Z".to_string()),
                resource: Some(format!("https://example.com/{index}")),
                extra: BTreeMap::new(),
                body: String::new(),
                links: (1..=5)
                    .map(|offset| format!("concept-{:05}", (index + offset) % MAX_HEALTH_CONCEPTS))
                    .collect(),
                external_links: Vec::new(),
                broken_links: Vec::new(),
                cited_by: Vec::new(),
                degree: 5,
            })
            .collect();
        let mut bundle = Bundle {
            root: String::new(),
            name: "Scale".to_string(),
            okf_version: Some("0.1".to_string()),
            odsf_version: None,
            extra: Default::default(),
            concepts,
            indexes: Vec::new(),
            log: Vec::new(),
            issues: Vec::new(),
            confidence: Confidence::Confident,
        };
        let report = analyze(&bundle).expect("exact scale contract");
        assert_eq!(report.analyzed_concepts, MAX_HEALTH_CONCEPTS);
        assert_eq!(report.analyzed_links, MAX_HEALTH_LINKS);
        bundle.concepts[0].links.push("concept-00006".to_string());
        let limit = analyze(&bundle).expect_err("one link beyond the contract");
        assert_eq!(limit.dimension, "links");
        assert_eq!(limit.actual, MAX_HEALTH_LINKS + 1);
    }

    #[test]
    fn writing_findings_are_advisory_stable_and_point_to_evidence() {
        let repeated =
            "Reviewed staging keeps an agent edit outside the bundle until the user accepts it.";
        let concept = Concept {
            id: "writing/example".to_string(),
            concept_type: "Product Rationale".to_string(),
            title: "Writing example".to_string(),
            description: "Writing diagnostics fixture".to_string(),
            tags: Vec::new(),
            timestamp: Some("2026-07-18T00:00:00Z".to_string()),
            resource: None,
            extra: BTreeMap::new(),
            body: format!(
                "In today's AI landscape, this feature matters.\n\n{repeated}\n\n{repeated}\n\n- **Speed**: Fast\n- **Scale**: Large\n- **Quality**: High\n\nIn conclusion, this is useful."
            ),
            links: Vec::new(),
            external_links: Vec::new(),
            broken_links: Vec::new(),
            cited_by: Vec::new(),
            degree: 0,
        };
        let bundle = Bundle {
            root: String::new(),
            name: "Writing".to_string(),
            okf_version: Some("0.1".to_string()),
            odsf_version: None,
            extra: Default::default(),
            concepts: vec![concept],
            indexes: Vec::new(),
            log: Vec::new(),
            issues: Vec::new(),
            confidence: Confidence::Confident,
        };

        let first = analyze(&bundle).expect("writing health report");
        let second = analyze(&bundle).expect("stable writing health report");
        assert_eq!(first, second);
        let writing = first
            .findings
            .iter()
            .filter(|finding| finding.category == HealthCategory::Writing)
            .collect::<Vec<_>>();
        assert_eq!(writing.len(), 4);
        assert!(writing.iter().all(|finding| {
            finding.severity == HealthSeverity::Advisory
                && finding.basis == HealthBasis::Heuristic
                && finding.repairability == HealthRepairability::Guided
                && finding.evidence.iter().any(|item| item.kind == "path")
        }));
    }

    #[test]
    fn writing_diagnostics_respect_structured_and_exact_text() {
        let concept = |id: &str, concept_type: &str, body: &str| Concept {
            id: id.to_string(),
            concept_type: concept_type.to_string(),
            title: id.to_string(),
            description: "False-positive fixture".to_string(),
            tags: Vec::new(),
            timestamp: Some("2026-07-18T00:00:00Z".to_string()),
            resource: None,
            extra: BTreeMap::new(),
            body: body.to_string(),
            links: Vec::new(),
            external_links: Vec::new(),
            broken_links: Vec::new(),
            cited_by: Vec::new(),
            degree: 0,
        };
        let warning = "WARNING: Stop the procedure and isolate the host before continuing.";
        let bundle = Bundle {
            root: String::new(),
            name: "Writing exceptions".to_string(),
            okf_version: Some("0.1".to_string()),
            odsf_version: None,
            extra: Default::default(),
            concepts: vec![
                concept(
                    "standard",
                    "Technical Standard",
                    "> It is important to note that this sentence is normative source text.\n\n> In conclusion, retain this exact quotation.",
                ),
                concept(
                    "reference",
                    "API Reference",
                    "- **Path**: `/v1/bundles`\n- **Method**: `GET`\n- **Result**: Bundle metadata",
                ),
                concept(
                    "checklist",
                    "Deployment Checklist",
                    "- **Build**: Complete\n- **Test**: Complete\n- **Release**: Pending",
                ),
                concept(
                    "incident",
                    "Incident Procedure",
                    &format!("{warning}\n\n{warning}"),
                ),
                concept(
                    "schema",
                    "Generated Schema",
                    "```markdown\n#####\n```",
                ),
            ],
            indexes: Vec::new(),
            log: Vec::new(),
            issues: Vec::new(),
            confidence: Confidence::Confident,
        };

        let report = analyze(&bundle).expect("writing exception report");
        assert!(report
            .findings
            .iter()
            .all(|finding| finding.category != HealthCategory::Writing));
    }
}
