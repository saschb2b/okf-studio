use super::manifest::stable_hash;
use super::{
    DiagnosticClass, EvidenceCaveatKind, EvidencePacket, ExclusionReason, ReceiptDiff, RepairKind,
    RepairProposal, RetrievalDiagnostic, RetrievalManifest, RetrievalReceipt,
};
use std::collections::{BTreeSet, HashMap};

pub fn diagnose(
    manifest: &RetrievalManifest,
    receipt: &RetrievalReceipt,
    evidence: &EvidencePacket,
) -> RetrievalDiagnostic {
    let filter_omissions = receipt
        .omissions
        .iter()
        .filter(|omission| omission.reason == ExclusionReason::FilterMismatch)
        .count();
    let class = if evidence.items.is_empty() && filter_omissions > 0 {
        DiagnosticClass::FilterMismatch
    } else if evidence.items.is_empty() {
        DiagnosticClass::EmptyResults
    } else if evidence
        .caveats
        .iter()
        .any(|caveat| caveat.kind == EvidenceCaveatKind::Conflict)
    {
        DiagnosticClass::ConflictingEvidence
    } else if receipt
        .omissions
        .iter()
        .any(|omission| omission.reason == ExclusionReason::ContextBudget)
    {
        DiagnosticClass::BudgetOmission
    } else if receipt
        .providers
        .iter()
        .any(|provider| matches!(provider.state, super::ProviderState::Degraded))
    {
        DiagnosticClass::ProviderFailure
    } else if evidence.items.iter().any(|item| {
        manifest
            .units
            .iter()
            .find(|unit| unit.section_id == item.section_id)
            .is_some_and(|unit| {
                unit.health.missing_description
                    || (receipt.route == super::RetrievalRoute::TemporalConflict
                        && unit.health.missing_timestamp)
            })
    }) {
        DiagnosticClass::MissingMetadata
    } else {
        DiagnosticClass::Ready
    };
    let affected_concept_ids = evidence
        .items
        .iter()
        .map(|item| item.concept_id.clone())
        .chain(receipt.omissions.iter().map(|item| item.concept_id.clone()))
        .collect::<BTreeSet<_>>()
        .into_iter()
        .collect();
    let (summary, suggested_action) = diagnostic_copy(class);
    RetrievalDiagnostic {
        class,
        summary: summary.to_string(),
        affected_concept_ids,
        suggested_action: suggested_action.to_string(),
    }
}

pub fn diff_receipts(left: &RetrievalReceipt, right: &RetrievalReceipt) -> ReceiptDiff {
    let left_included = included_sections(left);
    let right_included = included_sections(right);
    let left_exclusions = exclusions(left);
    let right_exclusions = exclusions(right);
    ReceiptDiff {
        route_changed: left.route != right.route,
        added_sections: right_included.difference(&left_included).cloned().collect(),
        removed_sections: left_included.difference(&right_included).cloned().collect(),
        changed_exclusions: left_exclusions
            .keys()
            .chain(right_exclusions.keys())
            .filter(|section_id| {
                left_exclusions.get(*section_id) != right_exclusions.get(*section_id)
            })
            .cloned()
            .collect::<BTreeSet<_>>()
            .into_iter()
            .collect(),
        token_delta: right.context_tokens_used as i64 - left.context_tokens_used as i64,
    }
}

pub fn propose_repairs(
    manifest: &RetrievalManifest,
    receipt: &RetrievalReceipt,
    diagnostic: &RetrievalDiagnostic,
) -> Vec<RepairProposal> {
    let mut proposals = Vec::new();
    let affected = diagnostic
        .affected_concept_ids
        .iter()
        .filter_map(|concept_id| {
            manifest
                .units
                .iter()
                .find(|unit| unit.concept_id == *concept_id)
        })
        .collect::<Vec<_>>();
    for unit in affected {
        if diagnostic.class == DiagnosticClass::MissingMetadata && unit.health.missing_description {
            proposals.push(repair(
                receipt,
                unit,
                RepairKind::AddDescription,
                "Add a concise description so lexical and inventory routes can identify the concept before reading its full body.",
            ));
        }
        if unit.health.broken_link_count > 0 {
            proposals.push(repair(
                receipt,
                unit,
                RepairKind::RepairLink,
                "Repair unresolved bundle links so relationship routes can follow authored connections.",
            ));
        }
    }
    proposals.sort_by(|left, right| left.proposal_id.cmp(&right.proposal_id));
    proposals.dedup_by(|left, right| left.proposal_id == right.proposal_id);
    proposals.truncate(12);
    proposals
}

fn included_sections(receipt: &RetrievalReceipt) -> BTreeSet<String> {
    receipt
        .candidates
        .iter()
        .filter(|candidate| candidate.included)
        .map(|candidate| candidate.section_id.clone())
        .collect()
}

fn exclusions(receipt: &RetrievalReceipt) -> HashMap<String, ExclusionReason> {
    receipt
        .omissions
        .iter()
        .map(|omission| (omission.section_id.clone(), omission.reason))
        .collect()
}

fn diagnostic_copy(class: DiagnosticClass) -> (&'static str, &'static str) {
    match class {
        DiagnosticClass::Ready => (
            "The local route produced bounded evidence.",
            "Inspect the receipt when you need candidate or budget detail.",
        ),
        DiagnosticClass::EmptyResults => (
            "No evidence matched this query in the granted bundle.",
            "Check the query or use a broader available route.",
        ),
        DiagnosticClass::LowRecall => (
            "The result may be missing required evidence.",
            "Compare the lexical and graph routes in Retrieval Lab.",
        ),
        DiagnosticClass::NoisyCandidates => (
            "The route returned more weak evidence than useful evidence.",
            "Narrow the query or add a supported metadata filter.",
        ),
        DiagnosticClass::FilterMismatch => (
            "The active filters removed every usable result.",
            "Review scope and filters; do not weaken bundle grants.",
        ),
        DiagnosticClass::StaleManifest => (
            "The receipt belongs to an older bundle fingerprint.",
            "Rebuild the disposable manifest and rerun the retained query.",
        ),
        DiagnosticClass::MissingMetadata => (
            "Some selected concepts lack metadata that would improve retrieval or interpretation.",
            "Review the advisory repairs before staging any bundle change.",
        ),
        DiagnosticClass::ConflictingEvidence => (
            "Selected sources make competing claims and no authority rule resolves them.",
            "Inspect both sources and keep the answer abstaining until authority is established.",
        ),
        DiagnosticClass::BudgetOmission => (
            "Relevant evidence was omitted because a coherent unit did not fit the context budget.",
            "Narrow the scope or rerun with a larger supported budget.",
        ),
        DiagnosticClass::ProviderFailure => (
            "An optional provider was unavailable or its disclosure was not granted.",
            "Continue with the named local fallback or configure the provider explicitly.",
        ),
        DiagnosticClass::GenerationNonUse => (
            "The answer did not use evidence that Studio delivered.",
            "Inspect answer citations separately from retrieval quality.",
        ),
    }
}

fn repair(
    receipt: &RetrievalReceipt,
    unit: &super::RetrievalUnit,
    kind: RepairKind,
    rationale: &str,
) -> RepairProposal {
    let kind_label = format!("{kind:?}");
    RepairProposal {
        proposal_id: stable_hash(&[
            "okf-retrieval-repair-v1",
            receipt.receipt_id.as_str(),
            unit.concept_id.as_str(),
            kind_label.as_str(),
        ]),
        kind,
        concept_id: unit.concept_id.clone(),
        rationale: rationale.to_string(),
        evidence_section_ids: vec![unit.section_id.clone()],
        expected_query: receipt.query.clone(),
        held_out_queries: vec![unit.concept_id.clone(), unit.concept_title.clone()],
        expected_improvement: format!(
            "Improve retrieval of {} without reducing exact lookup for its identity or title.",
            unit.concept_id
        ),
        requires_review: true,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::retrieval::{retrieve, RetrievalRequest, RetrievalRoute};
    use crate::{Bundle, Concept, Confidence};
    use std::collections::BTreeMap;

    #[test]
    fn receipt_diff_is_stable_and_reports_route_scope_and_budget_changes() {
        let bundle = fixture_bundle();
        let left = retrieve(
            &bundle,
            &RetrievalRequest {
                query: "alpha".to_string(),
                context_budget_tokens: 80,
                ..RetrievalRequest::default()
            },
        );
        let right = retrieve(
            &bundle,
            &RetrievalRequest {
                query: "alpha".to_string(),
                route: Some(RetrievalRoute::LexicalGraph),
                context_budget_tokens: 400,
                ..RetrievalRequest::default()
            },
        );

        let diff = diff_receipts(&left.receipt, &right.receipt);
        assert!(diff.route_changed);
        assert!(diff.token_delta >= 0);
        assert_eq!(diff, diff_receipts(&left.receipt, &right.receipt));
    }

    #[test]
    fn repair_suggestions_remain_advisory_and_evidence_bound() {
        let result = retrieve(
            &fixture_bundle(),
            &RetrievalRequest {
                query: "alpha".to_string(),
                ..RetrievalRequest::default()
            },
        );

        assert!(result
            .repairs
            .iter()
            .all(|proposal| proposal.requires_review));
        assert!(result
            .repairs
            .iter()
            .all(|proposal| !proposal.evidence_section_ids.is_empty()));
        assert!(result
            .repairs
            .iter()
            .all(|proposal| !proposal.held_out_queries.is_empty()
                && !proposal.expected_improvement.is_empty()));
        assert!(result
            .repairs
            .iter()
            .all(|proposal| proposal.kind != RepairKind::AddCitation));
    }

    #[test]
    fn healthy_unsourced_evidence_does_not_create_speculative_repairs() {
        let mut healthy = fixture_bundle();
        let concept = &mut healthy.concepts[0];
        concept.description = "A complete local concept.".to_string();
        concept.broken_links.clear();

        let result = retrieve(
            &healthy,
            &RetrievalRequest {
                query: "alpha".to_string(),
                ..RetrievalRequest::default()
            },
        );

        assert_eq!(result.diagnostic.class, DiagnosticClass::Ready);
        assert!(result.repairs.is_empty());
    }

    fn fixture_bundle() -> Bundle {
        Bundle {
            root: String::new(),
            name: "Fixture".to_string(),
            okf_version: Some("0.1".to_string()),
            odsf_version: None,
            extra: Default::default(),
            concepts: vec![Concept {
                id: "alpha".to_string(),
                concept_type: "Topic".to_string(),
                title: "Alpha".to_string(),
                description: String::new(),
                tags: Vec::new(),
                timestamp: None,
                resource: None,
                extra: BTreeMap::new(),
                body: format!("# Alpha\n\n{}", "alpha evidence ".repeat(50)),
                links: Vec::new(),
                external_links: Vec::new(),
                broken_links: vec!["missing".to_string()],
                cited_by: Vec::new(),
                degree: 0,
                ..Default::default()
            }],
            indexes: Vec::new(),
            log: Vec::new(),
            issues: Vec::new(),
            confidence: Confidence::Confident,
        }
    }
}
