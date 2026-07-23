use crate::model::Concept;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{BTreeMap, BTreeSet};

const MAX_AUDIENCES: usize = 16;
const MAX_AUDIENCE_CHARS: usize = 128;
const MAX_SENSITIVITY_CHARS: usize = 128;
const MAX_HANDLING_NOTE_CHARS: usize = 512;
const MAX_DIAGNOSTICS: usize = 8;

pub const KNOWN_SENSITIVITIES: [&str; 4] = ["public", "internal", "confidential", "restricted"];

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AccessHints {
    pub has_metadata: bool,
    pub audiences: Vec<String>,
    pub sensitivity: Option<String>,
    pub known_sensitivity: Option<String>,
    pub handling_notes: Option<String>,
    pub diagnostics: Vec<String>,
}

pub fn assess(concept: &Concept) -> AccessHints {
    assess_extra(&concept.extra)
}

pub fn assess_extra(extra: &BTreeMap<String, Value>) -> AccessHints {
    let has_metadata = ["audience", "sensitivity", "handling_notes"]
        .iter()
        .any(|key| extra.contains_key(*key));
    if !has_metadata {
        return AccessHints::default();
    }

    let mut diagnostics = Vec::new();
    let audiences = audience_values(extra.get("audience"), &mut diagnostics);
    let sensitivity = string_value(
        extra.get("sensitivity"),
        "Sensitivity",
        MAX_SENSITIVITY_CHARS,
        &mut diagnostics,
    );
    let known_sensitivity = sensitivity.as_deref().and_then(normalize_sensitivity);
    if let Some(value) = sensitivity
        .as_deref()
        .filter(|_| known_sensitivity.is_none())
    {
        diagnostics.push(format!(
            "Unknown sensitivity value \"{value}\" remains visible and receives no automatic rank."
        ));
    }
    let handling_notes = string_value(
        extra.get("handling_notes"),
        "Handling notes",
        MAX_HANDLING_NOTE_CHARS,
        &mut diagnostics,
    );
    diagnostics.truncate(MAX_DIAGNOSTICS);

    AccessHints {
        has_metadata,
        audiences,
        sensitivity,
        known_sensitivity,
        handling_notes,
        diagnostics,
    }
}

pub fn sensitivity_rank(value: &str) -> Option<u8> {
    normalize_sensitivity(value).and_then(|normalized| {
        KNOWN_SENSITIVITIES
            .iter()
            .position(|candidate| candidate == &normalized)
            .map(|index| index as u8)
    })
}

fn normalize_sensitivity(value: &str) -> Option<String> {
    let normalized = value.trim().to_ascii_lowercase();
    KNOWN_SENSITIVITIES
        .contains(&normalized.as_str())
        .then_some(normalized)
}

fn audience_values(value: Option<&Value>, diagnostics: &mut Vec<String>) -> Vec<String> {
    let Some(value) = value else {
        return Vec::new();
    };
    let values: Vec<&Value> = match value {
        Value::Array(items) => items.iter().collect(),
        Value::String(_) => vec![value],
        _ => {
            diagnostics.push("Audience must be a string or a list of strings.".to_string());
            return Vec::new();
        }
    };
    let value_count = values.len();
    let mut seen = BTreeSet::new();
    let mut audiences = Vec::new();
    for item in values {
        let Value::String(raw) = item else {
            diagnostics.push("Audience entries must be strings.".to_string());
            continue;
        };
        let Some(value) = bounded_text(raw, MAX_AUDIENCE_CHARS) else {
            diagnostics.push(
                "An audience entry was empty, contained controls, or exceeded 128 characters."
                    .to_string(),
            );
            continue;
        };
        if seen.insert(value.clone()) {
            audiences.push(value);
        }
        if audiences.len() == MAX_AUDIENCES {
            if value_count > MAX_AUDIENCES {
                diagnostics.push(format!(
                    "Only the first {MAX_AUDIENCES} valid audience entries were interpreted."
                ));
            }
            break;
        }
    }
    audiences
}

fn string_value(
    value: Option<&Value>,
    label: &str,
    max_chars: usize,
    diagnostics: &mut Vec<String>,
) -> Option<String> {
    let value = value?;
    let Value::String(raw) = value else {
        diagnostics.push(format!("{label} must be a string."));
        return None;
    };
    let Some(value) = bounded_text(raw, max_chars) else {
        diagnostics.push(format!(
            "{label} was empty, contained controls, or exceeded {max_chars} characters."
        ));
        return None;
    };
    Some(value)
}

fn bounded_text(value: &str, max_chars: usize) -> Option<String> {
    let value = value.trim();
    (!value.is_empty()
        && value.chars().count() <= max_chars
        && !value.chars().any(char::is_control))
    .then(|| value.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn extra(entries: impl IntoIterator<Item = (&'static str, Value)>) -> BTreeMap<String, Value> {
        entries
            .into_iter()
            .map(|(key, value)| (key.to_string(), value))
            .collect()
    }

    #[test]
    fn preserves_unknown_values_without_treating_them_as_ranked() {
        let hints = assess_extra(&extra([
            (
                "audience",
                serde_json::json!(["engineering", "partners", "engineering"]),
            ),
            ("sensitivity", serde_json::json!("embargoed")),
            (
                "handling_notes",
                serde_json::json!("Share after the named release."),
            ),
        ]));

        assert_eq!(hints.audiences, ["engineering", "partners"]);
        assert_eq!(hints.sensitivity.as_deref(), Some("embargoed"));
        assert_eq!(hints.known_sensitivity, None);
        assert!(hints.diagnostics[0].contains("Unknown sensitivity"));
    }

    #[test]
    fn bounds_invalid_values_and_normalizes_only_the_known_rank() {
        let hints = assess_extra(&extra([
            (
                "audience",
                serde_json::json!(["engineering", 3, "x".repeat(129)]),
            ),
            ("sensitivity", serde_json::json!("Internal")),
            ("handling_notes", serde_json::json!({"unsafe": true})),
        ]));

        assert_eq!(hints.audiences, ["engineering"]);
        assert_eq!(hints.sensitivity.as_deref(), Some("Internal"));
        assert_eq!(hints.known_sensitivity.as_deref(), Some("internal"));
        assert!(hints
            .diagnostics
            .iter()
            .any(|message| message == "Handling notes must be a string."));
        assert_eq!(sensitivity_rank("CONFIDENTIAL"), Some(2));
    }
}
