//! Attested computations: resolving the contract, and checking a run against it
//! without executing anything (OKF v0.2 spec section 10).
//!
//! The problem the spec is solving is narrow and real. When a bundle backs a
//! *number*, an agent asked for that number can either run the sanctioned query
//! or write plausible SQL that looks like it. Both produce a figure, and prose
//! cannot tell them apart. So the computation is stored, a run must return a
//! shaped receipt, and a deterministic attester compares the two.
//!
//! What Studio does here, and what it deliberately does not:
//!
//! - **Resolves** the computation, inline from a `# Computation` fence or from a
//!   containment-checked path. Two forms, and exactly one may be present.
//! - **Checks the receipt's shape** against the fields `executor.receipt`
//!   declares, because an attester cannot inspect evidence a run never returned.
//! - **Checks provenance**: the SQL that ran, canonicalized, against the stored
//!   computation. This is the check that catches agent-authored SQL, and it needs
//!   no database and no code execution — which is why it belongs here.
//! - **Does not execute** the executor or the attester. Running arbitrary code
//!   from a bundle is not something a reader should do, and the spec puts the
//!   executor outside the bundle for the same reason.
//! - **Does not check fidelity.** That requires re-reading the authoritative
//!   result by job id, which only the executor's runtime can do. Reported as
//!   unavailable rather than passed, because a check that cannot run has not
//!   succeeded.

use crate::model::{Concept, ComputationContract};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

/// Where a computation's text came from. The spec permits an inline fence or a
/// file, and exactly one.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", tag = "kind")]
pub enum ComputationSource {
    /// A single fenced block in the body under `# Computation`.
    Inline { text: String },
    /// The file named by `computation:`.
    File { path: String, text: String },
}

impl ComputationSource {
    pub fn text(&self) -> &str {
        match self {
            Self::Inline { text } | Self::File { text, .. } => text,
        }
    }
}

/// Why a contract could not be read. Each of these is a bundle defect, so they
/// are reported rather than papered over with a default.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", tag = "reason", content = "detail")]
pub enum ContractError {
    /// The concept is not an Attested Computation.
    NotAComputation,
    /// `runtime` is required: it decides how everything else is interpreted.
    MissingRuntime,
    /// Neither an inline fence nor a `computation:` path.
    NoComputation,
    /// Both an inline fence and a path. Which one ran would be a guess.
    AmbiguousComputation,
    /// The path escaped the bundle, or does not resolve to a file.
    UnreadableComputation(String),
}

/// The verdict on one run. Provenance and fidelity are separate because they can
/// disagree: the sanctioned SQL can run and its result still be misreported.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Attestation {
    /// Fields `executor.receipt` declares that the receipt did not carry.
    pub missing_receipt_fields: Vec<String>,
    pub provenance: CheckOutcome,
    pub fidelity: CheckOutcome,
    /// True only when every check that could run passed and none was skipped.
    pub attested: bool,
    /// Set when the concept's definition is past `stale_after`. A stale
    /// definition can still attest cleanly, so this warns and does not fail.
    pub stale: bool,
}

/// The result of one check. `Unavailable` is deliberately not `Passed`: a check
/// that could not run has not succeeded, and collapsing the two is how a gate
/// silently stops gating.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", tag = "state", content = "detail")]
pub enum CheckOutcome {
    Passed,
    Failed(String),
    Unavailable(String),
}

impl CheckOutcome {
    pub fn passed(&self) -> bool {
        matches!(self, Self::Passed)
    }
}

/// A run's evidence, keyed by the field names `executor.receipt` declares.
pub type Receipt = BTreeMap<String, String>;

/// Read the contract's computation text.
pub fn resolve_computation(
    root: &Path,
    concept: &Concept,
) -> Result<(ComputationContract, ComputationSource), ContractError> {
    let contract = concept
        .computation
        .clone()
        .ok_or(ContractError::NotAComputation)?;
    if contract.runtime.is_empty() {
        return Err(ContractError::MissingRuntime);
    }

    let inline = inline_computation(&concept.body);
    match (&contract.computation, inline) {
        (Some(_), Some(_)) => Err(ContractError::AmbiguousComputation),
        (None, None) => Err(ContractError::NoComputation),
        (None, Some(text)) => Ok((contract, ComputationSource::Inline { text })),
        (Some(path), None) => {
            let file = contained_file(root, path)
                .ok_or_else(|| ContractError::UnreadableComputation(path.clone()))?;
            let text = std::fs::read_to_string(&file)
                .map_err(|_| ContractError::UnreadableComputation(path.clone()))?;
            Ok((
                contract.clone(),
                ComputationSource::File {
                    path: path.clone(),
                    text,
                },
            ))
        }
    }
}

/// The single fenced block under a `# Computation` heading.
///
/// Scoped to that heading rather than taking the body's first fence: a concept
/// may well show an example query in its prose, and attesting against the wrong
/// block would be worse than finding none.
fn inline_computation(body: &str) -> Option<String> {
    let mut lines = body.lines();
    let mut inside_section = false;
    while let Some(line) = lines.next() {
        let trimmed = line.trim();
        if let Some(heading) = trimmed.strip_prefix('#') {
            let heading = heading.trim_start_matches('#').trim();
            inside_section = heading.eq_ignore_ascii_case("computation");
            continue;
        }
        if !inside_section || !trimmed.starts_with("```") {
            continue;
        }
        let mut collected = Vec::new();
        for line in lines.by_ref() {
            if line.trim().starts_with("```") {
                return Some(collected.join("\n"));
            }
            collected.push(line);
        }
        // An unterminated fence runs to the end of the body; taking it is more
        // useful than discarding the computation over a missing close.
        return Some(collected.join("\n"));
    }
    None
}

/// Attest one run against the contract.
///
/// `today` is passed in for the same reason staleness takes it elsewhere: so the
/// verdict is a function of its inputs.
pub fn attest(
    contract: &ComputationContract,
    computation: &ComputationSource,
    concept: &Concept,
    receipt: &Receipt,
    today: &str,
) -> Attestation {
    let declared = contract
        .executor
        .as_ref()
        .map(|executor| executor.receipt.clone())
        .unwrap_or_default();
    let missing_receipt_fields = declared
        .iter()
        .filter(|field| {
            receipt
                .get(field.as_str())
                .is_none_or(|value| value.trim().is_empty())
        })
        .cloned()
        .collect::<Vec<_>>();

    let provenance = provenance_check(computation.text(), contract, receipt);
    // Fidelity needs the authoritative result re-read by job id, which only the
    // runtime can do. Studio says so rather than implying the run was checked.
    let fidelity = CheckOutcome::Unavailable(
        "Fidelity is checked by the executor's runtime, by re-reading the result by job id."
            .to_string(),
    );

    Attestation {
        attested: missing_receipt_fields.is_empty() && provenance.passed() && fidelity.passed(),
        missing_receipt_fields,
        provenance,
        fidelity,
        stale: concept.is_stale_on(today),
    }
}

/// Compare what ran against what was stored.
///
/// The receipt field is whichever declared field holds the executed text; the
/// spec's example calls it `executed_sql`, and a non-SQL runtime will call it
/// something else, so any field whose name ends in `_sql` or is `executed` is
/// taken. Absent, the check is unavailable rather than passed.
fn provenance_check(
    stored: &str,
    contract: &ComputationContract,
    receipt: &Receipt,
) -> CheckOutcome {
    let Some((field, executed)) = receipt
        .iter()
        .find(|(key, _)| key.as_str() == "executed" || key.ends_with("_sql"))
    else {
        return CheckOutcome::Unavailable(
            "The receipt carries no executed-computation field to compare.".to_string(),
        );
    };
    if executed.trim().is_empty() {
        return CheckOutcome::Unavailable(format!("The receipt's {field} is empty."));
    }

    let stored_shape = canonicalize(stored);
    let executed_shape = canonicalize(executed);
    if stored_shape == executed_shape {
        return CheckOutcome::Passed;
    }
    // A bound parameter legitimately differs from its placeholder, so a stored
    // computation with holes is compared with the holes wildcarded. Binding
    // semantics follow the runtime, which is why this compares a shape rather
    // than trying to bind the parameters itself.
    if !contract.parameters.is_empty()
        && matches_with_parameter_holes(&stored_shape, &executed_shape, contract)
    {
        return CheckOutcome::Passed;
    }
    CheckOutcome::Failed(format!(
        "The {field} does not match the stored computation. \
         An agent may supply parameter values and must not author the computation."
    ))
}

/// Whether the executed text matches the stored one once every declared
/// parameter placeholder is allowed to stand for any single value.
fn matches_with_parameter_holes(
    stored: &str,
    executed: &str,
    contract: &ComputationContract,
) -> bool {
    // Split the stored shape on each placeholder spelling a runtime might use,
    // then require the remaining literal segments to appear in order. What sits
    // between them is the bound value, whatever the runtime's binding syntax.
    let mut placeholders = Vec::new();
    for parameter in &contract.parameters {
        for spelling in [
            format!("@{}", parameter.name),
            format!("${{{}}}", parameter.name),
            format!("${}", parameter.name),
            format!(":{}", parameter.name),
            format!("{{{{{}}}}}", parameter.name),
            format!("{{{}}}", parameter.name),
        ] {
            let spelling = canonicalize(&spelling);
            if stored.contains(&spelling) {
                placeholders.push(spelling);
            }
        }
    }
    if placeholders.is_empty() {
        return false;
    }

    let mut segments: Vec<&str> = vec![stored];
    for placeholder in &placeholders {
        segments = segments
            .into_iter()
            .flat_map(|segment| segment.split(placeholder.as_str()))
            .collect();
    }

    let mut cursor = 0_usize;
    for segment in segments {
        if segment.is_empty() {
            continue;
        }
        match executed[cursor..].find(segment) {
            Some(found) => cursor += found + segment.len(),
            None => return false,
        }
    }
    true
}

/// Reduce a computation to a comparable shape: no comments, no repeated
/// whitespace, case-folded.
///
/// Deliberately shallow. A real parser per runtime would compare more precisely,
/// but this has to be deterministic, dependency-free, and identical for every
/// runtime, and it already catches the case that matters — an agent writing its
/// own query rather than running the stored one. Its limit is honest: a rewrite
/// that only reorders or renames will pass, so this is a provenance check, not a
/// semantic equivalence proof.
pub fn canonicalize(computation: &str) -> String {
    let mut out = String::with_capacity(computation.len());
    for line in computation.lines() {
        let line = match line.find("--") {
            Some(at) => &line[..at],
            None => line,
        };
        for word in line.split_whitespace() {
            if !out.is_empty() {
                out.push(' ');
            }
            out.push_str(&word.to_ascii_lowercase());
        }
    }
    out
}

fn contained_file(root: &Path, relative: &str) -> Option<PathBuf> {
    // A bundle-absolute path is written from the root, and joining it verbatim
    // would resolve against the filesystem root on Unix.
    let relative = relative.trim_start_matches('/');
    if relative.is_empty() || relative.contains("..") || relative.contains('\\') {
        return None;
    }
    let root = std::fs::canonicalize(root).ok()?;
    let target = std::fs::canonicalize(root.join(relative)).ok()?;
    (target.starts_with(&root) && target.is_file()).then_some(target)
}
