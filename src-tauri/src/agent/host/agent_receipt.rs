//! The gate: an agent's own claim that it ran a sanctioned computation.
//!
//! Third instance of the house pattern that `agent_artifact` and `agent_critic`
//! already run — the agent emits a bounded JSON fence, Rust validates it, and
//! only validated structure crosses IPC. Prose is never authority.
//!
//! Why this rather than a badge in the reader: the failure an Attested
//! Computation exists to prevent is an agent reporting a number it got from a
//! query it wrote itself, and that happens *here*, at the moment a turn asserts
//! a figure. Security research is consistent that a passive indicator is
//! ignored while an interruption is heeded, so the check belongs where the
//! claim is made rather than on a concept page nobody consults while reading an
//! answer.
//!
//! The critical property: **the agent supplies only its receipt.** What that
//! receipt is checked against is read from the bundle. An agent that could
//! supply both sides could always make them agree, and the gate would be
//! theatre.

use okf_core::attest::{attest_run, AttestationReport, Receipt};
use okf_core::Bundle;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::path::Path;

const RECEIPT_FENCE: &str = "```okf-receipt";
const MAX_RECEIPT_INPUT_CHARS: usize = 262_144;
const MAX_RECEIPT_FIELDS: usize = 64;
const MAX_FIELD_NAME_CHARS: usize = 128;
const MAX_FIELD_VALUE_CHARS: usize = 128 * 1024;
const MAX_CONCEPT_ID_CHARS: usize = 512;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ReceiptEnvelope {
    schema_version: u32,
    /// Which Attested Computation this run claims to be of.
    concept_id: String,
    /// The run's evidence, keyed by the field names `executor.receipt` declares.
    receipt: BTreeMap<String, serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", tag = "status")]
pub enum AgentReceiptValidation {
    /// The turn carried no receipt fence. The ordinary case, and not a problem.
    None,
    /// A fence was present and could not be used. Reported rather than ignored:
    /// a turn that *tried* to claim attestation and failed is a more
    /// interesting state than one that never claimed anything.
    Invalid { message: String },
    /// Checked. `report.verdict` says whether the claim stands.
    Checked { report: Box<AttestationReport> },
}

fn invalid(message: &str) -> AgentReceiptValidation {
    AgentReceiptValidation::Invalid {
        message: message.to_string(),
    }
}

fn receipt_json(markdown: &str) -> Option<&str> {
    let start = markdown.rfind(RECEIPT_FENCE)? + RECEIPT_FENCE.len();
    let after_marker = markdown.get(start..)?;
    let content_start = after_marker.find('\n')? + start + 1;
    let remainder = markdown.get(content_start..)?;
    let end = remainder.find("\n```")? + content_start;
    markdown.get(content_start..end).map(str::trim)
}

/// Flatten a receipt's values to text, the shape the engine compares.
///
/// A runtime reports a row count as a number and a dry-run flag as a boolean,
/// so scalars are coerced. Nested values are **rejected**, not stringified: a
/// serialized object would compare against nothing meaningful, and accepting it
/// would let a receipt look complete while the declared field is absent.
fn flatten(fields: BTreeMap<String, serde_json::Value>) -> Result<Receipt, String> {
    if fields.len() > MAX_RECEIPT_FIELDS {
        return Err("That receipt declares more fields than a run's evidence has.".to_string());
    }
    let mut receipt = Receipt::new();
    for (name, value) in fields {
        if name.trim().is_empty() || name.chars().count() > MAX_FIELD_NAME_CHARS {
            return Err("A receipt field name is empty or too long.".to_string());
        }
        let text = match value {
            serde_json::Value::String(text) => text,
            serde_json::Value::Number(number) => number.to_string(),
            serde_json::Value::Bool(flag) => flag.to_string(),
            serde_json::Value::Null => continue,
            _ => {
                return Err(format!(
                    "Receipt field {name} is not a single value, so there is nothing to compare."
                ));
            }
        };
        if text.chars().count() > MAX_FIELD_VALUE_CHARS {
            return Err(format!("Receipt field {name} is too large to attest."));
        }
        receipt.insert(name, text);
    }
    if receipt.is_empty() {
        return Err("That receipt carries no usable fields.".to_string());
    }
    Ok(receipt)
}

/// Validate an `okf-receipt` fence in agent output and attest the run it claims.
///
/// `today` is supplied rather than read from a clock, so the verdict is a
/// function of its inputs.
pub fn validate(
    root: &Path,
    markdown: &str,
    bundle: &Bundle,
    today: &str,
) -> AgentReceiptValidation {
    let Some(json) = receipt_json(markdown) else {
        return AgentReceiptValidation::None;
    };
    if markdown.chars().count() > MAX_RECEIPT_INPUT_CHARS {
        return invalid("The receipt response is too large to validate.");
    }
    let envelope = match serde_json::from_str::<ReceiptEnvelope>(json) {
        Ok(envelope) => envelope,
        Err(error) => return invalid(&format!("The receipt JSON is invalid: {error}")),
    };
    if envelope.schema_version != 1 {
        return invalid("Receipt schemaVersion must be 1.");
    }
    if envelope.concept_id.trim().is_empty()
        || envelope.concept_id.chars().count() > MAX_CONCEPT_ID_CHARS
    {
        return invalid("The receipt names no usable concept.");
    }
    // Looked up in the bundle rather than trusted from the envelope. This is the
    // line that makes the check mean something: the agent says which
    // computation it ran, and Studio decides what that computation *is*.
    let Some(concept) = bundle
        .concepts
        .iter()
        .find(|concept| concept.id == envelope.concept_id)
    else {
        return invalid(&format!(
            "This bundle has no concept {}, so there is no contract to check the run against.",
            envelope.concept_id
        ));
    };
    let receipt = match flatten(envelope.receipt) {
        Ok(receipt) => receipt,
        Err(message) => return invalid(&message),
    };
    AgentReceiptValidation::Checked {
        report: Box::new(attest_run(root, concept, &receipt, today)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use okf_core::attest::AttestationVerdict;
    use okf_core::parse::read_bundle;
    use std::fs;
    use std::path::PathBuf;

    const CONTRACT: &str = r#"---
type: Attested Computation
title: Revenue
runtime: bigquery
parameters:
  - { name: year, type: integer, required: true }
executor:
  receipt: [job_id, executed_sql, result]
attester:
  resource: references/attesters/revenue.py
---

# Computation

```sql
SELECT SUM(amount) FROM finance.recognized WHERE fiscal_year = @year
```
"#;

    fn scratch(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("okf-receipt-{name}"));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(dir.join("computations")).unwrap();
        fs::write(dir.join("computations/revenue.md"), CONTRACT).unwrap();
        dir
    }

    fn fence(body: &str) -> String {
        format!("Here is the figure.\n\n```okf-receipt\n{body}\n```\n")
    }

    #[test]
    fn ordinary_prose_carries_no_receipt() {
        let root = scratch("none");
        let bundle = read_bundle(&root);
        assert!(matches!(
            validate(&root, "Revenue was 12345.", &bundle, "2026-07-01"),
            AgentReceiptValidation::None
        ));
        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn a_run_of_the_sanctioned_computation_is_checked() {
        let root = scratch("clean");
        let bundle = read_bundle(&root);
        let markdown = fence(
            r#"{"schemaVersion":1,"conceptId":"computations/revenue","receipt":{
                "job_id":"bq:1",
                "executed_sql":"SELECT SUM(amount) FROM finance.recognized WHERE fiscal_year = 2026",
                "result":12345
            }}"#,
        );
        let AgentReceiptValidation::Checked { report } =
            validate(&root, &markdown, &bundle, "2026-07-01")
        else {
            panic!("expected a checked receipt");
        };
        // `result` arrived as a number, which a runtime does, and was coerced
        // rather than rejected.
        assert_eq!(report.verdict, AttestationVerdict::ProvenanceEstablished);
        fs::remove_dir_all(&root).unwrap();
    }

    /// The whole reason this module exists.
    #[test]
    fn an_agent_that_wrote_its_own_query_fails_the_gate() {
        let root = scratch("substituted");
        let bundle = read_bundle(&root);
        let markdown = fence(
            r#"{"schemaVersion":1,"conceptId":"computations/revenue","receipt":{
                "job_id":"bq:2",
                "executed_sql":"SELECT SUM(amount) FROM finance.raw_orders",
                "result":"99999"
            }}"#,
        );
        let AgentReceiptValidation::Checked { report } =
            validate(&root, &markdown, &bundle, "2026-07-01")
        else {
            panic!("expected a checked receipt");
        };
        assert_eq!(report.verdict, AttestationVerdict::Failed);
        fs::remove_dir_all(&root).unwrap();
    }

    /// An agent cannot smuggle in the computation it wants to be judged against:
    /// the envelope carries no computation at all, and an unknown concept is
    /// refused rather than treated as a contract of its own making.
    #[test]
    fn a_receipt_naming_an_unknown_concept_is_refused() {
        let root = scratch("unknown");
        let bundle = read_bundle(&root);
        let markdown = fence(
            r#"{"schemaVersion":1,"conceptId":"computations/invented","receipt":{"executed_sql":"SELECT 1"}}"#,
        );
        let AgentReceiptValidation::Invalid { message } =
            validate(&root, &markdown, &bundle, "2026-07-01")
        else {
            panic!("expected a refusal");
        };
        assert!(message.contains("no concept"));
        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn a_nested_receipt_field_is_refused_rather_than_stringified() {
        let root = scratch("nested");
        let bundle = read_bundle(&root);
        let markdown = fence(
            r#"{"schemaVersion":1,"conceptId":"computations/revenue","receipt":{"rows":[1,2]}}"#,
        );
        let AgentReceiptValidation::Invalid { message } =
            validate(&root, &markdown, &bundle, "2026-07-01")
        else {
            panic!("expected a refusal");
        };
        assert!(message.contains("nothing to compare"));
        fs::remove_dir_all(&root).unwrap();
    }

    /// A malformed fence is reported, not silently dropped: a turn that tried to
    /// claim attestation and failed is more interesting than one that never
    /// claimed anything, and swallowing it would let a broken claim read as an
    /// ordinary answer.
    #[test]
    fn a_malformed_fence_is_reported() {
        let root = scratch("malformed");
        let bundle = read_bundle(&root);
        let markdown = fence("{not json");
        assert!(matches!(
            validate(&root, &markdown, &bundle, "2026-07-01"),
            AgentReceiptValidation::Invalid { .. }
        ));
        fs::remove_dir_all(&root).unwrap();
    }
}
