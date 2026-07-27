//! The OKF v0.2 validation rules.
//!
//! Every one is a warning: v0.2 says `type` is the only always-required key, so a
//! bundle that declares none of the new families is still conformant. What these
//! pin down is that a field which is *present and wrong* gets reported — that is
//! the case a consumer silently mis-reads — and that a v0.1 bundle stays quiet.

use okf_core::model::IssueLevel;
use okf_core::parse::read_bundle;
use std::fs;
use std::path::{Path, PathBuf};

fn scratch(name: &str) -> PathBuf {
    let root = std::env::temp_dir().join(format!("okf-v02v-{name}-{}", std::process::id()));
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

fn messages(root: &Path) -> Vec<String> {
    read_bundle(root)
        .issues
        .into_iter()
        .map(|issue| issue.message)
        .collect()
}

fn assert_reports(messages: &[String], needle: &str) {
    assert!(
        messages.iter().any(|message| message.contains(needle)),
        "expected a warning containing {needle:?}\ngot: {messages:#?}"
    );
}

#[test]
fn reports_provenance_and_trust_fields_that_are_present_but_unreadable() {
    let root = scratch("provenance");
    write(
        &root,
        "a.md",
        // `generated` without its required `by`, and a verification event
        // likewise. Both parse to nothing, which is indistinguishable from
        // declaring no provenance at all unless it is reported.
        "---\ntype: Table\ngenerated: { at: 2026-06-20T22:53:05Z }\nverified:\n  - { at: 2026-06-25T09:00:00Z }\n---\n",
    );
    write(
        &root,
        "b.md",
        // A source entry with no `resource`, and a usage_count with no window.
        "---\ntype: Table\nsources:\n  - title: Nameless\n  - resource: https://example.com/x\n    usage_count: 12\n---\n",
    );

    let found = messages(&root);
    assert_reports(&found, "'generated' has no 'by' actor");
    assert_reports(&found, "1 of 1 'verified' entries have no 'by' actor");
    assert_reports(&found, "1 of 2 'sources' entries have no 'resource'");
    assert_reports(&found, "usage_count with no usage_window");

    fs::remove_dir_all(&root).expect("cleanup");
}

#[test]
fn reports_an_actor_that_matches_none_of_the_three_forms() {
    let root = scratch("actors");
    write(
        &root,
        "bad.md",
        // A bare name carries no version, and trust classification keys off the
        // `human:` prefix — so an off-convention actor silently lowers the tier.
        "---\ntype: Table\ngenerated: { by: gemini, at: 2026-06-20T22:53:05Z }\n---\n",
    );
    write(
        &root,
        "good.md",
        "---\ntype: Table\ngenerated: { by: reference_agent/gemini-2.5-pro, at: 2026-06-20T22:53:05Z }\nverified:\n  - { by: human:ahormati, at: 2026-06-25T09:00:00Z }\n  - { by: process:finance-nightly, at: 2026-06-26T02:00:00Z }\nsources:\n  - resource: https://example.com/x\n    author: team/docs\n---\n",
    );

    let found = messages(&root);
    assert_reports(&found, "generated.by \"gemini\" is not an actor");
    // All three conventional forms pass.
    assert!(
        !found.iter().any(|message| message.starts_with("good.md")),
        "conventional actors should be quiet, got: {found:#?}"
    );

    fs::remove_dir_all(&root).expect("cleanup");
}

#[test]
fn reports_lifecycle_values_that_cannot_be_used() {
    let root = scratch("lifecycle");
    write(&root, "status.md", "---\ntype: Table\nstatus: retired\n---\n");
    // ODSF v0.1 defined status as stable/experimental/deprecated; OKF v0.2 then
    // claimed the key, and ODSF v0.2 resolves it by making OKF's set normative
    // while keeping `experimental` as a profile extension. Studio reads ODSF
    // tokens, so warning here would nag every design-system component that
    // legitimately uses it.
    write(
        &root,
        "experimental.md",
        "---\ntype: Component\nstatus: experimental\n---\n",
    );
    // A relative TTL is exactly what the spec replaced with an absolute date; it
    // is never comparable, so the concept never goes stale and the field reads as
    // a promise it cannot keep.
    write(&root, "stale.md", "---\ntype: Table\nstale_after: 90d\n---\n");

    let found = messages(&root);
    assert_reports(&found, "status \"retired\" is not draft, stable, deprecated");
    assert!(
        !found.iter().any(|message| message.starts_with("experimental.md")),
        "ODSF's experimental is a legitimate value, got: {found:#?}"
    );
    assert_reports(&found, "stale_after \"90d\" is not an absolute YYYY-MM-DD date");

    fs::remove_dir_all(&root).expect("cleanup");
}

#[test]
fn reports_a_footnote_that_attributes_a_claim_to_nothing() {
    let root = scratch("footnotes");
    write(
        &root,
        "a.md",
        r#"---
type: Table
sources:
  - id: known
    resource: https://example.com/known
---

Attributed.[^known]

Looks attributed, is not.[^missing]

[^known]: Known source
"#,
    );

    let found = messages(&root);
    assert_reports(&found, "footnote [^missing] matches no source id");
    // The label that resolves is not reported, and neither is the definition line.
    assert!(
        !found.iter().any(|message| message.contains("[^known]")),
        "a resolving footnote should be quiet, got: {found:#?}"
    );

    fs::remove_dir_all(&root).expect("cleanup");
}

#[test]
fn reports_a_computation_contract_that_cannot_gate_anything() {
    let root = scratch("contract");
    write(
        &root,
        "no-runtime.md",
        "---\ntype: Attested Computation\n---\n\n# Computation\n\n```sql\nSELECT 1\n```\n",
    );
    write(
        &root,
        "both.md",
        "---\ntype: Attested Computation\nruntime: bigquery\ncomputation: refs/a.sql\n---\n\n# Computation\n\n```sql\nSELECT 1\n```\n",
    );
    write(
        &root,
        "neither.md",
        "---\ntype: Attested Computation\nruntime: bigquery\n---\n",
    );
    write(
        &root,
        "loose.md",
        "---\ntype: Attested Computation\nruntime: bigquery\nparameters:\n  - { type: integer }\n  - { name: year }\n---\n\n# Computation\n\n```sql\nSELECT @year\n```\n",
    );

    let found = messages(&root);
    assert_reports(&found, "must declare 'runtime'");
    assert_reports(&found, "supplied both inline and by path");
    assert_reports(&found, "inline under '# Computation' or by a 'computation' path, and has neither");
    // Without a receipt shape there is no evidence, and without an attester
    // nothing produces a verdict — either way the contract gates nothing.
    assert_reports(&found, "no executor receipt fields are declared");
    assert_reports(&found, "no attester resource is declared");
    assert_reports(&found, "1 of 2 parameters have no 'name'");
    assert_reports(&found, "parameter \"year\" declares no type");

    fs::remove_dir_all(&root).expect("cleanup");
}

#[test]
fn a_v01_bundle_and_a_complete_v02_bundle_are_both_quiet() {
    let root = scratch("quiet");
    // v0.1: a timestamp and a body citations list, no v0.2 field in sight. It
    // stays consumable, so it must not be nagged into migrating.
    write(
        &root,
        "legacy.md",
        "---\ntype: Table\ntitle: Legacy\ntimestamp: 2026-01-15T10:00:00Z\n---\n\n# Citations\n\n- [Policy](https://wiki.example/policy)\n",
    );
    // v0.2, fully declared.
    write(
        &root,
        "modern.md",
        r#"---
type: Attested Computation
title: Revenue
runtime: bigquery
status: stable
stale_after: 2026-09-23
parameters:
  - { name: year, type: integer, required: true }
executor:
  resource: references/run-on-bq.md
  receipt: [job_id, executed_sql, result]
attester:
  resource: references/attesters/revenue.py
generated: { by: reference_agent/gemini-2.5-pro, at: 2026-06-20T22:53:05Z }
verified: { by: human:ahormati, at: 2026-06-25T09:00:00Z }
sources:
  - id: rev-policy
    resource: https://wiki.example/finance
    title: Revenue recognition policy
    author: human:ahormati
    usage_count: 40
usage_window: { from: 2026-06-01, to: 2026-06-30 }
---

Recognized revenue.[^rev-policy]

[^rev-policy]: Revenue recognition policy

# Computation

```sql
SELECT SUM(amount) FROM finance.recognized WHERE fiscal_year = @year
```
"#,
    );

    let issues = read_bundle(&root).issues;
    assert!(
        issues.is_empty(),
        "neither a v0.1 nor a complete v0.2 bundle should report anything, got: {:#?}",
        issues.iter().map(|i| &i.message).collect::<Vec<_>>()
    );

    fs::remove_dir_all(&root).expect("cleanup");
}

#[test]
fn studio_own_docs_gain_no_v02_warnings() {
    // Studio's docs are a real v0.1 bundle. Adding v0.2 checks must not turn its
    // validation panel into a wall of advice about fields it never declared.
    let root = Path::new("../../docs");
    let bundle = read_bundle(root);
    let v02_noise = bundle
        .issues
        .iter()
        .filter(|issue| issue.level == IssueLevel::Warning)
        .filter(|issue| {
            let m = &issue.message;
            m.contains("is not an actor")
                || m.contains("has no 'by' actor")
                || m.contains("no 'resource'")
                || m.contains("usage_window")
                || m.contains("matches no source id")
                || m.contains("stale_after")
                || m.contains("is not draft, stable, or deprecated")
                || m.contains("Attested Computation")
        })
        .map(|issue| issue.message.clone())
        .collect::<Vec<_>>();

    assert!(
        v02_noise.is_empty(),
        "v0.2 checks should be silent on a v0.1 bundle, got: {v02_noise:#?}"
    );
}
