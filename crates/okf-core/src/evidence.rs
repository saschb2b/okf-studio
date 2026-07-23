use crate::Concept;
use regex::Regex;
use serde_json::{Map, Value};
use std::collections::{BTreeMap, BTreeSet};
use std::sync::OnceLock;

pub(crate) const MAX_EVIDENCE_SOURCES: usize = 128;
pub(crate) const MAX_CLAIM_CITATIONS: usize = 1_024;
const MAX_EVIDENCE_TEXT: usize = 2_048;

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct AuthoredEvidenceSource {
    pub id: String,
    pub title: String,
    pub uri: Option<String>,
    pub locator: Option<String>,
    pub observed_at: Option<String>,
    pub source_digest: Option<String>,
    pub evidence_digest: Option<String>,
    pub adapter_id: Option<String>,
    pub adapter_version: Option<u64>,
    pub media_type: Option<String>,
    pub last_checked_at: Option<String>,
    pub last_status: String,
    pub last_fingerprint: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct AuthoredClaimCitation {
    pub source_id: String,
    pub line: usize,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct ConceptEvidence {
    pub sources: Vec<AuthoredEvidenceSource>,
    pub citations: Vec<AuthoredClaimCitation>,
    pub invalid_source_ids: Vec<String>,
    pub sources_truncated: bool,
    pub citations_truncated: bool,
}

pub(crate) fn inspect(concept: &Concept) -> ConceptEvidence {
    let provenance = parse_provenance(concept.extra.get("provenance"));
    let (sources, invalid_source_ids, sources_truncated) =
        parse_sources(concept.extra.get("evidence"), &provenance);
    let (citations, citations_truncated) = citation_references(&concept.body);
    ConceptEvidence {
        sources,
        citations,
        invalid_source_ids,
        sources_truncated,
        citations_truncated,
    }
}

pub(crate) fn has_authored_source_signal(concept: &Concept) -> bool {
    !inspect(concept).sources.is_empty()
        || concept
            .extra
            .get("provenance")
            .is_some_and(|value| value.is_object() || value.is_array())
}

fn parse_provenance(value: Option<&Value>) -> BTreeMap<String, AuthoredEvidenceSource> {
    let entries = match value {
        Some(Value::Object(items)) => items
            .iter()
            .map(|(key, item)| (key.clone(), item))
            .collect::<Vec<_>>(),
        Some(Value::Array(items)) => items
            .iter()
            .enumerate()
            .map(|(index, item)| (format!("source-{}", index + 1), item))
            .collect(),
        _ => Vec::new(),
    };
    entries
        .into_iter()
        .take(MAX_EVIDENCE_SOURCES)
        .filter_map(|(key, value)| parse_provenance_source(&key, value))
        .map(|source| (source.id.clone(), source))
        .collect()
}

fn parse_provenance_source(key: &str, value: &Value) -> Option<AuthoredEvidenceSource> {
    let source = value.as_object()?;
    let id = safe_id(source.get("id").and_then(Value::as_str).unwrap_or(key))?;
    let title = bounded(source.get("title")?.as_str()?)?;
    let adapter = source.get("adapter").and_then(Value::as_object);
    Some(AuthoredEvidenceSource {
        id,
        title,
        uri: https_uri(source.get("uri").and_then(Value::as_str)),
        locator: bounded(
            source
                .get("locator")
                .and_then(Value::as_str)
                .unwrap_or_default(),
        ),
        observed_at: bounded(
            source
                .get("observed_at")
                .and_then(Value::as_str)
                .unwrap_or_default(),
        ),
        source_digest: digest(source.get("source_digest").and_then(Value::as_str)),
        evidence_digest: digest(source.get("evidence_digest").and_then(Value::as_str)),
        adapter_id: bounded(
            adapter
                .and_then(|item| item.get("id"))
                .and_then(Value::as_str)
                .unwrap_or_default(),
        ),
        adapter_version: adapter
            .and_then(|item| item.get("version"))
            .and_then(Value::as_u64),
        media_type: bounded(
            source
                .get("media_type")
                .and_then(Value::as_str)
                .unwrap_or_default(),
        ),
        last_checked_at: None,
        last_status: "unchecked".to_string(),
        last_fingerprint: None,
    })
}

fn parse_sources(
    value: Option<&Value>,
    provenance: &BTreeMap<String, AuthoredEvidenceSource>,
) -> (Vec<AuthoredEvidenceSource>, Vec<String>, bool) {
    let Some(entries) = value.and_then(Value::as_object) else {
        return (Vec::new(), Vec::new(), false);
    };
    let mut invalid = Vec::new();
    let sources = entries
        .iter()
        .take(MAX_EVIDENCE_SOURCES)
        .filter_map(|(key, value)| {
            let Some(id) = safe_id(key) else {
                invalid.push(key.chars().take(128).collect());
                return None;
            };
            let Some(source) = value.as_object() else {
                invalid.push(id);
                return None;
            };
            Some(parse_source(id, source, provenance))
        })
        .collect();
    (sources, invalid, entries.len() > MAX_EVIDENCE_SOURCES)
}

fn parse_source(
    id: String,
    source: &Map<String, Value>,
    provenance: &BTreeMap<String, AuthoredEvidenceSource>,
) -> AuthoredEvidenceSource {
    let provenance_id = source
        .get("provenance_id")
        .and_then(Value::as_str)
        .and_then(safe_id);
    let durable = provenance_id
        .as_ref()
        .and_then(|source_id| provenance.get(source_id));
    let authored = |key: &str| bounded(source.get(key).and_then(Value::as_str).unwrap_or_default());
    AuthoredEvidenceSource {
        id: id.clone(),
        title: authored("title")
            .or_else(|| durable.map(|item| item.title.clone()))
            .unwrap_or(id),
        uri: https_uri(source.get("uri").and_then(Value::as_str))
            .or_else(|| durable.and_then(|item| item.uri.clone())),
        locator: authored("locator").or_else(|| durable.and_then(|item| item.locator.clone())),
        observed_at: authored("observed_at")
            .or_else(|| durable.and_then(|item| item.observed_at.clone())),
        source_digest: digest(source.get("source_digest").and_then(Value::as_str))
            .or_else(|| durable.and_then(|item| item.source_digest.clone())),
        evidence_digest: digest(source.get("evidence_digest").and_then(Value::as_str))
            .or_else(|| durable.and_then(|item| item.evidence_digest.clone())),
        adapter_id: authored("adapter_id")
            .or_else(|| durable.and_then(|item| item.adapter_id.clone())),
        adapter_version: source
            .get("adapter_version")
            .and_then(Value::as_u64)
            .or_else(|| durable.and_then(|item| item.adapter_version)),
        media_type: authored("media_type")
            .or_else(|| durable.and_then(|item| item.media_type.clone())),
        last_checked_at: authored("last_checked_at"),
        last_status: source
            .get("last_status")
            .and_then(Value::as_str)
            .filter(|status| matches!(*status, "available" | "changed" | "unavailable"))
            .unwrap_or("unchecked")
            .to_string(),
        last_fingerprint: digest(source.get("last_fingerprint").and_then(Value::as_str)),
    }
}

fn citation_references(body: &str) -> (Vec<AuthoredClaimCitation>, bool) {
    let definition_ids = body
        .lines()
        .filter_map(|line| definition_pattern().captures(line))
        .filter_map(|capture| capture.get(1).map(|item| item.as_str().to_string()))
        .take(MAX_CLAIM_CITATIONS + 1)
        .collect::<Vec<_>>();
    if definition_ids.len() > MAX_CLAIM_CITATIONS {
        return (Vec::new(), true);
    }
    let definitions = definition_ids.into_iter().collect::<BTreeSet<_>>();
    let mut citations = body
        .lines()
        .enumerate()
        .filter(|(_, line)| !definition_pattern().is_match(line))
        .flat_map(|(index, line)| {
            citation_pattern()
                .captures_iter(line)
                .filter_map(|capture| capture.get(1))
                .filter(|source| !definitions.contains(source.as_str()))
                .map(move |source| AuthoredClaimCitation {
                    source_id: source.as_str().to_string(),
                    line: index + 1,
                })
        })
        .take(MAX_CLAIM_CITATIONS + 1)
        .collect::<Vec<_>>();
    let truncated = citations.len() > MAX_CLAIM_CITATIONS;
    citations.truncate(MAX_CLAIM_CITATIONS);
    (citations, truncated)
}

fn definition_pattern() -> &'static Regex {
    static PATTERN: OnceLock<Regex> = OnceLock::new();
    PATTERN.get_or_init(|| {
        Regex::new(r"^\s{0,3}\[\^([A-Za-z0-9][A-Za-z0-9._-]{0,127})\]:")
            .expect("valid evidence definition pattern")
    })
}

fn citation_pattern() -> &'static Regex {
    static PATTERN: OnceLock<Regex> = OnceLock::new();
    PATTERN.get_or_init(|| {
        Regex::new(r"\[\^([A-Za-z0-9][A-Za-z0-9._-]{0,127})\]")
            .expect("valid evidence citation pattern")
    })
}

fn safe_id(value: &str) -> Option<String> {
    let value = value.trim();
    (!value.is_empty()
        && value.len() <= 128
        && value.chars().enumerate().all(|(index, character)| {
            character.is_ascii_alphanumeric() || (index > 0 && matches!(character, '.' | '_' | '-'))
        }))
    .then(|| value.to_string())
}

fn bounded(value: &str) -> Option<String> {
    let value = value.trim();
    (!value.is_empty()).then(|| value.chars().take(MAX_EVIDENCE_TEXT).collect::<String>())
}

fn https_uri(value: Option<&str>) -> Option<String> {
    let value = bounded(value.unwrap_or_default())?;
    (value.starts_with("https://")
        && !value.split_once("://").is_some_and(|(_, rest)| {
            rest.split('/')
                .next()
                .is_some_and(|host| host.contains('@'))
        }))
    .then_some(value)
}

fn digest(value: Option<&str>) -> Option<String> {
    let value = value?.trim().to_ascii_lowercase();
    let digest = value.strip_prefix("sha256-").unwrap_or(&value);
    (digest.len() == 64
        && digest
            .chars()
            .all(|character| character.is_ascii_hexdigit()))
    .then(|| format!("sha256-{digest}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::BTreeMap;

    #[test]
    fn resolves_provenance_and_tracks_claim_lines() {
        let concept = Concept {
            id: "api".to_string(),
            concept_type: "Reference".to_string(),
            title: "API".to_string(),
            description: String::new(),
            tags: Vec::new(),
            timestamp: None,
            resource: None,
            extra: BTreeMap::from([
                (
                    "provenance".to_string(),
                    serde_json::json!({
                        "spec": {
                            "title": "Spec",
                            "uri": "https://example.com/spec",
                            "observed_at": "2026-07-23T00:00:00Z",
                            "adapter": {"id": "html", "version": 1}
                        }
                    }),
                ),
                (
                    "evidence".to_string(),
                    serde_json::json!({
                        "spec": {"provenance_id": "spec", "locator": "GET /items"}
                    }),
                ),
            ]),
            body: "Claim.[^spec]\n\nMissing.[^missing]".to_string(),
            links: Vec::new(),
            external_links: Vec::new(),
            broken_links: Vec::new(),
            cited_by: Vec::new(),
            degree: 0,
        };

        let report = inspect(&concept);
        assert_eq!(
            report.sources[0].uri.as_deref(),
            Some("https://example.com/spec")
        );
        assert_eq!(report.sources[0].locator.as_deref(), Some("GET /items"));
        assert_eq!(report.citations[1].line, 3);
    }
}
