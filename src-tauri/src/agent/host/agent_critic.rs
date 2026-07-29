//! A bounded, read-only critic contract for validated OKF artifacts.
//!
//! Critic prose is never authority. Studio accepts only an `okf-critic`
//! envelope whose references resolve against the exact artifact revision.

use crate::agent_artifact::{
    self, AgentArtifact, AgentArtifactValidation, AgentArtifactVerification,
};
use okf_core::Bundle;
use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;

const CRITIC_FENCE: &str = "```okf-critic";
const MAX_CRITIC_INPUT_CHARS: usize = 131_072;
const MAX_CRITIC_PROMPT_CHARS: usize = 128 * 1024;
const MAX_CRITIC_FINDINGS: usize = 128;
const MAX_CRITIC_LIMITATIONS: usize = 32;
const MAX_TEXT_CHARS: usize = 4_096;
const MAX_ID_CHARS: usize = 128;
const MAX_CONTEXT_PATHS: usize = 24;

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq, PartialOrd, Ord)]
#[serde(rename_all = "kebab-case")]
pub enum AgentCriticCategory {
    Coverage,
    Contradictions,
    UnsupportedClaims,
    MissedRelationships,
    Clarity,
    Redundancy,
    Structure,
    VoiceFit,
    ClaimPreservation,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum AgentCriticCheckStatus {
    Checked,
    Unavailable,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum AgentCriticFindingSeverity {
    Error,
    Warning,
    Question,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum AgentCriticFindingBasis {
    Evidence,
    Inference,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum AgentCriticReferenceKind {
    Field,
    Concept,
    Source,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum AgentCriticRuleRelationship {
    Agrees,
    Disagrees,
}

#[derive(Clone, Copy, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum AgentCriticOutcome {
    ConcernsFound,
    NoConcerns,
    Inconclusive,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AgentCriticLimitation {
    pub code: String,
    pub detail: String,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AgentCriticRequest {
    pub artifact_id: String,
    pub artifact_revision: u32,
    pub bundle_fingerprint: String,
    pub prompt: String,
    pub context_paths: Vec<String>,
    pub deterministic_verification: AgentArtifactVerification,
    pub limitations: Vec<AgentCriticLimitation>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct CriticEnvelope {
    schema_version: u32,
    artifact_id: String,
    artifact_revision: u32,
    bundle_fingerprint: String,
    checks: Vec<CriticCheckInput>,
    #[serde(default)]
    findings: Vec<CriticFindingInput>,
    #[serde(default)]
    limitations: Vec<CriticLimitationInput>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct CriticCheckInput {
    category: AgentCriticCategory,
    status: AgentCriticCheckStatus,
    detail: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct CriticFindingInput {
    id: String,
    category: AgentCriticCategory,
    severity: AgentCriticFindingSeverity,
    basis: AgentCriticFindingBasis,
    claim: String,
    references: Vec<CriticReferenceInput>,
    #[serde(default)]
    deterministic_rule_ids: Vec<String>,
    deterministic_relationship: Option<AgentCriticRuleRelationship>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct CriticReferenceInput {
    kind: AgentCriticReferenceKind,
    id: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct CriticLimitationInput {
    code: String,
    detail: String,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AgentCriticCheck {
    pub category: AgentCriticCategory,
    pub status: AgentCriticCheckStatus,
    pub detail: String,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AgentCriticReference {
    pub kind: AgentCriticReferenceKind,
    pub id: String,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AgentCriticFinding {
    pub id: String,
    pub category: AgentCriticCategory,
    pub severity: AgentCriticFindingSeverity,
    pub basis: AgentCriticFindingBasis,
    pub claim: String,
    pub references: Vec<AgentCriticReference>,
    pub deterministic_rule_ids: Vec<String>,
    pub deterministic_relationship: Option<AgentCriticRuleRelationship>,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AgentCriticComparison {
    pub agreements: Vec<String>,
    pub disagreements: Vec<String>,
    pub unverified_questions: Vec<String>,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AgentCriticReport {
    pub artifact_id: String,
    pub artifact_revision: u32,
    pub bundle_fingerprint: String,
    pub outcome: AgentCriticOutcome,
    pub completion_blocked: bool,
    pub checks: Vec<AgentCriticCheck>,
    pub findings: Vec<AgentCriticFinding>,
    pub limitations: Vec<AgentCriticLimitation>,
    pub comparison: AgentCriticComparison,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(
    tag = "status",
    rename_all = "kebab-case",
    rename_all_fields = "camelCase"
)]
pub enum AgentCriticValidation {
    Invalid { message: String },
    Ready { report: AgentCriticReport },
}

pub fn prepare(markdown: &str, bundle: &Bundle) -> Result<AgentCriticRequest, String> {
    let artifact = validated_artifact(markdown, bundle)?;
    let context_paths = artifact
        .concept_references
        .iter()
        .filter(|reference| reference.exists)
        .take(MAX_CONTEXT_PATHS)
        .map(|reference| reference.path.clone())
        .collect::<Vec<_>>();
    let artifact_json = serde_json::to_string_pretty(&artifact)
        .map_err(|_| "Studio could not encode the validated artifact for critique.".to_string())?;
    let evidence_json = critic_evidence_json(bundle, &context_paths)?;
    let prompt = critic_prompt(
        &artifact.artifact_id,
        artifact.revision,
        artifact.kind,
        &artifact_json,
        &evidence_json,
    );
    if prompt.chars().count() > MAX_CRITIC_PROMPT_CHARS {
        return Err(
            "The artifact and its declared concept evidence exceed the isolated critic limit. Reduce the artifact scope before running the critic."
                .to_string(),
        );
    }
    Ok(AgentCriticRequest {
        artifact_id: artifact.artifact_id.clone(),
        artifact_revision: artifact.revision,
        bundle_fingerprint: artifact.bundle_fingerprint.clone(),
        context_paths,
        deterministic_verification: artifact.verification.clone(),
        limitations: host_limitations(),
        prompt,
    })
}

pub fn validate(
    artifact_markdown: &str,
    critic_markdown: &str,
    bundle: &Bundle,
) -> AgentCriticValidation {
    let artifact = match validated_artifact(artifact_markdown, bundle) {
        Ok(artifact) => artifact,
        Err(message) => return invalid(&message),
    };
    if critic_markdown.chars().count() > MAX_CRITIC_INPUT_CHARS {
        return invalid("The critic response is too large to validate.");
    }
    let Some(json) = fenced_json(critic_markdown) else {
        return invalid("The critic did not return a complete okf-critic envelope.");
    };
    let envelope = match serde_json::from_str::<CriticEnvelope>(json) {
        Ok(envelope) => envelope,
        Err(error) => return invalid(&format!("The critic JSON is invalid: {error}")),
    };
    match validate_envelope(envelope, &artifact) {
        Ok(report) => AgentCriticValidation::Ready { report },
        Err(message) => invalid(&message),
    }
}

fn validated_artifact(markdown: &str, bundle: &Bundle) -> Result<Box<AgentArtifact>, String> {
    match agent_artifact::validate(markdown, bundle) {
        AgentArtifactValidation::Ready { artifact } => Ok(artifact),
        AgentArtifactValidation::Invalid { message } => Err(message),
        AgentArtifactValidation::None => {
            Err("No validated OKF artifact is available for critique.".to_string())
        }
    }
}

fn validate_envelope(
    envelope: CriticEnvelope,
    artifact: &AgentArtifact,
) -> Result<AgentCriticReport, String> {
    if envelope.schema_version != 1 {
        return Err("Critic schemaVersion must be 1.".to_string());
    }
    if envelope.artifact_id != artifact.artifact_id
        || envelope.artifact_revision != artifact.revision
        || envelope.bundle_fingerprint != artifact.bundle_fingerprint
    {
        return Err(
            "The critic result targets a different artifact or bundle revision.".to_string(),
        );
    }
    if envelope.findings.len() > MAX_CRITIC_FINDINGS {
        return Err(format!(
            "The critic returned too many findings; the maximum is {MAX_CRITIC_FINDINGS}."
        ));
    }
    if envelope.limitations.len() > MAX_CRITIC_LIMITATIONS {
        return Err(format!(
            "The critic returned too many limitations; the maximum is {MAX_CRITIC_LIMITATIONS}."
        ));
    }

    let expected_categories = expected_categories(artifact.kind);
    let mut seen_categories = BTreeSet::new();
    let mut checks = Vec::with_capacity(envelope.checks.len());
    for check in envelope.checks {
        validate_text("critic check detail", &check.detail)?;
        if !seen_categories.insert(check.category) {
            return Err("The critic repeats a required check category.".to_string());
        }
        checks.push(AgentCriticCheck {
            category: check.category,
            status: check.status,
            detail: check.detail,
        });
    }
    if expected_categories
        .iter()
        .any(|category| !seen_categories.contains(category))
    {
        return Err(format!(
            "The critic must report every required {} check category.",
            if artifact.kind == agent_artifact::AgentArtifactKind::WritingRevision {
                "writing"
            } else {
                "artifact"
            }
        ));
    }

    let field_ids = artifact
        .fields
        .iter()
        .map(|field| field.id.as_str())
        .collect::<BTreeSet<_>>();
    let concept_ids = artifact
        .concept_references
        .iter()
        .map(|reference| reference.concept_id.as_str())
        .collect::<BTreeSet<_>>();
    let source_ids = artifact
        .sources
        .iter()
        .map(|source| source.id.as_str())
        .collect::<BTreeSet<_>>();
    let deterministic_ids = artifact
        .verification
        .findings
        .iter()
        .map(|finding| finding.rule_id)
        .collect::<BTreeSet<_>>();
    let mut seen_finding_ids = BTreeSet::new();
    let mut findings = Vec::with_capacity(envelope.findings.len());
    for finding in envelope.findings {
        validate_id("critic finding id", &finding.id)?;
        validate_text("critic finding claim", &finding.claim)?;
        if !seen_finding_ids.insert(finding.id.clone()) {
            return Err(format!("Critic finding {} is duplicated.", finding.id));
        }
        if finding.references.is_empty() {
            return Err(format!(
                "Critic finding {} has no resolvable artifact reference.",
                finding.id
            ));
        }
        if finding.basis == AgentCriticFindingBasis::Inference
            && finding.severity != AgentCriticFindingSeverity::Question
        {
            return Err(
                "A critic inference must remain an unverified question, not evidence.".to_string(),
            );
        }
        let mut seen_references = BTreeSet::new();
        let mut references = Vec::with_capacity(finding.references.len());
        for reference in finding.references {
            validate_id("critic reference", &reference.id)?;
            let resolves = match reference.kind {
                AgentCriticReferenceKind::Field => field_ids.contains(reference.id.as_str()),
                AgentCriticReferenceKind::Concept => concept_ids.contains(reference.id.as_str()),
                AgentCriticReferenceKind::Source => source_ids.contains(reference.id.as_str()),
            };
            if !resolves {
                return Err(format!(
                    "Critic finding {} references unknown {:?} {}.",
                    finding.id, reference.kind, reference.id
                ));
            }
            if !seen_references.insert((reference.kind as u8, reference.id.clone())) {
                return Err(format!(
                    "Critic finding {} repeats an artifact reference.",
                    finding.id
                ));
            }
            references.push(AgentCriticReference {
                kind: reference.kind,
                id: reference.id,
            });
        }

        let mut seen_rules = BTreeSet::new();
        for rule_id in &finding.deterministic_rule_ids {
            validate_id("deterministic rule id", rule_id)?;
            if !deterministic_ids.contains(rule_id.as_str()) {
                return Err(format!(
                    "Critic finding {} names unknown deterministic rule {rule_id}.",
                    finding.id
                ));
            }
            if !seen_rules.insert(rule_id) {
                return Err(format!(
                    "Critic finding {} repeats deterministic rule {rule_id}.",
                    finding.id
                ));
            }
        }
        if finding.deterministic_rule_ids.is_empty() != finding.deterministic_relationship.is_none()
        {
            return Err(
                "A deterministic comparison requires both rule IDs and an agree or disagree relationship."
                    .to_string(),
            );
        }
        findings.push(AgentCriticFinding {
            id: finding.id,
            category: finding.category,
            severity: finding.severity,
            basis: finding.basis,
            claim: finding.claim,
            references,
            deterministic_rule_ids: finding.deterministic_rule_ids,
            deterministic_relationship: finding.deterministic_relationship,
        });
    }

    let has_reported_limitations = !envelope.limitations.is_empty();
    let mut limitations = host_limitations();
    let mut limitation_codes = limitations
        .iter()
        .map(|limitation| limitation.code.clone())
        .collect::<BTreeSet<_>>();
    for limitation in envelope.limitations {
        validate_id("critic limitation code", &limitation.code)?;
        validate_text("critic limitation detail", &limitation.detail)?;
        if !limitation_codes.insert(limitation.code.clone()) {
            return Err(format!(
                "Critic limitation code {} is duplicated or reserved by Studio.",
                limitation.code
            ));
        }
        limitations.push(AgentCriticLimitation {
            code: limitation.code,
            detail: limitation.detail,
        });
    }
    if checks
        .iter()
        .any(|check| check.status == AgentCriticCheckStatus::Unavailable)
        && !has_reported_limitations
    {
        return Err("Unavailable critic checks require an explicit limitation.".to_string());
    }

    let comparison = AgentCriticComparison {
        agreements: findings
            .iter()
            .filter(|finding| {
                finding.deterministic_relationship == Some(AgentCriticRuleRelationship::Agrees)
            })
            .map(|finding| finding.id.clone())
            .collect(),
        disagreements: findings
            .iter()
            .filter(|finding| {
                finding.deterministic_relationship == Some(AgentCriticRuleRelationship::Disagrees)
            })
            .map(|finding| finding.id.clone())
            .collect(),
        unverified_questions: findings
            .iter()
            .filter(|finding| {
                finding.basis == AgentCriticFindingBasis::Inference
                    || finding.severity == AgentCriticFindingSeverity::Question
            })
            .map(|finding| finding.id.clone())
            .collect(),
    };
    let unavailable = checks
        .iter()
        .any(|check| check.status == AgentCriticCheckStatus::Unavailable);
    let concerns = findings.iter().any(|finding| {
        matches!(
            finding.severity,
            AgentCriticFindingSeverity::Error | AgentCriticFindingSeverity::Warning
        )
    });
    let outcome = if unavailable {
        AgentCriticOutcome::Inconclusive
    } else if concerns {
        AgentCriticOutcome::ConcernsFound
    } else {
        AgentCriticOutcome::NoConcerns
    };
    Ok(AgentCriticReport {
        artifact_id: artifact.artifact_id.clone(),
        artifact_revision: artifact.revision,
        bundle_fingerprint: artifact.bundle_fingerprint.clone(),
        outcome,
        completion_blocked: artifact.verification.completion_blocked,
        checks,
        findings,
        limitations,
        comparison,
    })
}

fn critic_evidence_json(bundle: &Bundle, context_paths: &[String]) -> Result<String, String> {
    let evidence = context_paths
        .iter()
        .map(|path| {
            let concept_id = path.strip_suffix(".md").unwrap_or(path);
            let concept = bundle
                .concepts
                .iter()
                .find(|concept| concept.id == concept_id)
                .ok_or_else(|| format!("Declared critic evidence {path} is unavailable."))?;
            Ok(serde_json::json!({
                "id": concept.id,
                "path": path,
                "type": concept.concept_type,
                "title": concept.title,
                "description": concept.description,
                "body": concept.body,
                "links": concept.links,
                "citedBy": concept.cited_by,
            }))
        })
        .collect::<Result<Vec<_>, String>>()?;
    serde_json::to_string_pretty(&evidence)
        .map_err(|_| "Studio could not encode the declared critic evidence.".to_string())
}

fn critic_prompt(
    artifact_id: &str,
    artifact_revision: u32,
    artifact_kind: agent_artifact::AgentArtifactKind,
    artifact_json: &str,
    evidence_json: &str,
) -> String {
    let checks = if artifact_kind == agent_artifact::AgentArtifactKind::WritingRevision {
        "clarity, redundancy, structure, voice fit, and claim preservation"
    } else {
        "coverage, contradictions, unsupported claims, and missed relationships"
    };
    let check_count = expected_categories(artifact_kind).len();
    format!(
        "OKF critic pass for {artifact_id}, revision {artifact_revision}.\n\nYou are an independent read-only OKF critic. Review only the validated artifact and the exact declared bundle evidence embedded below. You have no tools. Check {checks}. Do not edit, stage, approve, apply, expand scope, fetch new evidence, or present inference as evidence. A deterministic error remains blocking even if you find no concern. Return concise prose followed by exactly one JSON object in an okf-critic fence. Use schemaVersion 1; bind artifactId, artifactRevision, and bundleFingerprint exactly; report all {check_count} required categories with checked or unavailable status; give every finding an artifact field, concept, or source reference; use basis inference only with severity question; and name unavailable checks in limitations. Unknown fields are rejected.\n\nValidated artifact:\n```json\n{artifact_json}\n```\n\nExact declared concept evidence:\n```json\n{evidence_json}\n```"
    )
}

fn expected_categories(
    artifact_kind: agent_artifact::AgentArtifactKind,
) -> &'static [AgentCriticCategory] {
    if artifact_kind == agent_artifact::AgentArtifactKind::WritingRevision {
        &[
            AgentCriticCategory::Clarity,
            AgentCriticCategory::Redundancy,
            AgentCriticCategory::Structure,
            AgentCriticCategory::VoiceFit,
            AgentCriticCategory::ClaimPreservation,
        ]
    } else {
        &[
            AgentCriticCategory::Coverage,
            AgentCriticCategory::Contradictions,
            AgentCriticCategory::UnsupportedClaims,
            AgentCriticCategory::MissedRelationships,
        ]
    }
}

fn host_limitations() -> Vec<AgentCriticLimitation> {
    vec![
        AgentCriticLimitation {
            code: "isolated-read-only-session".to_string(),
            detail: "Studio Agent runs the critic in a separate session with no write grant and an empty tool catalog."
                .to_string(),
        },
        AgentCriticLimitation {
            code: "artifact-bounded-evidence".to_string(),
            detail: "Rust embeds the validated artifact and exact content of at most 24 declared current concepts; the critic receives no user attachments or new external evidence."
                .to_string(),
        },
    ]
}

fn fenced_json(markdown: &str) -> Option<&str> {
    let start = markdown.rfind(CRITIC_FENCE)? + CRITIC_FENCE.len();
    let after_marker = markdown.get(start..)?;
    let content_start = after_marker.find('\n')? + start + 1;
    let remainder = markdown.get(content_start..)?;
    let end = remainder.find("\n```")? + content_start;
    markdown.get(content_start..end).map(str::trim)
}

fn validate_id(name: &str, value: &str) -> Result<(), String> {
    if value.is_empty()
        || value.chars().count() > MAX_ID_CHARS
        || !value.bytes().all(|byte| {
            byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.' | b':' | b'/')
        })
    {
        return Err(format!("The {name} is not a bounded portable identifier."));
    }
    Ok(())
}

fn validate_text(name: &str, value: &str) -> Result<(), String> {
    if value.trim().is_empty()
        || value.chars().count() > MAX_TEXT_CHARS
        || value
            .chars()
            .any(|character| character.is_control() && !matches!(character, '\n' | '\r' | '\t'))
    {
        return Err(format!("The {name} is empty, unsafe, or too large."));
    }
    Ok(())
}

fn invalid(message: &str) -> AgentCriticValidation {
    AgentCriticValidation::Invalid {
        message: message.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use okf_core::{health, read_bundle};
    use std::path::Path;

    fn docs() -> Bundle {
        read_bundle(Path::new(concat!(env!("CARGO_MANIFEST_DIR"), "/../docs")))
    }

    fn artifact_markdown(bundle: &Bundle, partial: bool) -> String {
        let fields = if partial {
            serde_json::json!([{
                "id": "question",
                "label": "Question",
                "value": "Does the panel apply changes directly?",
                "editable": true
            }])
        } else {
            serde_json::json!([
                {"id": "question", "label": "Question", "value": "Does the panel apply changes directly?", "editable": true},
                {"id": "conclusion", "label": "Conclusion", "value": "Yes, every change is applied immediately.", "editable": true}
            ])
        };
        format!(
            "```okf-artifact\n{}\n```",
            serde_json::json!({
                "schemaVersion": 1,
                "artifactId": "critic-seed",
                "kind": "research-brief",
                "revision": 2,
                "parentRevision": 1,
                "bundleFingerprint": health::bundle_fingerprint(bundle),
                "title": "Research brief",
                "status": if partial { "partial" } else { "complete" },
                "summary": "The conclusion overstates the cited panel contract.",
                "conceptPaths": ["features/agent-panel.md"],
                "sources": [{
                    "id": "panel-source",
                    "label": "Agent panel",
                    "kind": "bundle",
                    "reference": "features/agent-panel.md"
                }],
                "citations": [{"sourceId": "panel-source", "claim": "The panel is bundle scoped."}],
                "fields": fields,
                "items": []
            })
        )
    }

    fn critic_markdown(bundle: &Bundle, include_finding: bool) -> String {
        let findings = if include_finding {
            serde_json::json!([{
                "id": "immediate-apply-contradiction",
                "category": "contradictions",
                "severity": "error",
                "basis": "evidence",
                "claim": "The conclusion says changes apply immediately, while the cited concept requires reviewed staging.",
                "references": [
                    {"kind": "field", "id": "conclusion"},
                    {"kind": "concept", "id": "features/agent-panel"},
                    {"kind": "source", "id": "panel-source"}
                ],
                "deterministicRuleIds": [],
                "deterministicRelationship": null
            }])
        } else {
            serde_json::json!([])
        };
        format!(
            "```okf-critic\n{}\n```",
            serde_json::json!({
                "schemaVersion": 1,
                "artifactId": "critic-seed",
                "artifactRevision": 2,
                "bundleFingerprint": health::bundle_fingerprint(bundle),
                "checks": [
                    {"category": "coverage", "status": "checked", "detail": "Required fields and declared scope were reviewed."},
                    {"category": "contradictions", "status": "checked", "detail": "The conclusion conflicts with the cited concept."},
                    {"category": "unsupported-claims", "status": "checked", "detail": "The conclusion is not supported by the cited source."},
                    {"category": "missed-relationships", "status": "checked", "detail": "No additional relationship was required for this claim."}
                ],
                "findings": findings,
                "limitations": []
            })
        )
    }

    /// The critic report with `omit` dropped and `unavailable` marked, so the
    /// early-victory shapes can be built without a second fixture.
    fn critic_markdown_with(bundle: &Bundle, omit: &[&str], unavailable: &[&str]) -> String {
        let checks: Vec<serde_json::Value> = [
            (
                "coverage",
                "Required fields and declared scope were reviewed.",
            ),
            ("contradictions", "No conflict was found."),
            ("unsupported-claims", "Every claim traced to a source."),
            (
                "missed-relationships",
                "No additional relationship was required.",
            ),
        ]
        .into_iter()
        .filter(|(category, _)| !omit.contains(category))
        .map(|(category, detail)| {
            serde_json::json!({
                "category": category,
                "status": if unavailable.contains(&category) { "unavailable" } else { "checked" },
                "detail": detail,
            })
        })
        .collect();
        format!(
            "```okf-critic\n{}\n```",
            serde_json::json!({
                "schemaVersion": 1,
                "artifactId": "critic-seed",
                "artifactRevision": 2,
                "bundleFingerprint": health::bundle_fingerprint(bundle),
                "checks": checks,
                "findings": [],
                // An unavailable check has to be named as a limitation, so the
                // fixture supplies one rather than tripping that separate rule.
                "limitations": unavailable
                    .iter()
                    .map(|category| serde_json::json!({
                        "code": "evidence-not-available",
                        "detail": format!("The {category} check could not be run."),
                    }))
                    .collect::<Vec<_>>(),
            })
        )
    }

    fn writing_artifact_markdown(bundle: &Bundle) -> String {
        format!(
            "```okf-artifact\n{}\n```",
            serde_json::json!({
                "schemaVersion": 1,
                "artifactId": "writing-critic-seed",
                "kind": "writing-revision",
                "revision": 1,
                "parentRevision": null,
                "bundleFingerprint": health::bundle_fingerprint(bundle),
                "title": "Agent panel writing revision",
                "status": "complete",
                "summary": "Lead with the review boundary.",
                "conceptPaths": ["features/agent-panel.md"],
                "sources": [{
                    "id": "panel-source",
                    "label": "Agent panel",
                    "kind": "bundle",
                    "reference": "features/agent-panel.md"
                }],
                "citations": [],
                "fields": [
                    {"id": "reader-job", "label": "Reader job", "value": "Explain the boundary.", "editable": false},
                    {"id": "purpose", "label": "Purpose", "value": "Improve directness.", "editable": false},
                    {"id": "revision-mode", "label": "Revision mode", "value": "style-only", "editable": false}
                ],
                "items": [{
                    "id": "review-boundary",
                    "label": "Review boundary",
                    "detail": "Reworded without changing meaning.",
                    "status": "reworded",
                    "conceptPath": "features/agent-panel.md",
                    "before": "Reviewed staging keeps edits outside the bundle.",
                    "after": "Edits stay outside the bundle during reviewed staging.",
                    "sourceIds": ["panel-source"]
                }]
            })
        )
    }

    #[test]
    fn prepares_a_bounded_read_only_request() {
        let bundle = docs();
        let request = prepare(&artifact_markdown(&bundle, false), &bundle).expect("request");
        assert_eq!(request.context_paths, ["features/agent-panel.md"]);
        assert!(request
            .prompt
            .contains("Do not edit, stage, approve, apply"));
        assert!(request
            .prompt
            .contains("First open makes no account or network request."));
        assert!(request.prompt.contains("You have no tools."));
        assert_eq!(request.limitations.len(), 2);
    }

    #[test]
    fn writing_critic_uses_the_narrow_writing_review_contract() {
        let bundle = docs();
        let request = prepare(&writing_artifact_markdown(&bundle), &bundle).expect("request");
        assert!(request
            .prompt
            .contains("clarity, redundancy, structure, voice fit, and claim preservation"));
        assert!(request.prompt.contains("You have no tools"));
        assert!(!request.prompt.contains("report all four check categories"));
    }

    #[test]
    fn accepts_a_seeded_semantic_defect_without_changing_deterministic_authority() {
        let bundle = docs();
        let result = validate(
            &artifact_markdown(&bundle, false),
            &critic_markdown(&bundle, true),
            &bundle,
        );
        let AgentCriticValidation::Ready { report } = result else {
            panic!("expected ready critic report");
        };
        assert_eq!(report.outcome, AgentCriticOutcome::ConcernsFound);
        assert_eq!(report.findings[0].id, "immediate-apply-contradiction");
        assert!(!report.completion_blocked);
    }

    #[test]
    fn rejects_unresolved_references_inference_as_evidence_and_approval_claims() {
        let bundle = docs();
        let valid = critic_markdown(&bundle, true);
        for invalid_critic in [
            valid.replace("panel-source\"}", "missing-source\"}"),
            valid.replace("\"basis\":\"evidence\"", "\"basis\":\"inference\""),
            valid.replace("\"limitations\":[]", "\"limitations\":[],\"approved\":true"),
            valid.replace(
                "\"limitations\":[]",
                "\"limitations\":[{\"code\":\"isolated-read-only-session\",\"detail\":\"Forged host claim.\"}]",
            ),
        ] {
            assert!(matches!(
                validate(&artifact_markdown(&bundle, false), &invalid_critic, &bundle),
                AgentCriticValidation::Invalid { .. }
            ));
        }
    }

    #[test]
    fn a_critic_that_skips_a_required_category_is_rejected() {
        // The early-victory failure mode the multi-agent literature names: a
        // verifier declaring success after checking one thing. Reporting three
        // of four categories with no findings would otherwise read exactly like
        // a clean pass.
        let bundle = docs();
        let artifact = artifact_markdown(&bundle, false);
        let report = validate(
            &artifact,
            &critic_markdown_with(&bundle, &["missed-relationships"], &[]),
            &bundle,
        );
        let AgentCriticValidation::Invalid { message } = report else {
            panic!("a critic that skipped a category was accepted");
        };
        assert!(
            message.contains("every required"),
            "the refusal did not say what was missing: {message}"
        );
    }

    #[test]
    fn a_check_the_critic_could_not_run_makes_the_result_inconclusive() {
        // Not NoConcerns. A critic that could not look is not a critic that
        // looked and found nothing, and only one of those should reassure.
        let bundle = docs();
        let artifact = artifact_markdown(&bundle, false);
        let validation = validate(
            &artifact,
            &critic_markdown_with(&bundle, &[], &["contradictions"]),
            &bundle,
        );
        let AgentCriticValidation::Ready { report } = validation else {
            panic!("a critic with an unavailable check was rejected outright");
        };
        assert_eq!(report.outcome, AgentCriticOutcome::Inconclusive);
    }

    #[test]
    fn a_complete_critic_with_nothing_to_report_is_a_clean_pass() {
        // The control for the two above: all four categories checked and no
        // findings is the one shape that may read as clean.
        let bundle = docs();
        let artifact = artifact_markdown(&bundle, false);
        let validation = validate(&artifact, &critic_markdown_with(&bundle, &[], &[]), &bundle);
        let AgentCriticValidation::Ready { report } = validation else {
            panic!("a complete critic report was rejected");
        };
        assert_eq!(report.outcome, AgentCriticOutcome::NoConcerns);
        assert_eq!(report.checks.len(), 4);
    }

    #[test]
    fn deterministic_errors_remain_blocking_when_the_critic_reports_no_concerns() {
        let bundle = docs();
        let partial = artifact_markdown(&bundle, true);
        let no_findings = critic_markdown(&bundle, false);
        let AgentCriticValidation::Ready { report } = validate(&partial, &no_findings, &bundle)
        else {
            panic!("expected ready critic report");
        };
        assert!(report.completion_blocked);
        assert_eq!(report.outcome, AgentCriticOutcome::NoConcerns);
    }
}
