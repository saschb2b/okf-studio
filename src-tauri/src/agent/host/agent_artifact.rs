//! Validation for structured work emitted by any connected agent.
//!
//! The transcript remains the source of raw agent prose. Only a bounded
//! `okf-artifact` JSON fence that passes this module may cross IPC as trusted
//! structure.

use okf_core::health;
use okf_core::Bundle;
use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;

const ARTIFACT_FENCE: &str = "```okf-artifact";
const MAX_ARTIFACT_INPUT_CHARS: usize = 262_144;
const MAX_ARTIFACT_ID_CHARS: usize = 128;
const MAX_TITLE_CHARS: usize = 200;
const MAX_SUMMARY_CHARS: usize = 4_096;
const MAX_FIELD_VALUE_CHARS: usize = 8_192;
const MAX_PATH_CHARS: usize = 1_024;
const MAX_REFERENCE_CHARS: usize = 4_096;
const MAX_FIELDS: usize = 64;
const MAX_ITEMS: usize = 512;
const MAX_CONCEPT_PATHS: usize = 512;
const MAX_SOURCES: usize = 128;
const MAX_CITATIONS: usize = 256;
const LARGE_ITEM_COUNT: usize = 100;
const LARGE_TEXT_CHARS: usize = 32_768;

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum AgentArtifactKind {
    SourceInventory,
    BundlePlan,
    HealthReport,
    ResearchBrief,
    ChangeImpactMap,
    MigrationPlan,
    WritingRevision,
    StagedRevision,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum AgentArtifactStatus {
    Partial,
    Complete,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum AgentArtifactSourceKind {
    Bundle,
    Attachment,
    External,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum AgentArtifactItemStatus {
    Pending,
    InProgress,
    Complete,
    Blocked,
    Advisory,
    Unchanged,
    Reworded,
    Added,
    Removed,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct ArtifactEnvelope {
    schema_version: u32,
    artifact_id: String,
    kind: AgentArtifactKind,
    revision: u32,
    parent_revision: Option<u32>,
    bundle_fingerprint: String,
    title: String,
    status: AgentArtifactStatus,
    summary: String,
    #[serde(default)]
    concept_paths: Vec<String>,
    #[serde(default)]
    sources: Vec<ArtifactSourceInput>,
    #[serde(default)]
    citations: Vec<ArtifactCitationInput>,
    #[serde(default)]
    fields: Vec<ArtifactFieldInput>,
    #[serde(default)]
    items: Vec<ArtifactItemInput>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct ArtifactSourceInput {
    id: String,
    label: String,
    kind: AgentArtifactSourceKind,
    reference: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct ArtifactCitationInput {
    source_id: String,
    claim: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct ArtifactFieldInput {
    id: String,
    label: String,
    value: String,
    #[serde(default)]
    editable: bool,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct ArtifactItemInput {
    id: String,
    label: String,
    detail: String,
    status: AgentArtifactItemStatus,
    concept_path: Option<String>,
    #[serde(default)]
    before: Option<String>,
    #[serde(default)]
    after: Option<String>,
    #[serde(default)]
    source_ids: Vec<String>,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AgentArtifact {
    pub schema_version: u32,
    pub artifact_id: String,
    pub kind: AgentArtifactKind,
    pub revision: u32,
    pub parent_revision: Option<u32>,
    pub bundle_fingerprint: String,
    pub title: String,
    pub status: AgentArtifactStatus,
    pub summary: String,
    pub concept_references: Vec<AgentArtifactConceptReference>,
    pub sources: Vec<AgentArtifactSource>,
    pub citations: Vec<AgentArtifactCitation>,
    pub fields: Vec<AgentArtifactField>,
    pub items: Vec<AgentArtifactItem>,
    pub missing_fields: Vec<String>,
    pub large: bool,
    pub verification: AgentArtifactVerification,
}

#[derive(Clone, Copy, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum AgentArtifactVerificationCategory {
    Completeness,
    Evidence,
    Identity,
}

#[derive(Clone, Copy, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum AgentArtifactVerificationLevel {
    Error,
    Warning,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AgentArtifactVerificationFinding {
    pub rule_id: &'static str,
    pub rule_version: u32,
    pub category: AgentArtifactVerificationCategory,
    pub level: AgentArtifactVerificationLevel,
    pub message: String,
    pub field_ids: Vec<String>,
    pub concept_ids: Vec<String>,
    pub source_ids: Vec<String>,
}

#[derive(Clone, Debug, Default, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AgentArtifactVerification {
    pub errors: usize,
    pub warnings: usize,
    pub completion_blocked: bool,
    pub findings: Vec<AgentArtifactVerificationFinding>,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AgentArtifactConceptReference {
    pub path: String,
    pub concept_id: String,
    pub exists: bool,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AgentArtifactSource {
    pub id: String,
    pub label: String,
    pub kind: AgentArtifactSourceKind,
    pub reference: String,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AgentArtifactCitation {
    pub source_id: String,
    pub claim: String,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AgentArtifactField {
    pub id: String,
    pub label: String,
    pub value: String,
    pub editable: bool,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AgentArtifactItem {
    pub id: String,
    pub label: String,
    pub detail: String,
    pub status: AgentArtifactItemStatus,
    pub concept_path: Option<String>,
    pub before: Option<String>,
    pub after: Option<String>,
    pub source_ids: Vec<String>,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(
    tag = "status",
    rename_all = "kebab-case",
    rename_all_fields = "camelCase"
)]
pub enum AgentArtifactValidation {
    None,
    Invalid { message: String },
    Ready { artifact: Box<AgentArtifact> },
}

pub fn validate(markdown: &str, bundle: &Bundle) -> AgentArtifactValidation {
    let Some(json) = artifact_json(markdown) else {
        return AgentArtifactValidation::None;
    };
    if markdown.chars().count() > MAX_ARTIFACT_INPUT_CHARS {
        return invalid("The artifact response is too large to validate.");
    }
    let envelope = match serde_json::from_str::<ArtifactEnvelope>(json) {
        Ok(envelope) => envelope,
        Err(error) => {
            return invalid(&format!("The artifact JSON is invalid: {error}"));
        }
    };
    match validate_envelope(envelope, bundle) {
        Ok(artifact) => AgentArtifactValidation::Ready {
            artifact: Box::new(artifact),
        },
        Err(message) => invalid(&message),
    }
}

fn artifact_json(markdown: &str) -> Option<&str> {
    let start = markdown.rfind(ARTIFACT_FENCE)? + ARTIFACT_FENCE.len();
    let after_marker = markdown.get(start..)?;
    let content_start = after_marker.find('\n')? + start + 1;
    let remainder = markdown.get(content_start..)?;
    let end = remainder.find("\n```")? + content_start;
    markdown.get(content_start..end).map(str::trim)
}

fn validate_envelope(envelope: ArtifactEnvelope, bundle: &Bundle) -> Result<AgentArtifact, String> {
    if envelope.schema_version != 1 {
        return Err("Artifact schemaVersion must be 1.".to_string());
    }
    validate_identifier("artifactId", &envelope.artifact_id, MAX_ARTIFACT_ID_CHARS)?;
    if envelope.revision == 0 || envelope.revision > 1_000_000 {
        return Err("Artifact revision must be between 1 and 1000000.".to_string());
    }
    if envelope
        .parent_revision
        .is_some_and(|parent| parent >= envelope.revision)
    {
        return Err("Artifact parentRevision must be older than revision.".to_string());
    }
    validate_text("title", &envelope.title, MAX_TITLE_CHARS, false)?;
    validate_text("summary", &envelope.summary, MAX_SUMMARY_CHARS, true)?;
    let expected_fingerprint = health::bundle_fingerprint(bundle);
    if envelope.bundle_fingerprint != expected_fingerprint {
        return Err(
            "The artifact targets an older bundle revision. Ask the agent to inspect the current bundle and emit it again."
                .to_string(),
        );
    }
    check_count(
        "concept paths",
        envelope.concept_paths.len(),
        MAX_CONCEPT_PATHS,
    )?;
    check_count("sources", envelope.sources.len(), MAX_SOURCES)?;
    check_count("citations", envelope.citations.len(), MAX_CITATIONS)?;
    check_count("fields", envelope.fields.len(), MAX_FIELDS)?;
    check_count("items", envelope.items.len(), MAX_ITEMS)?;

    let concept_ids = bundle
        .concepts
        .iter()
        .map(|concept| concept.id.as_str())
        .collect::<BTreeSet<_>>();
    let mut seen_paths = BTreeSet::new();
    let mut concept_references = Vec::with_capacity(envelope.concept_paths.len());
    for path in envelope.concept_paths {
        let concept_id = concept_id_from_path(&path)?;
        if !seen_paths.insert(path.clone()) {
            return Err(format!("Artifact concept path {path} is duplicated."));
        }
        concept_references.push(AgentArtifactConceptReference {
            exists: concept_ids.contains(concept_id.as_str()),
            path,
            concept_id,
        });
    }

    let mut sources = Vec::with_capacity(envelope.sources.len());
    let mut source_ids = BTreeSet::new();
    for source in envelope.sources {
        validate_identifier("source id", &source.id, MAX_ARTIFACT_ID_CHARS)?;
        validate_text("source label", &source.label, MAX_TITLE_CHARS, false)?;
        validate_text(
            "source reference",
            &source.reference,
            MAX_REFERENCE_CHARS,
            false,
        )?;
        if !source_ids.insert(source.id.clone()) {
            return Err(format!("Artifact source id {} is duplicated.", source.id));
        }
        validate_source_reference(source.kind, &source.reference, &concept_ids)?;
        sources.push(AgentArtifactSource {
            id: source.id,
            label: source.label,
            kind: source.kind,
            reference: source.reference,
        });
    }

    let mut citations = Vec::with_capacity(envelope.citations.len());
    for citation in envelope.citations {
        if !source_ids.contains(&citation.source_id) {
            return Err(format!(
                "Artifact citation references unknown source {}.",
                citation.source_id
            ));
        }
        validate_text("citation claim", &citation.claim, MAX_SUMMARY_CHARS, false)?;
        citations.push(AgentArtifactCitation {
            source_id: citation.source_id,
            claim: citation.claim,
        });
    }

    let planning = is_planning_kind(envelope.kind);
    let mut field_ids = BTreeSet::new();
    let mut fields = Vec::with_capacity(envelope.fields.len());
    let mut total_text = envelope.summary.chars().count();
    for field in envelope.fields {
        validate_identifier("field id", &field.id, MAX_ARTIFACT_ID_CHARS)?;
        validate_text("field label", &field.label, MAX_TITLE_CHARS, false)?;
        validate_text("field value", &field.value, MAX_FIELD_VALUE_CHARS, true)?;
        if !field_ids.insert(field.id.clone()) {
            return Err(format!("Artifact field id {} is duplicated.", field.id));
        }
        if field.editable && !planning {
            return Err("Only planning artifacts may advertise editable fields.".to_string());
        }
        total_text += field.value.chars().count();
        fields.push(AgentArtifactField {
            id: field.id,
            label: field.label,
            value: field.value,
            editable: field.editable,
        });
    }

    let mut item_ids = BTreeSet::new();
    let mut items = Vec::with_capacity(envelope.items.len());
    for item in envelope.items {
        validate_identifier("item id", &item.id, MAX_ARTIFACT_ID_CHARS)?;
        validate_text("item label", &item.label, MAX_TITLE_CHARS, false)?;
        validate_text("item detail", &item.detail, MAX_FIELD_VALUE_CHARS, true)?;
        if let Some(before) = &item.before {
            validate_text("item before text", before, MAX_FIELD_VALUE_CHARS, false)?;
        }
        if let Some(after) = &item.after {
            validate_text("item after text", after, MAX_FIELD_VALUE_CHARS, false)?;
        }
        if !item_ids.insert(item.id.clone()) {
            return Err(format!("Artifact item id {} is duplicated.", item.id));
        }
        let concept_path = item
            .concept_path
            .map(|path| concept_id_from_path(&path).map(|_| path))
            .transpose()?;
        let mut seen_item_sources = BTreeSet::new();
        for source_id in &item.source_ids {
            if !source_ids.contains(source_id) {
                return Err(format!(
                    "Artifact item {} references unknown source {source_id}.",
                    item.id
                ));
            }
            if !seen_item_sources.insert(source_id) {
                return Err(format!(
                    "Artifact item {} repeats source {source_id}.",
                    item.id
                ));
            }
        }
        total_text += item.detail.chars().count()
            + item
                .before
                .as_deref()
                .map_or(0, |value| value.chars().count())
            + item
                .after
                .as_deref()
                .map_or(0, |value| value.chars().count());
        items.push(AgentArtifactItem {
            id: item.id,
            label: item.label,
            detail: item.detail,
            status: item.status,
            concept_path,
            before: item.before,
            after: item.after,
            source_ids: item.source_ids,
        });
    }

    let missing_fields = required_fields(envelope.kind)
        .iter()
        .filter(|required| !field_ids.contains(**required))
        .map(|required| (*required).to_string())
        .collect::<Vec<_>>();
    if envelope.status == AgentArtifactStatus::Complete && !missing_fields.is_empty() {
        return Err(format!(
            "Complete {} artifact is missing required fields: {}.",
            artifact_kind_name(envelope.kind),
            missing_fields.join(", ")
        ));
    }
    if envelope.kind == AgentArtifactKind::ResearchBrief
        && sources
            .iter()
            .any(|source| source.kind == AgentArtifactSourceKind::External)
        && citations.is_empty()
    {
        return Err(
            "A research brief with external sources requires claim-level citations.".to_string(),
        );
    }
    if envelope.kind == AgentArtifactKind::WritingRevision {
        if concept_references.is_empty() {
            return Err("A writing revision requires at least one concept path.".to_string());
        }
        if items.is_empty() {
            return Err("A writing revision requires a claim ledger.".to_string());
        }
        let revision_mode = fields
            .iter()
            .find(|field| field.id == "revision-mode")
            .map(|field| field.value.as_str());
        let changes_meaning = items.iter().any(|item| {
            matches!(
                item.status,
                AgentArtifactItemStatus::Added | AgentArtifactItemStatus::Removed
            )
        });
        if revision_mode == Some("style-only") && changes_meaning {
            return Err(
                "A style-only writing revision cannot add or remove a claim. Route the change through enrichment."
                    .to_string(),
            );
        }
        if items
            .iter()
            .any(|item| item.status == AgentArtifactItemStatus::Added && item.source_ids.is_empty())
        {
            return Err("Every added writing claim requires a source reference.".to_string());
        }
        for item in &items {
            match item.status {
                AgentArtifactItemStatus::Unchanged | AgentArtifactItemStatus::Reworded => {
                    let (Some(before), Some(after)) = (&item.before, &item.after) else {
                        return Err(format!(
                            "Writing claim {} requires before and after text.",
                            item.id
                        ));
                    };
                    let missing = missing_protected_fragments(before, after);
                    if !missing.is_empty() {
                        return Err(format!(
                            "Writing claim {} drops protected content: {}.",
                            item.id,
                            missing.join(", ")
                        ));
                    }
                }
                AgentArtifactItemStatus::Added => {
                    if item.before.is_some() || item.after.is_none() {
                        return Err(format!(
                            "Added writing claim {} requires after text and no before text.",
                            item.id
                        ));
                    }
                }
                AgentArtifactItemStatus::Removed => {
                    if item.before.is_none() || item.after.is_some() {
                        return Err(format!(
                            "Removed writing claim {} requires before text and no after text.",
                            item.id
                        ));
                    }
                }
                _ => {
                    return Err(format!(
                        "Writing claim {} has an unsupported ledger status.",
                        item.id
                    ));
                }
            }
        }
    }

    let large = items.len() > LARGE_ITEM_COUNT
        || concept_references.len() > LARGE_ITEM_COUNT
        || total_text > LARGE_TEXT_CHARS;
    let mut artifact = AgentArtifact {
        schema_version: envelope.schema_version,
        artifact_id: envelope.artifact_id,
        kind: envelope.kind,
        revision: envelope.revision,
        parent_revision: envelope.parent_revision,
        bundle_fingerprint: envelope.bundle_fingerprint,
        title: envelope.title,
        status: envelope.status,
        summary: envelope.summary,
        concept_references,
        sources,
        citations,
        fields,
        items,
        missing_fields,
        large,
        verification: AgentArtifactVerification::default(),
    };
    artifact.verification = verify_artifact(&artifact);
    Ok(artifact)
}

fn missing_protected_fragments(before: &str, after: &str) -> Vec<String> {
    const QUALIFIERS: [&str; 14] = [
        "at least",
        "at most",
        "no more than",
        "only",
        "unless",
        "except",
        "may",
        "might",
        "must",
        "should",
        "not",
        "never",
        "always",
        "approximately",
    ];

    let mut protected = BTreeSet::new();
    protected.extend(numeric_fragments(before));
    protected.extend(bounded_fragments(before, "](", ")"));
    protected.extend(bounded_fragments(before, "[^", "]"));
    protected.extend(delimited_fragments(before, '`'));
    protected.extend(delimited_fragments(before, '$'));

    let before_lower = before.to_lowercase();
    let after_lower = after.to_lowercase();
    for qualifier in QUALIFIERS {
        if before_lower.contains(qualifier) && !after_lower.contains(qualifier) {
            protected.insert(qualifier.to_string());
        }
    }

    protected
        .into_iter()
        .filter(|fragment| {
            let lower = fragment.to_lowercase();
            !after.contains(fragment) && !after_lower.contains(&lower)
        })
        .collect()
}

fn numeric_fragments(value: &str) -> Vec<String> {
    let characters = value.chars().collect::<Vec<_>>();
    let mut fragments = Vec::new();
    let mut index = 0;
    while index < characters.len() {
        if !characters[index].is_ascii_digit() {
            index += 1;
            continue;
        }
        let start = index;
        index += 1;
        while index < characters.len()
            && (characters[index].is_ascii_alphanumeric()
                || matches!(characters[index], '.' | ',' | ':' | '%' | '+' | '-'))
        {
            index += 1;
        }
        fragments.push(characters[start..index].iter().collect());
    }
    fragments
}

fn bounded_fragments(value: &str, opener: &str, closer: &str) -> Vec<String> {
    let mut fragments = Vec::new();
    let mut remainder = value;
    while let Some(start) = remainder.find(opener) {
        let candidate = &remainder[start..];
        let Some(end) = candidate[opener.len()..].find(closer) else {
            break;
        };
        let end = opener.len() + end + closer.len();
        fragments.push(candidate[..end].to_string());
        remainder = &candidate[end..];
    }
    fragments
}

fn delimited_fragments(value: &str, delimiter: char) -> Vec<String> {
    let mut fragments = Vec::new();
    let mut remainder = value;
    while let Some(start) = remainder.find(delimiter) {
        let after_start = &remainder[start + delimiter.len_utf8()..];
        let Some(end) = after_start.find(delimiter) else {
            break;
        };
        if end > 0 {
            fragments.push(after_start[..end].to_string());
        }
        remainder = &after_start[end + delimiter.len_utf8()..];
    }
    fragments
}

fn verify_artifact(artifact: &AgentArtifact) -> AgentArtifactVerification {
    let mut findings = Vec::new();

    if artifact.status == AgentArtifactStatus::Partial || !artifact.missing_fields.is_empty() {
        findings.push(AgentArtifactVerificationFinding {
            rule_id: "artifact-completeness",
            rule_version: 1,
            category: AgentArtifactVerificationCategory::Completeness,
            level: AgentArtifactVerificationLevel::Error,
            message: "The artifact is partial and cannot be treated as complete.".to_string(),
            field_ids: artifact.missing_fields.clone(),
            concept_ids: Vec::new(),
            source_ids: Vec::new(),
        });
    }

    let declared_concepts = artifact
        .concept_references
        .iter()
        .map(|reference| reference.concept_id.as_str())
        .collect::<BTreeSet<_>>();
    let out_of_scope_items = artifact
        .items
        .iter()
        .filter_map(|item| {
            let path = item.concept_path.as_deref()?;
            let id = path.strip_suffix(".md").unwrap_or(path);
            (!declared_concepts.contains(id)).then(|| id.to_string())
        })
        .collect::<BTreeSet<_>>();
    if !out_of_scope_items.is_empty() {
        findings.push(AgentArtifactVerificationFinding {
            rule_id: "artifact-item-scope",
            rule_version: 1,
            category: AgentArtifactVerificationCategory::Identity,
            level: AgentArtifactVerificationLevel::Error,
            message: "One or more work items name concepts outside the artifact's declared scope."
                .to_string(),
            field_ids: Vec::new(),
            concept_ids: out_of_scope_items.into_iter().collect(),
            source_ids: Vec::new(),
        });
    }

    let proposed_concepts = artifact
        .concept_references
        .iter()
        .filter(|reference| !reference.exists)
        .map(|reference| reference.concept_id.clone())
        .collect::<Vec<_>>();
    if !proposed_concepts.is_empty() {
        findings.push(AgentArtifactVerificationFinding {
            rule_id: "artifact-proposed-concepts",
            rule_version: 1,
            category: AgentArtifactVerificationCategory::Identity,
            level: AgentArtifactVerificationLevel::Warning,
            message: "The artifact refers to concepts that do not yet exist in the active bundle."
                .to_string(),
            field_ids: Vec::new(),
            concept_ids: proposed_concepts,
            source_ids: Vec::new(),
        });
    }

    let used_sources = artifact
        .citations
        .iter()
        .map(|citation| citation.source_id.as_str())
        .chain(
            artifact
                .items
                .iter()
                .flat_map(|item| item.source_ids.iter().map(String::as_str)),
        )
        .collect::<BTreeSet<_>>();
    let unused_sources = artifact
        .sources
        .iter()
        .filter(|source| !used_sources.contains(source.id.as_str()))
        .map(|source| source.id.clone())
        .collect::<Vec<_>>();
    if !unused_sources.is_empty() {
        findings.push(AgentArtifactVerificationFinding {
            rule_id: "artifact-unused-sources",
            rule_version: 1,
            category: AgentArtifactVerificationCategory::Evidence,
            level: AgentArtifactVerificationLevel::Warning,
            message: "Declared sources are not connected to a citation or work item.".to_string(),
            field_ids: Vec::new(),
            concept_ids: Vec::new(),
            source_ids: unused_sources,
        });
    }

    let unsupported_items = artifact
        .items
        .iter()
        .filter(|item| {
            matches!(
                item.status,
                AgentArtifactItemStatus::Complete | AgentArtifactItemStatus::Advisory
            ) && item.source_ids.is_empty()
                && item.concept_path.is_none()
        })
        .map(|item| item.id.clone())
        .collect::<Vec<_>>();
    if !unsupported_items.is_empty() {
        findings.push(AgentArtifactVerificationFinding {
            rule_id: "artifact-item-evidence",
            rule_version: 1,
            category: AgentArtifactVerificationCategory::Evidence,
            level: AgentArtifactVerificationLevel::Warning,
            message: format!(
                "Completed or advisory work items lack a concept or source reference: {}.",
                unsupported_items.join(", ")
            ),
            field_ids: Vec::new(),
            concept_ids: Vec::new(),
            source_ids: Vec::new(),
        });
    }

    let errors = findings
        .iter()
        .filter(|finding| finding.level == AgentArtifactVerificationLevel::Error)
        .count();
    let warnings = findings.len().saturating_sub(errors);
    AgentArtifactVerification {
        errors,
        warnings,
        completion_blocked: errors > 0,
        findings,
    }
}

fn validate_source_reference(
    kind: AgentArtifactSourceKind,
    reference: &str,
    concept_ids: &BTreeSet<&str>,
) -> Result<(), String> {
    match kind {
        AgentArtifactSourceKind::Bundle => {
            let concept_id = concept_id_from_path(reference)?;
            if !concept_ids.contains(concept_id.as_str()) {
                return Err(format!(
                    "Bundle source reference {reference} does not name a current concept."
                ));
            }
        }
        AgentArtifactSourceKind::Attachment => {
            validate_identifier("attachment reference", reference, MAX_REFERENCE_CHARS)?;
        }
        AgentArtifactSourceKind::External => {
            let url = url::Url::parse(reference)
                .map_err(|_| "External source references must be valid HTTPS URLs.".to_string())?;
            if url.scheme() != "https" || url.host_str().is_none() || !url.username().is_empty() {
                return Err("External source references must be valid HTTPS URLs.".to_string());
            }
        }
    }
    Ok(())
}

fn concept_id_from_path(path: &str) -> Result<String, String> {
    validate_text("concept path", path, MAX_PATH_CHARS, false)?;
    if path.starts_with('/')
        || path.starts_with('\\')
        || path.contains('\\')
        || !path.ends_with(".md")
    {
        return Err(format!(
            "Artifact concept path {path} must be a bundle-relative Markdown path."
        ));
    }
    let mut components = path.split('/');
    if components.clone().any(|part| {
        part.is_empty()
            || part == "."
            || part == ".."
            || part
                .chars()
                .any(|character| character.is_control() || r#":*?<>|\""#.contains(character))
    }) {
        return Err(format!("Artifact concept path {path} is not portable."));
    }
    let Some(last) = components.next_back() else {
        return Err(format!("Artifact concept path {path} is empty."));
    };
    let stem = last.strip_suffix(".md").unwrap_or_default();
    if stem.is_empty() || stem == "index" {
        return Err(format!(
            "Artifact concept path {path} must name a concept, not navigation."
        ));
    }
    Ok(path.strip_suffix(".md").unwrap_or_default().to_string())
}

fn validate_identifier(name: &str, value: &str, maximum: usize) -> Result<(), String> {
    if value.is_empty()
        || value.chars().count() > maximum
        || !value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.' | b':'))
    {
        return Err(format!(
            "Artifact {name} must be a bounded portable identifier."
        ));
    }
    Ok(())
}

fn validate_text(name: &str, value: &str, maximum: usize, allow_empty: bool) -> Result<(), String> {
    if (!allow_empty && value.trim().is_empty())
        || value.chars().count() > maximum
        || value
            .chars()
            .any(|character| character.is_control() && !matches!(character, '\n' | '\r' | '\t'))
    {
        return Err(format!("Artifact {name} is empty, unsafe, or too large."));
    }
    Ok(())
}

fn check_count(name: &str, actual: usize, maximum: usize) -> Result<(), String> {
    if actual > maximum {
        return Err(format!(
            "Artifact has {actual} {name}; the maximum is {maximum}."
        ));
    }
    Ok(())
}

fn is_planning_kind(kind: AgentArtifactKind) -> bool {
    matches!(
        kind,
        AgentArtifactKind::SourceInventory
            | AgentArtifactKind::BundlePlan
            | AgentArtifactKind::ResearchBrief
            | AgentArtifactKind::ChangeImpactMap
            | AgentArtifactKind::MigrationPlan
            | AgentArtifactKind::WritingRevision
    )
}

fn required_fields(kind: AgentArtifactKind) -> &'static [&'static str] {
    match kind {
        AgentArtifactKind::SourceInventory => &["scope"],
        AgentArtifactKind::BundlePlan => &["destination", "scope"],
        AgentArtifactKind::HealthReport => &["health-summary"],
        AgentArtifactKind::ResearchBrief => &["question", "conclusion"],
        AgentArtifactKind::ChangeImpactMap => &["target", "proposed-change"],
        AgentArtifactKind::MigrationPlan => &["source-version", "target-version", "rollback"],
        AgentArtifactKind::WritingRevision => &["reader-job", "purpose", "revision-mode"],
        AgentArtifactKind::StagedRevision => &["revision-summary"],
    }
}

fn artifact_kind_name(kind: AgentArtifactKind) -> &'static str {
    match kind {
        AgentArtifactKind::SourceInventory => "source-inventory",
        AgentArtifactKind::BundlePlan => "bundle-plan",
        AgentArtifactKind::HealthReport => "health-report",
        AgentArtifactKind::ResearchBrief => "research-brief",
        AgentArtifactKind::ChangeImpactMap => "change-impact-map",
        AgentArtifactKind::MigrationPlan => "migration-plan",
        AgentArtifactKind::WritingRevision => "writing-revision",
        AgentArtifactKind::StagedRevision => "staged-revision",
    }
}

fn invalid(message: &str) -> AgentArtifactValidation {
    AgentArtifactValidation::Invalid {
        message: message.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use okf_core::read_bundle;
    use std::path::Path;

    fn docs() -> Bundle {
        read_bundle(Path::new(concat!(env!("CARGO_MANIFEST_DIR"), "/../docs")))
    }

    fn artifact_json(bundle: &Bundle, body: serde_json::Value) -> String {
        let mut value = serde_json::json!({
            "schemaVersion": 1,
            "artifactId": "research-1",
            "kind": "research-brief",
            "revision": 1,
            "parentRevision": null,
            "bundleFingerprint": health::bundle_fingerprint(bundle),
            "title": "Research brief",
            "status": "complete",
            "summary": "Evidence checked.",
            "conceptPaths": ["features/agent-panel.md"],
            "sources": [{
                "id": "source-1",
                "label": "Agent panel",
                "kind": "bundle",
                "reference": "features/agent-panel.md"
            }],
            "citations": [{"sourceId": "source-1", "claim": "The panel is bundle scoped."}],
            "fields": [
                {"id": "question", "label": "Question", "value": "How is the agent scoped?", "editable": true},
                {"id": "conclusion", "label": "Conclusion", "value": "It is bundle scoped.", "editable": true}
            ],
            "items": []
        });
        value
            .as_object_mut()
            .expect("artifact object")
            .extend(body.as_object().expect("override object").clone());
        format!("Agent prose.\n\n```okf-artifact\n{}\n```", value)
    }

    #[test]
    fn validates_a_revision_bound_typed_artifact() {
        let bundle = docs();
        let result = validate(&artifact_json(&bundle, serde_json::json!({})), &bundle);
        let AgentArtifactValidation::Ready { artifact } = result else {
            panic!("expected ready artifact");
        };
        assert_eq!(artifact.kind, AgentArtifactKind::ResearchBrief);
        assert_eq!(artifact.concept_references.len(), 1);
        assert!(artifact.concept_references[0].exists);
        assert!(artifact.missing_fields.is_empty());
        assert!(!artifact.verification.completion_blocked);
        assert!(artifact.verification.findings.is_empty());
    }

    #[test]
    fn labels_partial_output_and_rejects_invalid_trust_claims() {
        let bundle = docs();
        let partial = validate(
            &artifact_json(
                &bundle,
                serde_json::json!({"status": "partial", "fields": []}),
            ),
            &bundle,
        );
        let AgentArtifactValidation::Ready { artifact } = partial else {
            panic!("expected partial artifact");
        };
        assert_eq!(artifact.missing_fields, ["question", "conclusion"]);
        assert!(artifact.verification.completion_blocked);
        assert_eq!(artifact.verification.errors, 1);

        for body in [
            serde_json::json!({"bundleFingerprint": "okf-health-revision-stale"}),
            serde_json::json!({"conceptPaths": ["../outside.md"]}),
            serde_json::json!({"citations": [{"sourceId": "missing", "claim": "No source."}]}),
            serde_json::json!({"revision": 2, "parentRevision": 2}),
        ] {
            assert!(matches!(
                validate(&artifact_json(&bundle, body), &bundle),
                AgentArtifactValidation::Invalid { .. }
            ));
        }
    }

    #[test]
    fn keeps_missing_and_malformed_envelopes_out_of_trusted_structure() {
        let bundle = docs();
        assert_eq!(
            validate("ordinary prose", &bundle),
            AgentArtifactValidation::None
        );
        assert!(matches!(
            validate("```okf-artifact\n{no}\n```", &bundle),
            AgentArtifactValidation::Invalid { .. }
        ));
    }

    #[test]
    fn writing_revision_requires_a_complete_fact_preserving_claim_ledger() {
        let bundle = docs();
        let ready = artifact_json(
            &bundle,
            serde_json::json!({
                "kind": "writing-revision",
                "title": "Agent panel rationale revision",
                "fields": [
                    {"id": "reader-job", "label": "Reader job", "value": "Explain why the panel exists.", "editable": false},
                    {"id": "purpose", "label": "Purpose", "value": "Lead with the review boundary.", "editable": false},
                    {"id": "revision-mode", "label": "Revision mode", "value": "style-only", "editable": false}
                ],
                "items": [{
                    "id": "claim-review-boundary",
                    "label": "Review boundary",
                    "detail": "Reworded without changing the separate Apply action.",
                    "status": "reworded",
                    "conceptPath": "features/agent-panel.md",
                    "before": "Apply may proceed only after 30 days; keep [review](https://example.com/review), [^policy], `$loss < 5$`, and `apply_revision`.",
                    "after": "After 30 days, Apply may proceed only with [review](https://example.com/review), [^policy], `$loss < 5$`, and `apply_revision`.",
                    "sourceIds": ["source-1"]
                }]
            }),
        );
        assert!(matches!(
            validate(&ready, &bundle),
            AgentArtifactValidation::Ready { .. }
        ));

        let dropped_claim = ready.replace("\"reworded\"", "\"removed\"");
        let AgentArtifactValidation::Invalid { message } = validate(&dropped_claim, &bundle) else {
            panic!("style-only removed claim should be rejected");
        };
        assert!(message.contains("cannot add or remove a claim"));

        let lost_protected_content = ready.replace(
            "After 30 days, Apply may proceed only with [review](https://example.com/review), [^policy], `$loss < 5$`, and `apply_revision`.",
            "Apply proceeds after the trial.",
        );
        let AgentArtifactValidation::Invalid { message } =
            validate(&lost_protected_content, &bundle)
        else {
            panic!("protected claim content should be rejected when dropped");
        };
        assert!(message.contains("drops protected content"));

        let no_ledger = artifact_json(
            &bundle,
            serde_json::json!({
                "kind": "writing-revision",
                "fields": [
                    {"id": "reader-job", "label": "Reader job", "value": "Explain why.", "editable": false},
                    {"id": "purpose", "label": "Purpose", "value": "Clarify.", "editable": false},
                    {"id": "revision-mode", "label": "Revision mode", "value": "style-only", "editable": false}
                ],
                "items": []
            }),
        );
        assert!(matches!(
            validate(&no_ledger, &bundle),
            AgentArtifactValidation::Invalid { .. }
        ));
    }
}
