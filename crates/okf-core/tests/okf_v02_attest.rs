//! Attesting a run against a stored computation (OKF v0.2 spec section 10).
//!
//! The check that earns its keep is provenance: catching an agent that wrote its
//! own query instead of running the sanctioned one. These tests are mostly about
//! that, and about the cases where a check must report itself unavailable rather
//! than quietly passing.

use okf_core::attest::{
    attest, canonicalize, resolve_computation, CheckOutcome, ComputationSource, ContractError,
    Receipt,
};
use okf_core::parse::read_bundle;
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};

fn scratch(name: &str) -> PathBuf {
    let root = std::env::temp_dir().join(format!("okf-attest-{name}-{}", std::process::id()));
    let _ = fs::remove_dir_all(&root);
    fs::create_dir_all(&root).expect("create scratch bundle");
    root
}

fn write(root: &Path, rel: &str, body: &str) {
    let path = root.join(rel);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).expect("create parent");
    }
    fs::write(path, body).expect("write file");
}

fn concept_named<'a>(
    bundle: &'a okf_core::model::Bundle,
    id: &str,
) -> &'a okf_core::model::Concept {
    bundle
        .concepts
        .iter()
        .find(|concept| concept.id == id)
        .expect("concept")
}

fn receipt(pairs: &[(&str, &str)]) -> Receipt {
    pairs
        .iter()
        .map(|(key, value)| (key.to_string(), value.to_string()))
        .collect::<BTreeMap<_, _>>()
}

const CONTRACT: &str = r#"---
type: Attested Computation
title: Revenue for fiscal year
runtime: bigquery
parameters:
  - { name: year, type: integer, required: true }
executor:
  resource: references/skills/run-on-bq.md
  receipt: [job_id, executed_sql, result]
attester:
  resource: references/attesters/revenue.py
stale_after: 2026-09-23
---

# Computation

```sql
SELECT SUM(amount) AS revenue
FROM finance.recognized      -- the sanctioned table
WHERE fiscal_year = @year
```
"#;

#[test]
fn passes_a_run_of_the_stored_computation_with_a_bound_parameter() {
    let root = scratch("bound");
    write(&root, "computations/revenue.md", CONTRACT);
    let bundle = read_bundle(&root);
    let concept = concept_named(&bundle, "computations/revenue");

    let (contract, computation) = resolve_computation(&root, concept).expect("contract");
    assert!(matches!(computation, ComputationSource::Inline { .. }));

    // The agent supplied 2026 for the declared hole, and nothing else changed.
    let run = receipt(&[
        ("job_id", "bq:job-1"),
        (
            "executed_sql",
            "SELECT SUM(amount) AS revenue FROM finance.recognized WHERE fiscal_year = 2026",
        ),
        ("result", "12345"),
    ]);
    let verdict = attest(&contract, &computation, concept, &run, "2026-07-01");

    assert_eq!(verdict.provenance, CheckOutcome::Passed);
    assert!(verdict.missing_receipt_fields.is_empty());
    assert!(!verdict.stale);
    // Fidelity cannot run here, so the run is not attested — an unavailable
    // check is not a passed one.
    assert!(matches!(verdict.fidelity, CheckOutcome::Unavailable(_)));
    assert!(!verdict.attested);

    fs::remove_dir_all(&root).expect("cleanup");
}

#[test]
fn fails_a_run_whose_sql_the_agent_authored() {
    let root = scratch("authored");
    write(&root, "computations/revenue.md", CONTRACT);
    let bundle = read_bundle(&root);
    let concept = concept_named(&bundle, "computations/revenue");
    let (contract, computation) = resolve_computation(&root, concept).expect("contract");

    // Plausible, wrong, and the whole reason the spec exists: a different table
    // and no fiscal-year filter, reported as if it were the sanctioned query.
    let run = receipt(&[
        ("job_id", "bq:job-2"),
        (
            "executed_sql",
            "SELECT SUM(amount) AS revenue FROM finance.all_invoices",
        ),
        ("result", "999999"),
    ]);
    let verdict = attest(&contract, &computation, concept, &run, "2026-07-01");

    match &verdict.provenance {
        CheckOutcome::Failed(detail) => assert!(detail.contains("must not author")),
        other => panic!("expected a provenance failure, got {other:?}"),
    }
    assert!(!verdict.attested);

    fs::remove_dir_all(&root).expect("cleanup");
}

#[test]
fn reports_a_receipt_missing_declared_evidence() {
    let root = scratch("receipt");
    write(&root, "computations/revenue.md", CONTRACT);
    let bundle = read_bundle(&root);
    let concept = concept_named(&bundle, "computations/revenue");
    let (contract, computation) = resolve_computation(&root, concept).expect("contract");

    // No job_id, and an empty result. An attester cannot inspect evidence a run
    // never returned, so this is reported rather than assumed fine.
    let run = receipt(&[
        (
            "executed_sql",
            "SELECT SUM(amount) AS revenue FROM finance.recognized WHERE fiscal_year = 2026",
        ),
        ("result", "   "),
    ]);
    let verdict = attest(&contract, &computation, concept, &run, "2026-07-01");

    assert_eq!(verdict.missing_receipt_fields, ["job_id", "result"]);
    assert!(!verdict.attested);

    fs::remove_dir_all(&root).expect("cleanup");
}

#[test]
fn reports_provenance_unavailable_when_nothing_says_what_ran() {
    let root = scratch("noexec");
    write(&root, "computations/revenue.md", CONTRACT);
    let bundle = read_bundle(&root);
    let concept = concept_named(&bundle, "computations/revenue");
    let (contract, computation) = resolve_computation(&root, concept).expect("contract");

    let run = receipt(&[("job_id", "bq:job-3"), ("result", "12345")]);
    let verdict = attest(&contract, &computation, concept, &run, "2026-07-01");

    // Unavailable, never Passed: a gate that treats an unrunnable check as a
    // success has stopped gating.
    assert!(matches!(verdict.provenance, CheckOutcome::Unavailable(_)));
    assert!(!verdict.attested);

    fs::remove_dir_all(&root).expect("cleanup");
}

#[test]
fn warns_on_a_stale_definition_without_failing_the_run() {
    let root = scratch("stale");
    write(&root, "computations/revenue.md", CONTRACT);
    let bundle = read_bundle(&root);
    let concept = concept_named(&bundle, "computations/revenue");
    let (contract, computation) = resolve_computation(&root, concept).expect("contract");

    let run = receipt(&[
        ("job_id", "bq:job-4"),
        (
            "executed_sql",
            "SELECT SUM(amount) AS revenue FROM finance.recognized WHERE fiscal_year = 2026",
        ),
        ("result", "12345"),
    ]);
    let verdict = attest(&contract, &computation, concept, &run, "2026-10-01");

    // A stale definition can still attest cleanly: the two answer different
    // questions, so staleness warns and provenance still passes.
    assert!(verdict.stale);
    assert_eq!(verdict.provenance, CheckOutcome::Passed);

    fs::remove_dir_all(&root).expect("cleanup");
}

#[test]
fn resolves_a_file_computation_and_refuses_one_outside_the_bundle() {
    let root = scratch("file");
    write(
        &root,
        "computations/revenue.md",
        "---\ntype: Attested Computation\nruntime: bigquery\ncomputation: references/revenue.sql\n---\n",
    );
    write(
        &root,
        "references/revenue.sql",
        "SELECT 1 FROM finance.recognized\n",
    );
    write(
        &root,
        "computations/escaping.md",
        "---\ntype: Attested Computation\nruntime: bigquery\ncomputation: ../outside.sql\n---\n",
    );
    let bundle = read_bundle(&root);

    let (_, computation) =
        resolve_computation(&root, concept_named(&bundle, "computations/revenue"))
            .expect("contract");
    match computation {
        ComputationSource::File { path, text } => {
            assert_eq!(path, "references/revenue.sql");
            assert!(text.contains("finance.recognized"));
        }
        other => panic!("expected a file computation, got {other:?}"),
    }

    assert!(matches!(
        resolve_computation(&root, concept_named(&bundle, "computations/escaping")),
        Err(ContractError::UnreadableComputation(_))
    ));

    fs::remove_dir_all(&root).expect("cleanup");
}

#[test]
fn refuses_a_contract_that_is_ambiguous_or_incomplete() {
    let root = scratch("contract");
    // Both forms: which one ran would be a guess.
    write(
        &root,
        "both.md",
        "---\ntype: Attested Computation\nruntime: bigquery\ncomputation: references/revenue.sql\n---\n\n# Computation\n\n```sql\nSELECT 1\n```\n",
    );
    write(&root, "references/revenue.sql", "SELECT 1\n");
    write(
        &root,
        "neither.md",
        "---\ntype: Attested Computation\nruntime: bigquery\n---\n",
    );
    write(
        &root,
        "no-runtime.md",
        "---\ntype: Attested Computation\n---\n\n# Computation\n\n```sql\nSELECT 1\n```\n",
    );
    write(&root, "ordinary.md", "---\ntype: Table\n---\n");
    let bundle = read_bundle(&root);

    let error = |id: &str| resolve_computation(&root, concept_named(&bundle, id)).unwrap_err();
    assert_eq!(error("both"), ContractError::AmbiguousComputation);
    assert_eq!(error("neither"), ContractError::NoComputation);
    assert_eq!(error("no-runtime"), ContractError::MissingRuntime);
    assert_eq!(error("ordinary"), ContractError::NotAComputation);

    fs::remove_dir_all(&root).expect("cleanup");
}

#[test]
fn takes_the_computation_fence_and_not_an_example_in_the_prose() {
    let root = scratch("fence");
    write(
        &root,
        "revenue.md",
        r#"---
type: Attested Computation
runtime: bigquery
---

# Usage

An illustration, not the computation:

```sql
SELECT * FROM anything
```

# Computation

```sql
SELECT SUM(amount) FROM finance.recognized
```
"#,
    );
    let bundle = read_bundle(&root);
    let (_, computation) =
        resolve_computation(&root, concept_named(&bundle, "revenue")).expect("contract");

    assert_eq!(
        computation.text().trim(),
        "SELECT SUM(amount) FROM finance.recognized"
    );

    fs::remove_dir_all(&root).expect("cleanup");
}

#[test]
fn canonicalization_ignores_comments_case_and_whitespace_only() {
    // What it forgives.
    assert_eq!(
        canonicalize("SELECT  a\nFROM   t   -- a note\n"),
        canonicalize("select a from t")
    );
    // What it must not forgive: a different table is a different computation.
    assert_ne!(
        canonicalize("select a from t"),
        canonicalize("select a from u")
    );
}

/// `attest_run` is the entry point both Studio doors use — the reader's manual
/// paste and the agent's submitted receipt — so the verdict cannot depend on
/// who knocked.
mod report {
    use super::*;
    use okf_core::attest::{attest_run, AttestationVerdict};

    fn bundle_with_contract(name: &str) -> (PathBuf, okf_core::Bundle) {
        let root = scratch(name);
        write(&root, "computations/revenue.md", CONTRACT);
        let bundle = read_bundle(&root);
        (root, bundle)
    }

    const GOOD_SQL: &str =
        "SELECT SUM(amount) AS revenue FROM finance.recognized WHERE fiscal_year = 2026";

    /// The distinction the verdict exists for. `attested` is the spec's full
    /// bar and is false here — fidelity needs the runtime — but everything
    /// Studio can check passed, and a reader has to be able to tell that apart
    /// from a forged query. If these two ever collapse into one value, the gate
    /// reports failure for a clean run and stops meaning anything.
    #[test]
    fn a_clean_run_establishes_provenance_without_claiming_full_attestation() {
        let (root, bundle) = bundle_with_contract("report-clean");
        let concept = concept_named(&bundle, "computations/revenue");
        let run = receipt(&[
            ("job_id", "bq:job-1"),
            ("executed_sql", GOOD_SQL),
            ("result", "12345"),
        ]);

        let report = attest_run(&root, concept, &run, "2026-07-01");

        assert_eq!(report.verdict, AttestationVerdict::ProvenanceEstablished);
        assert!(report.provenance_established());
        // Still not full attestation, and the report never says it is.
        assert!(!report.attestation.as_ref().unwrap().attested);
        assert_eq!(report.runtime.as_deref(), Some("bigquery"));
        // The sanctioned text travels with the verdict, so judging a failure
        // does not send the reader looking for what should have run.
        assert!(report.source.is_some());

        fs::remove_dir_all(&root).expect("cleanup");
    }

    /// The failure the type exists to catch: an agent ran its own query.
    #[test]
    fn a_substituted_computation_fails_rather_than_being_unavailable() {
        let (root, bundle) = bundle_with_contract("report-substituted");
        let concept = concept_named(&bundle, "computations/revenue");
        let run = receipt(&[
            ("job_id", "bq:job-2"),
            ("executed_sql", "SELECT SUM(amount) FROM finance.raw_orders"),
            ("result", "99999"),
        ]);

        let report = attest_run(&root, concept, &run, "2026-07-01");

        assert_eq!(report.verdict, AttestationVerdict::Failed);
        assert!(!report.provenance_established());
        assert!(matches!(
            report.attestation.as_ref().unwrap().provenance,
            CheckOutcome::Failed(_)
        ));

        fs::remove_dir_all(&root).expect("cleanup");
    }

    /// A missing declared field is a failure, not a pass with a footnote.
    #[test]
    fn a_receipt_missing_a_declared_field_fails() {
        let (root, bundle) = bundle_with_contract("report-missing");
        let concept = concept_named(&bundle, "computations/revenue");
        let run = receipt(&[("executed_sql", GOOD_SQL)]);

        let report = attest_run(&root, concept, &run, "2026-07-01");

        assert_eq!(report.verdict, AttestationVerdict::Failed);
        let attestation = report.attestation.as_ref().unwrap();
        assert_eq!(attestation.provenance, CheckOutcome::Passed);
        assert_eq!(attestation.missing_receipt_fields, ["job_id", "result"]);

        fs::remove_dir_all(&root).expect("cleanup");
    }

    /// A receipt with nothing to compare is unavailable, and unavailable is not
    /// a pass — this is the case where a gate would silently stop gating.
    #[test]
    fn a_receipt_with_nothing_to_compare_does_not_establish_provenance() {
        let (root, bundle) = bundle_with_contract("report-nothing");
        let concept = concept_named(&bundle, "computations/revenue");
        let run = receipt(&[("job_id", "bq:job-3"), ("result", "12345")]);

        let report = attest_run(&root, concept, &run, "2026-07-01");

        assert_eq!(report.verdict, AttestationVerdict::Failed);
        assert!(matches!(
            report.attestation.as_ref().unwrap().provenance,
            CheckOutcome::Unavailable(_)
        ));

        fs::remove_dir_all(&root).expect("cleanup");
    }

    /// An unreadable contract is a bundle defect and must not read as a failed
    /// run — that would send someone to debug a query that was fine.
    #[test]
    fn an_ordinary_concept_reports_a_contract_error_not_a_failed_run() {
        let root = scratch("report-not-a-computation");
        write(
            &root,
            "concepts/plain.md",
            "---\ntype: Metric\ntitle: Plain\n---\n\n# Plain\n",
        );
        let bundle = read_bundle(&root);
        let concept = concept_named(&bundle, "concepts/plain");

        let report = attest_run(&root, concept, &receipt(&[]), "2026-07-01");

        assert_eq!(report.verdict, AttestationVerdict::ContractUnreadable);
        assert!(report.attestation.is_none());
        assert!(report.contract_error.is_some());
        assert!(!report.provenance_established());

        fs::remove_dir_all(&root).expect("cleanup");
    }
}

/// The worked example in Studio's own docs must actually attest, and the
/// receipt printed in it must be the one that passes.
///
/// Without this the example rots silently: someone edits the `.sql`, the
/// documented receipt stops matching, and the first person to follow the
/// instructions concludes the gate is broken.
mod studio_docs_example {
    use super::*;
    use okf_core::attest::{attest_run, AttestationVerdict};

    const CONCEPT: &str = "reference/attested-computation-example";

    /// Copied verbatim from the `# Checking a run` section of the example.
    const DOCUMENTED_SQL: &str = "SELECT SUM(o.amount_usd) AS recognized_revenue FROM `finance.orders` AS o WHERE o.fiscal_year = 2026 AND (NULL IS NULL OR o.region = NULL) AND o.status = 'recognized'";

    #[test]
    fn the_documented_receipt_passes_against_the_stored_computation() {
        let root = Path::new("../../docs");
        let bundle = read_bundle(root);
        let concept = concept_named(&bundle, CONCEPT);

        let run = receipt(&[
            ("job_id", "bq:job_abc123"),
            ("executed_sql", DOCUMENTED_SQL),
            ("result", "12345"),
        ]);
        let report = attest_run(root, concept, &run, "2026-07-27");

        assert_eq!(
            report.verdict,
            AttestationVerdict::ProvenanceEstablished,
            "the receipt printed in the example must be the one that passes"
        );
        // File-stored, so this also proves the path resolves inside the bundle.
        assert!(matches!(
            report.source,
            Some(ComputationSource::File { .. })
        ));
    }

    #[test]
    fn an_agent_authored_query_against_the_example_fails() {
        let root = Path::new("../../docs");
        let bundle = read_bundle(root);
        let concept = concept_named(&bundle, CONCEPT);

        let run = receipt(&[
            ("job_id", "bq:job_bad"),
            (
                "executed_sql",
                "SELECT SUM(amount_usd) FROM `finance.raw_orders`",
            ),
            ("result", "99999"),
        ]);

        assert_eq!(
            attest_run(root, concept, &run, "2026-07-27").verdict,
            AttestationVerdict::Failed
        );
    }
}
