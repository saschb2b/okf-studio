use crate::access::{self, AccessHints};
use crate::frontmatter;
use crate::health;
use crate::ignore;
use crate::links;
use crate::model::{Bundle, Concept};
use pulldown_cmark::{Event, LinkType, Options, Parser, Tag};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet, HashMap, HashSet, VecDeque};
use std::fs;
use std::ops::Range;
use std::path::Path;
use walkdir::WalkDir;

const MAX_SELECTED_CONCEPTS: usize = 2_048;
const MAX_RECIPIENT_AUDIENCES: usize = 16;
const MAX_SENSITIVE_TERMS: usize = 32;
const MAX_INPUT_CHARS: usize = 128;
const MAX_PLAN_ITEMS: usize = 10_000;
const MAX_AUDIT_FILES: usize = 4_096;
const MAX_AUDIT_BYTES: u64 = 64 * 1024 * 1024;
const MAX_AUDIT_FINDINGS: usize = 512;
const OMISSION_ANCHOR: &str = "#projection-omissions";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectionInput {
    pub recipient: String,
    pub recipient_audiences: Vec<String>,
    pub max_sensitivity: String,
    pub include_unknown_sensitivity: bool,
    pub selected_concept_ids: Vec<String>,
    #[serde(default)]
    pub sensitive_terms: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ProjectionInclusionReason {
    Explicit,
    TransitiveLink,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectionConcept {
    pub id: String,
    pub title: String,
    pub reason: ProjectionInclusionReason,
    pub linked_from: Option<String>,
    pub access: AccessHints,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ProjectionOmissionKind {
    Concept,
    IgnoredPath,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ProjectionOmissionReason {
    NotSelected,
    AudienceMismatch,
    SensitivityExceedsMaximum,
    UnknownSensitivity,
    IgnoredByRule,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectionOmission {
    pub kind: ProjectionOmissionKind,
    pub id: String,
    pub title: String,
    pub reason: ProjectionOmissionReason,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ProjectionLinkOutcome {
    RewrittenOmitted,
    ExistingBroken,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectionLinkConsequence {
    pub source_id: String,
    pub target: String,
    pub outcome: ProjectionLinkOutcome,
    pub occurrences: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectionRedaction {
    pub file: String,
    pub category: String,
    pub value: String,
    pub occurrences: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectionPlan {
    pub schema_version: u32,
    pub revision: String,
    pub source_bundle_fingerprint: String,
    pub recipient: String,
    pub recipient_audiences: Vec<String>,
    pub max_sensitivity: String,
    pub include_unknown_sensitivity: bool,
    pub destination_folder_name: String,
    pub included: Vec<ProjectionConcept>,
    pub omissions: Vec<ProjectionOmission>,
    pub link_consequences: Vec<ProjectionLinkConsequence>,
    pub redactions: Vec<ProjectionRedaction>,
    pub ignored_rule_count: usize,
    pub ignored_paths_truncated: bool,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AuditTerm {
    pub category: String,
    pub value: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ErasureFinding {
    pub path: String,
    pub category: String,
    pub value: String,
    pub occurrences: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ErasureAuditReport {
    pub schema_version: u32,
    pub passed: bool,
    pub checked_files: usize,
    pub checked_bytes: u64,
    pub checked_terms: usize,
    pub findings: Vec<ErasureFinding>,
    pub truncated: bool,
    pub diagnostics: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RenderedProjectionConcept {
    pub content: String,
    pub rewritten_targets: BTreeMap<String, usize>,
    pub redactions: Vec<ProjectionRedaction>,
}

pub fn plan(
    root: &Path,
    bundle: &Bundle,
    input: &ProjectionInput,
) -> Result<ProjectionPlan, String> {
    let input = validate_input(input, bundle)?;
    let max_rank = access::sensitivity_rank(&input.max_sensitivity)
        .ok_or_else(|| "Choose a recognized maximum sensitivity.".to_string())?;
    let concepts = bundle
        .concepts
        .iter()
        .map(|concept| (concept.id.as_str(), concept))
        .collect::<HashMap<_, _>>();
    let selected = input
        .selected_concept_ids
        .iter()
        .cloned()
        .collect::<BTreeSet<_>>();
    let mut included = BTreeMap::<String, ProjectionConcept>::new();
    let mut omission_reasons = HashMap::<String, ProjectionOmissionReason>::new();
    let mut queue = VecDeque::<String>::new();

    for id in &input.selected_concept_ids {
        let concept = concepts
            .get(id.as_str())
            .ok_or_else(|| format!("The selected concept {id} no longer exists."))?;
        match eligibility(concept, &input, max_rank) {
            Ok(hints) => {
                included.insert(
                    id.clone(),
                    ProjectionConcept {
                        id: id.clone(),
                        title: concept.title.clone(),
                        reason: ProjectionInclusionReason::Explicit,
                        linked_from: None,
                        access: hints,
                    },
                );
                queue.push_back(id.clone());
            }
            Err(reason) => {
                omission_reasons.insert(id.clone(), reason);
            }
        }
    }

    while let Some(source_id) = queue.pop_front() {
        let Some(source) = concepts.get(source_id.as_str()) else {
            continue;
        };
        for target_id in &source.links {
            if included.contains_key(target_id) || omission_reasons.contains_key(target_id) {
                continue;
            }
            let Some(target) = concepts.get(target_id.as_str()) else {
                continue;
            };
            match eligibility(target, &input, max_rank) {
                Ok(hints) => {
                    included.insert(
                        target_id.clone(),
                        ProjectionConcept {
                            id: target_id.clone(),
                            title: target.title.clone(),
                            reason: ProjectionInclusionReason::TransitiveLink,
                            linked_from: Some(source_id.clone()),
                            access: hints,
                        },
                    );
                    queue.push_back(target_id.clone());
                }
                Err(reason) => {
                    omission_reasons.insert(target_id.clone(), reason);
                }
            }
            if included.len() + omission_reasons.len() > MAX_PLAN_ITEMS {
                return Err("The projection plan exceeds its 10,000 item limit.".to_string());
            }
        }
    }

    for concept in &bundle.concepts {
        if !included.contains_key(&concept.id) && !omission_reasons.contains_key(&concept.id) {
            omission_reasons.insert(concept.id.clone(), ProjectionOmissionReason::NotSelected);
        }
    }

    let ignore_report = ignore::analyze(root);
    let mut omissions = omission_reasons
        .iter()
        .filter_map(|(id, reason)| {
            concepts.get(id.as_str()).map(|concept| ProjectionOmission {
                kind: ProjectionOmissionKind::Concept,
                id: id.clone(),
                title: concept.title.clone(),
                reason: reason.clone(),
            })
        })
        .collect::<Vec<_>>();
    omissions.extend(
        ignore_report
            .excluded_paths
            .iter()
            .map(|path| ProjectionOmission {
                kind: ProjectionOmissionKind::IgnoredPath,
                id: path.clone(),
                title: path.clone(),
                reason: ProjectionOmissionReason::IgnoredByRule,
            }),
    );
    omissions.sort_by(|left, right| left.id.cmp(&right.id));

    let included_ids = included.keys().cloned().collect::<BTreeSet<_>>();
    let omitted_ids = omission_reasons.keys().cloned().collect::<BTreeSet<_>>();
    let terms = erasure_terms(bundle, &omissions, &input.sensitive_terms);
    let mut link_consequences = Vec::new();
    let mut redactions = Vec::new();
    for concept in bundle
        .concepts
        .iter()
        .filter(|concept| included_ids.contains(&concept.id))
    {
        let raw = fs::read_to_string(root.join(format!("{}.md", concept.id)))
            .map_err(|_| format!("Studio could not read {}.md for projection.", concept.id))?;
        let rendered = render_concept(&raw, &concept.id, &omitted_ids, &terms)?;
        link_consequences.extend(
            rendered
                .rewritten_targets
                .iter()
                .map(|(target, occurrences)| ProjectionLinkConsequence {
                    source_id: concept.id.clone(),
                    target: target.clone(),
                    outcome: ProjectionLinkOutcome::RewrittenOmitted,
                    occurrences: *occurrences,
                }),
        );
        redactions.extend(rendered.redactions);
        link_consequences.extend(concept.broken_links.iter().map(|target| {
            ProjectionLinkConsequence {
                source_id: concept.id.clone(),
                target: target.clone(),
                outcome: ProjectionLinkOutcome::ExistingBroken,
                occurrences: 1,
            }
        }));
    }
    link_consequences.sort_by(|left, right| {
        left.source_id
            .cmp(&right.source_id)
            .then_with(|| left.target.cmp(&right.target))
    });
    redactions.sort_by(|left, right| {
        left.file
            .cmp(&right.file)
            .then_with(|| left.category.cmp(&right.category))
            .then_with(|| left.value.cmp(&right.value))
    });

    let mut warnings = ignore_report.diagnostics;
    if included.is_empty() {
        warnings.push(
            "No selected concept passed the reviewed audience and sensitivity hints.".to_string(),
        );
    }
    if ignore_report.truncated {
        warnings.push(
            "The ignore report omitted some excluded paths from this visible plan.".to_string(),
        );
    }
    if selected.len() != input.selected_concept_ids.len() {
        warnings.push("Duplicate explicit selections were collapsed.".to_string());
    }

    let mut plan = ProjectionPlan {
        schema_version: 1,
        revision: String::new(),
        source_bundle_fingerprint: health::bundle_fingerprint(bundle),
        recipient: input.recipient.clone(),
        recipient_audiences: input.recipient_audiences.clone(),
        max_sensitivity: input.max_sensitivity.clone(),
        include_unknown_sensitivity: input.include_unknown_sensitivity,
        destination_folder_name: destination_folder_name(&input.recipient),
        included: included.into_values().collect(),
        omissions,
        link_consequences,
        redactions,
        ignored_rule_count: ignore_report.rule_count,
        ignored_paths_truncated: ignore_report.truncated,
        warnings,
    };
    plan.revision = plan_revision(&plan)?;
    Ok(plan)
}

pub fn erasure_terms(
    bundle: &Bundle,
    omissions: &[ProjectionOmission],
    sensitive_terms: &[String],
) -> Vec<AuditTerm> {
    let omitted_ids = omissions
        .iter()
        .filter(|item| item.kind == ProjectionOmissionKind::Concept)
        .map(|item| item.id.as_str())
        .collect::<HashSet<_>>();
    let mut terms = Vec::new();
    for omission in omissions {
        match omission.kind {
            ProjectionOmissionKind::Concept => {
                push_term(&mut terms, "excluded-concept-id", &omission.id);
                push_term(
                    &mut terms,
                    "excluded-concept-path",
                    &format!("{}.md", omission.id),
                );
                push_term(&mut terms, "excluded-concept-title", &omission.title);
            }
            ProjectionOmissionKind::IgnoredPath => {
                push_term(&mut terms, "ignored-path", &omission.id);
            }
        }
    }
    for concept in bundle
        .concepts
        .iter()
        .filter(|concept| omitted_ids.contains(concept.id.as_str()))
    {
        if let Some(value) = concept
            .extra
            .get("stable_id")
            .and_then(serde_json::Value::as_str)
        {
            push_term(&mut terms, "stable-identity", value);
        }
        for key in ["provenance", "evidence"] {
            if let Some(value) = concept.extra.get(key) {
                collect_source_values(value, &mut terms);
            }
        }
    }
    for value in sensitive_terms {
        push_term(&mut terms, "user-sensitive-term", value);
    }
    terms.sort_by(|left, right| {
        left.value
            .len()
            .cmp(&right.value.len())
            .reverse()
            .then_with(|| left.category.cmp(&right.category))
            .then_with(|| left.value.cmp(&right.value))
    });
    terms.dedup_by(|left, right| left.value.eq_ignore_ascii_case(&right.value));
    terms
}

pub fn render_concept(
    raw: &str,
    source_id: &str,
    omitted_ids: &BTreeSet<String>,
    terms: &[AuditTerm],
) -> Result<RenderedProjectionConcept, String> {
    let (mut content, rewritten_targets) = rewrite_omitted_links(raw, source_id, omitted_ids)?;
    if !rewritten_targets.is_empty() && !content.contains("\n## Projection omissions\n") {
        content.push_str(
            "\n\n## Projection omissions\n\nOne or more links pointed to concepts omitted from this recipient projection.\n",
        );
    }
    let mut redactions = Vec::new();
    for term in terms {
        let (next, occurrences) = redact_ascii_case_insensitive(&content, &term.value);
        if occurrences > 0 {
            redactions.push(ProjectionRedaction {
                file: format!("{source_id}.md"),
                category: term.category.clone(),
                value: term.value.clone(),
                occurrences,
            });
            content = next;
        }
    }
    Ok(RenderedProjectionConcept {
        content,
        rewritten_targets,
        redactions,
    })
}

pub fn audit_directory(root: &Path, terms: &[AuditTerm]) -> ErasureAuditReport {
    let mut findings = Vec::new();
    let mut checked_files = 0_usize;
    let mut checked_bytes = 0_u64;
    let mut diagnostics = Vec::new();
    let mut truncated = false;
    for entry in WalkDir::new(root)
        .follow_links(false)
        .into_iter()
        .filter_map(Result::ok)
        .filter(|entry| entry.file_type().is_file())
    {
        if checked_files == MAX_AUDIT_FILES || checked_bytes >= MAX_AUDIT_BYTES {
            truncated = true;
            break;
        }
        let Ok(metadata) = entry.metadata() else {
            diagnostics.push("A projection file could not be inspected.".to_string());
            continue;
        };
        if checked_bytes.saturating_add(metadata.len()) > MAX_AUDIT_BYTES {
            truncated = true;
            break;
        }
        let Ok(bytes) = fs::read(entry.path()) else {
            diagnostics.push("A projection file could not be read.".to_string());
            continue;
        };
        checked_files += 1;
        checked_bytes += bytes.len() as u64;
        let text = String::from_utf8_lossy(&bytes);
        for term in terms {
            let occurrences = count_ascii_case_insensitive(&text, &term.value);
            if occurrences == 0 {
                continue;
            }
            if findings.len() == MAX_AUDIT_FINDINGS {
                truncated = true;
                break;
            }
            findings.push(ErasureFinding {
                path: portable_relative(root, entry.path()),
                category: term.category.clone(),
                value: term.value.clone(),
                occurrences,
            });
        }
    }
    findings.sort_by(|left, right| {
        left.path
            .cmp(&right.path)
            .then_with(|| left.category.cmp(&right.category))
            .then_with(|| left.value.cmp(&right.value))
    });
    if truncated {
        diagnostics.push(
            "The erasure audit reached a file, byte, or finding limit and cannot pass.".to_string(),
        );
    }
    ErasureAuditReport {
        schema_version: 1,
        passed: findings.is_empty() && !truncated && diagnostics.is_empty(),
        checked_files,
        checked_bytes,
        checked_terms: terms.len(),
        findings,
        truncated,
        diagnostics,
    }
}

fn validate_input(input: &ProjectionInput, bundle: &Bundle) -> Result<ProjectionInput, String> {
    let recipient = bounded_input(&input.recipient, "Name the projection recipient.")?;
    if input.selected_concept_ids.is_empty()
        || input.selected_concept_ids.len() > MAX_SELECTED_CONCEPTS
    {
        return Err(format!(
            "Select between 1 and {MAX_SELECTED_CONCEPTS} concepts."
        ));
    }
    if input.recipient_audiences.len() > MAX_RECIPIENT_AUDIENCES {
        return Err(format!(
            "Name at most {MAX_RECIPIENT_AUDIENCES} recipient audiences."
        ));
    }
    if input.sensitive_terms.len() > MAX_SENSITIVE_TERMS {
        return Err(format!(
            "Add at most {MAX_SENSITIVE_TERMS} sensitive terms."
        ));
    }
    let concept_ids = bundle
        .concepts
        .iter()
        .map(|concept| concept.id.as_str())
        .collect::<HashSet<_>>();
    let mut selected_concept_ids = Vec::new();
    for id in &input.selected_concept_ids {
        let id = bounded_input(id, "A selected concept ID is invalid.")?;
        if !concept_ids.contains(id.as_str()) {
            return Err(format!("The selected concept {id} no longer exists."));
        }
        if !selected_concept_ids.contains(&id) {
            selected_concept_ids.push(id);
        }
    }
    let recipient_audiences = normalize_values(
        &input.recipient_audiences,
        "A recipient audience is invalid.",
        1,
    )?;
    let sensitive_terms =
        normalize_values(&input.sensitive_terms, "A sensitive term is invalid.", 3)?;
    let max_sensitivity = bounded_input(&input.max_sensitivity, "Choose a maximum sensitivity.")?
        .to_ascii_lowercase();
    if access::sensitivity_rank(&max_sensitivity).is_none() {
        return Err("Choose public, internal, confidential, or restricted.".to_string());
    }
    Ok(ProjectionInput {
        recipient,
        recipient_audiences,
        max_sensitivity,
        include_unknown_sensitivity: input.include_unknown_sensitivity,
        selected_concept_ids,
        sensitive_terms,
    })
}

fn eligibility(
    concept: &Concept,
    input: &ProjectionInput,
    max_rank: u8,
) -> Result<AccessHints, ProjectionOmissionReason> {
    let hints = access::assess(concept);
    if !input.recipient_audiences.is_empty()
        && !hints.audiences.is_empty()
        && !hints.audiences.iter().any(|audience| {
            input
                .recipient_audiences
                .iter()
                .any(|recipient| recipient.eq_ignore_ascii_case(audience))
        })
    {
        return Err(ProjectionOmissionReason::AudienceMismatch);
    }
    if let Some(sensitivity) = &hints.sensitivity {
        match access::sensitivity_rank(sensitivity) {
            Some(rank) if rank > max_rank => {
                return Err(ProjectionOmissionReason::SensitivityExceedsMaximum);
            }
            None if !input.include_unknown_sensitivity => {
                return Err(ProjectionOmissionReason::UnknownSensitivity);
            }
            _ => {}
        }
    } else if !input.include_unknown_sensitivity {
        return Err(ProjectionOmissionReason::UnknownSensitivity);
    }
    Ok(hints)
}

fn rewrite_omitted_links(
    raw: &str,
    context_id: &str,
    omitted_ids: &BTreeSet<String>,
) -> Result<(String, BTreeMap<String, usize>), String> {
    let (_, body) = frontmatter::split(raw);
    let prefix_len = raw.len().saturating_sub(body.len());
    let mut ranges = Vec::<(Range<usize>, String, String)>::new();
    let parser = Parser::new_ext(body, Options::ENABLE_FOOTNOTES);
    for (_, definition) in parser.reference_definitions().iter() {
        let href = definition.dest.as_ref();
        let Some(target) = resolved_target(href, context_id) else {
            continue;
        };
        if !omitted_ids.contains(&target) {
            continue;
        }
        let range = destination_span(body, &definition.span, href).ok_or_else(|| {
            "A projection reference link could not be rewritten safely.".to_string()
        })?;
        ranges.push((range, OMISSION_ANCHOR.to_string(), target));
    }
    for (event, source_range) in parser.into_offset_iter() {
        let Event::Start(Tag::Link {
            link_type,
            dest_url,
            ..
        }) = event
        else {
            continue;
        };
        if !matches!(link_type, LinkType::Inline | LinkType::Autolink) {
            continue;
        }
        let href = dest_url.as_ref();
        let Some(target) = resolved_target(href, context_id) else {
            continue;
        };
        if !omitted_ids.contains(&target) {
            continue;
        }
        let range = destination_span(body, &source_range, href)
            .ok_or_else(|| "A projection inline link could not be rewritten safely.".to_string())?;
        ranges.push((range, OMISSION_ANCHOR.to_string(), target));
    }
    ranges.sort_by_key(|item| std::cmp::Reverse(item.0.start));
    ranges.dedup_by(|left, right| left.0 == right.0);
    let mut counts = BTreeMap::new();
    let mut rewritten = body.to_string();
    for (range, replacement, target) in ranges {
        rewritten.replace_range(range, &replacement);
        *counts.entry(target).or_insert(0) += 1;
    }
    Ok((format!("{}{}", &raw[..prefix_len], rewritten), counts))
}

fn resolved_target(href: &str, context_id: &str) -> Option<String> {
    if links::is_external(href) {
        return None;
    }
    let path = href.split('#').next().unwrap_or(href);
    if !path.to_ascii_lowercase().ends_with(".md") {
        return None;
    }
    links::resolve(path, context_id)
}

fn destination_span(body: &str, source_range: &Range<usize>, href: &str) -> Option<Range<usize>> {
    let source = body.get(source_range.clone())?;
    let offset = source.find(href)?;
    let start = source_range.start.checked_add(offset)?;
    Some(start..start.checked_add(href.len())?)
}

fn collect_source_values(value: &serde_json::Value, terms: &mut Vec<AuditTerm>) {
    match value {
        serde_json::Value::String(value) => push_term(terms, "source-identity", value),
        serde_json::Value::Array(items) => {
            for item in items {
                collect_source_values(item, terms);
            }
        }
        serde_json::Value::Object(items) => {
            for value in items.values() {
                collect_source_values(value, terms);
            }
        }
        _ => {}
    }
}

fn push_term(terms: &mut Vec<AuditTerm>, category: &str, value: &str) {
    let value = value.trim();
    if value.chars().count() >= 3
        && value.chars().count() <= 1_024
        && !value.chars().any(char::is_control)
    {
        terms.push(AuditTerm {
            category: category.to_string(),
            value: value.to_string(),
        });
    }
}

fn redact_ascii_case_insensitive(text: &str, term: &str) -> (String, usize) {
    if term.is_empty() {
        return (text.to_string(), 0);
    }
    let mut output = String::with_capacity(text.len());
    let mut remainder = text;
    let mut count = 0;
    loop {
        let lower = remainder.to_ascii_lowercase();
        let Some(index) = lower.find(&term.to_ascii_lowercase()) else {
            output.push_str(remainder);
            break;
        };
        output.push_str(&remainder[..index]);
        output.push_str("[redacted]");
        remainder = &remainder[index + term.len()..];
        count += 1;
    }
    (output, count)
}

fn count_ascii_case_insensitive(text: &str, term: &str) -> usize {
    if term.is_empty() {
        return 0;
    }
    text.to_ascii_lowercase()
        .match_indices(&term.to_ascii_lowercase())
        .count()
}

fn bounded_input(value: &str, message: &str) -> Result<String, String> {
    let value = value.trim();
    if value.is_empty()
        || value.chars().count() > MAX_INPUT_CHARS
        || value.chars().any(char::is_control)
    {
        return Err(message.to_string());
    }
    Ok(value.to_string())
}

fn normalize_values(
    values: &[String],
    message: &str,
    minimum_chars: usize,
) -> Result<Vec<String>, String> {
    let mut normalized = Vec::new();
    for value in values {
        let value = bounded_input(value, message)?;
        if value.chars().count() < minimum_chars {
            return Err(message.to_string());
        }
        if !normalized
            .iter()
            .any(|existing: &String| existing.eq_ignore_ascii_case(&value))
        {
            normalized.push(value);
        }
    }
    Ok(normalized)
}

fn destination_folder_name(recipient: &str) -> String {
    let slug = recipient
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() {
                character.to_ascii_lowercase()
            } else {
                '-'
            }
        })
        .collect::<String>();
    let slug = slug
        .split('-')
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join("-");
    format!(
        "{}-okf",
        if slug.is_empty() {
            "recipient"
        } else {
            &slug[..slug.len().min(96)]
        }
    )
}

fn plan_revision(plan: &ProjectionPlan) -> Result<String, String> {
    let mut unsigned = plan.clone();
    unsigned.revision.clear();
    let bytes = serde_json::to_vec(&unsigned)
        .map_err(|_| "Studio could not fingerprint the projection plan.".to_string())?;
    Ok(format!("okf-projection-{:x}", Sha256::digest(bytes)))
}

fn portable_relative(root: &Path, path: &Path) -> String {
    path.strip_prefix(root)
        .ok()
        .map(|relative| {
            relative
                .components()
                .map(|component| component.as_os_str().to_string_lossy())
                .collect::<Vec<_>>()
                .join("/")
        })
        .unwrap_or_else(|| "projection".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    struct TempRoot(std::path::PathBuf);

    impl TempRoot {
        fn new(name: &str) -> Self {
            let nonce = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("clock")
                .as_nanos();
            let path = std::env::temp_dir().join(format!("okf-projection-{name}-{nonce}"));
            fs::create_dir_all(&path).expect("fixture root");
            Self(path)
        }
    }

    impl Drop for TempRoot {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn plans_transitive_inclusion_and_visible_hint_omissions() {
        let root = TempRoot::new("plan");
        fs::write(
            root.0.join("index.md"),
            "---\nokf_version: \"0.1\"\n---\n# Source\n",
        )
        .expect("index");
        fs::write(
            root.0.join("start.md"),
            "---\ntype: Note\naudience: [partners]\nsensitivity: public\n---\n# Start\n\n[Allowed](allowed.md) [Secret](secret.md) [Odd](odd.md) [Unlabelled](unlabelled.md)\n",
        )
        .expect("start");
        fs::write(
            root.0.join("allowed.md"),
            "---\ntype: Note\nsensitivity: internal\n---\n# Allowed\n",
        )
        .expect("allowed");
        fs::write(
            root.0.join("secret.md"),
            "---\ntype: Note\nsensitivity: restricted\nstable_id: secret-stable\n---\n# Secret\n",
        )
        .expect("secret");
        fs::write(
            root.0.join("odd.md"),
            "---\ntype: Note\nsensitivity: embargoed\n---\n# Odd\n",
        )
        .expect("odd");
        fs::write(
            root.0.join("unlabelled.md"),
            "---\ntype: Note\n---\n# Unlabelled\n",
        )
        .expect("unlabelled");
        fs::write(root.0.join(".okfignore"), "private/**\n").expect("ignore");
        fs::create_dir(root.0.join("private")).expect("private");
        fs::write(root.0.join("private/raw.txt"), "raw").expect("ignored");
        let bundle = crate::read_bundle(&root.0);
        let plan = plan(
            &root.0,
            &bundle,
            &ProjectionInput {
                recipient: "Release partner".to_string(),
                recipient_audiences: vec!["partners".to_string()],
                max_sensitivity: "internal".to_string(),
                include_unknown_sensitivity: false,
                selected_concept_ids: vec!["start".to_string()],
                sensitive_terms: vec![],
            },
        )
        .expect("plan");

        assert_eq!(
            plan.included
                .iter()
                .map(|item| item.id.as_str())
                .collect::<Vec<_>>(),
            ["allowed", "start"]
        );
        assert!(plan.omissions.iter().any(|item| {
            item.id == "secret"
                && item.reason == ProjectionOmissionReason::SensitivityExceedsMaximum
        }));
        assert!(plan.omissions.iter().any(|item| {
            item.id == "odd" && item.reason == ProjectionOmissionReason::UnknownSensitivity
        }));
        assert!(plan.omissions.iter().any(|item| {
            item.id == "unlabelled" && item.reason == ProjectionOmissionReason::UnknownSensitivity
        }));
        assert!(plan
            .omissions
            .iter()
            .any(|item| item.id == "private/raw.txt"));
        assert_eq!(plan.link_consequences.len(), 3);
        assert!(!plan.revision.is_empty());
    }

    #[test]
    fn empty_recipient_audiences_do_not_filter_selected_concepts() {
        let concept = Concept {
            id: "audience-labelled".to_string(),
            title: "Audience labelled".to_string(),
            concept_type: "Note".to_string(),
            description: String::new(),
            tags: vec![],
            timestamp: None,
            resource: None,
            extra: BTreeMap::from([
                (
                    "audience".to_string(),
                    serde_json::json!(["partners"]),
                ),
                ("sensitivity".to_string(), serde_json::json!("public")),
            ]),
            body: String::new(),
            links: vec![],
            external_links: vec![],
            broken_links: vec![],
            cited_by: vec![],
            degree: 0,
        };
        let input = ProjectionInput {
            recipient: "Research group".to_string(),
            recipient_audiences: vec![],
            max_sensitivity: "internal".to_string(),
            include_unknown_sensitivity: true,
            selected_concept_ids: vec![concept.id.clone()],
            sensitive_terms: vec![],
        };

        assert!(eligibility(&concept, &input, 1).is_ok());
    }

    #[test]
    fn rewrites_omitted_links_and_redacts_excluded_identity() {
        let omitted = BTreeSet::from(["private/secret".to_string()]);
        let rendered = render_concept(
            "---\ntype: Note\n---\n# Public\n\n[Secret plan](private/secret.md)\n",
            "public",
            &omitted,
            &[AuditTerm {
                category: "excluded-concept-title".to_string(),
                value: "Secret plan".to_string(),
            }],
        )
        .expect("render");

        assert!(rendered.content.contains("[redacted]"));
        assert!(rendered.content.contains(OMISSION_ANCHOR));
        assert!(rendered.content.contains("## Projection omissions"));
        assert!(!rendered.content.contains("private/secret.md"));
    }

    #[test]
    fn erasure_audit_catches_markdown_frontmatter_index_assets_and_diagnostics() {
        let root = TempRoot::new("audit");
        fs::create_dir_all(root.0.join("assets")).expect("assets");
        for (path, content) in [
            ("concept.md", "---\nsource: SECRET-DIGEST\n---\nbody"),
            ("index.md", "# Secret concept"),
            ("diagnostic.json", "{\"path\":\"private/secret.md\"}"),
            ("assets/data.bin", "prefix SECRET-DIGEST suffix"),
        ] {
            fs::write(root.0.join(path), content).expect("audit fixture");
        }
        let report = audit_directory(
            &root.0,
            &[
                AuditTerm {
                    category: "source-identity".to_string(),
                    value: "SECRET-DIGEST".to_string(),
                },
                AuditTerm {
                    category: "excluded-concept-title".to_string(),
                    value: "Secret concept".to_string(),
                },
                AuditTerm {
                    category: "ignored-path".to_string(),
                    value: "private/secret.md".to_string(),
                },
            ],
        );

        assert!(!report.passed);
        assert_eq!(report.checked_files, 4);
        assert!(report
            .findings
            .iter()
            .any(|finding| finding.path == "concept.md"));
        assert!(report
            .findings
            .iter()
            .any(|finding| finding.path == "index.md"));
        assert!(report
            .findings
            .iter()
            .any(|finding| finding.path == "assets/data.bin"));
        assert!(report
            .findings
            .iter()
            .any(|finding| finding.path == "diagnostic.json"));
    }
}
