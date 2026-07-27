//! OKF v0.2 provenance, trust, lifecycle and attested computations, parsed off
//! real files.
//!
//! These go through `parse_bundle` rather than calling the field helpers, because
//! the risk is not the shape of a `Source` — it is whether the tolerant YAML
//! subset reaches a nested `sources:` list at all, and whether the two v0.1
//! fallbacks fire when the v0.2 field is absent.

use okf_core::model::{ConceptStatus, TrustTier};
use okf_core::parse::read_bundle;
use std::fs;
use std::path::{Path, PathBuf};

fn scratch(name: &str) -> PathBuf {
    let root = std::env::temp_dir().join(format!("okf-v02-{name}-{}", std::process::id()));
    let _ = fs::remove_dir_all(&root);
    fs::create_dir_all(&root).expect("create scratch bundle");
    root
}

fn write(root: &Path, rel: &str, body: &str) {
    let path = root.join(rel);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).expect("create parent");
    }
    fs::write(path, body).expect("write concept");
}

#[test]
fn reads_sources_with_their_credibility_signals() {
    let root = scratch("sources");
    write(
        &root,
        "tables/orders.md",
        r#"---
type: Table
title: Orders
sources:
  - id: ga4-schema
    resource: https://example.com/ga4
    title: GA4 BigQuery Export schema
    author: team:ga4-docs
    usage_count: 5000
    last_modified: 2026-05-30
  - resource: all queries in BigQuery project X
usage_window: { from: 2026-06-01, to: 2026-06-30 }
---

The `events_` table is sharded daily.[^ga4-schema]

[^ga4-schema]: GA4 BigQuery Export schema
"#,
    );

    let bundle = read_bundle(&root);
    let concept = &bundle.concepts[0];
    assert_eq!(concept.sources.len(), 2);

    let first = &concept.sources[0];
    assert_eq!(first.id.as_deref(), Some("ga4-schema"));
    assert_eq!(first.author.as_deref(), Some("team:ga4-docs"));
    assert_eq!(first.usage_count, Some(5000));
    assert_eq!(first.last_modified.as_deref(), Some("2026-05-30"));

    // A scope descriptor is a legitimate resource even though nothing can follow it.
    assert_eq!(
        concept.sources[1].resource,
        "all queries in BigQuery project X"
    );

    let window = concept.usage_window.as_ref().expect("usage window");
    assert_eq!(window.from.as_deref(), Some("2026-06-01"));
    assert_eq!(window.to.as_deref(), Some("2026-06-30"));

    // The footnote label is a join key into sources, not prose to parse.
    assert_eq!(
        concept
            .source_by_id("ga4-schema")
            .map(|s| s.resource.as_str()),
        Some("https://example.com/ga4")
    );
    assert!(concept.source_by_id("absent").is_none());

    fs::remove_dir_all(&root).expect("cleanup");
}

#[test]
fn derives_trust_tiers_from_who_confirmed_it() {
    let root = scratch("trust");
    write(
        &root,
        "unverified.md",
        "---\ntype: Table\ngenerated: { by: reference_agent/gemini-2.5-pro, at: 2026-06-20T22:53:05Z }\n---\n",
    );
    write(
        &root,
        "machine.md",
        "---\ntype: Table\nverified:\n  - { by: process:finance-nightly, at: 2026-06-26T02:00:00Z }\n---\n",
    );
    write(
        &root,
        "human.md",
        "---\ntype: Table\nverified:\n  - { by: process:finance-nightly, at: 2026-06-26T02:00:00Z }\n  - { by: human:ahormati, at: 2026-06-25T09:00:00Z }\n---\n",
    );
    // A single verifier MAY be written as a bare mapping, and a consumer MUST
    // treat it as a one-element list.
    write(
        &root,
        "bare.md",
        "---\ntype: Table\nverified: { by: human:ahormati, at: 2026-06-25T09:00:00Z }\n---\n",
    );

    let bundle = read_bundle(&root);
    let tier = |id: &str| {
        bundle
            .concepts
            .iter()
            .find(|concept| concept.id == id)
            .expect("concept")
            .trust_tier()
    };

    assert_eq!(tier("unverified"), TrustTier::Unverified);
    assert_eq!(tier("machine"), TrustTier::MachineConfirmed);
    assert_eq!(tier("human"), TrustTier::HumanReviewed);
    assert_eq!(tier("bare"), TrustTier::HumanReviewed);

    // Ordering is what lets a consumer prefer the more trusted of two concepts.
    assert!(TrustTier::HumanReviewed > TrustTier::MachineConfirmed);
    assert!(TrustTier::MachineConfirmed > TrustTier::Unverified);

    fs::remove_dir_all(&root).expect("cleanup");
}

#[test]
fn falls_back_to_v01_timestamp_and_citations() {
    let root = scratch("v01");
    // A v0.1 concept: `timestamp` instead of `generated`, and provenance in a
    // `# Citations` body section instead of `sources`.
    write(
        &root,
        "legacy.md",
        r#"---
type: Table
title: Legacy
timestamp: 2026-01-15T10:00:00Z
---

Body.

# Citations

- [Revenue recognition policy](https://wiki.example/finance)
- internal interview, 2026-01-10

# Notes

- not a citation
"#,
    );
    write(
        &root,
        "modern.md",
        r#"---
type: Table
title: Modern
timestamp: 2026-01-15T10:00:00Z
generated: { by: reference_agent/gemini-2.5-pro, at: 2026-06-20T22:53:05Z }
sources:
  - resource: https://example.com/authoritative
---

# Citations

- this legacy list must be ignored when sources is present
"#,
    );

    let bundle = read_bundle(&root);
    let concept = |id: &str| {
        bundle
            .concepts
            .iter()
            .find(|c| c.id == id)
            .expect("concept")
    };

    let legacy = concept("legacy");
    assert_eq!(legacy.authored_at(), Some("2026-01-15T10:00:00Z"));
    assert_eq!(legacy.sources.len(), 2);
    assert_eq!(legacy.sources[0].resource, "https://wiki.example/finance");
    assert_eq!(
        legacy.sources[0].title.as_deref(),
        Some("Revenue recognition policy")
    );
    // A citation that is not a link keeps its text as the resource rather than
    // being dropped: it is still a scope descriptor a human can follow.
    assert_eq!(legacy.sources[1].resource, "internal interview, 2026-01-10");
    // The following heading closes the section.
    assert!(!legacy
        .sources
        .iter()
        .any(|source| source.resource.contains("not a citation")));

    // generated.at wins over the legacy timestamp, and declared sources win over
    // the legacy list.
    let modern = concept("modern");
    assert_eq!(modern.authored_at(), Some("2026-06-20T22:53:05Z"));
    assert_eq!(modern.sources.len(), 1);
    assert_eq!(
        modern.sources[0].resource,
        "https://example.com/authoritative"
    );

    fs::remove_dir_all(&root).expect("cleanup");
}

#[test]
fn reads_lifecycle_and_compares_staleness_as_a_date() {
    let root = scratch("lifecycle");
    write(&root, "draft.md", "---\ntype: Table\nstatus: draft\n---\n");
    write(
        &root,
        "deprecated.md",
        "---\ntype: Metric\nstatus: deprecated\n---\n",
    );
    write(
        &root,
        "dated.md",
        "---\ntype: Table\nstale_after: 2026-09-23\n---\n",
    );
    // Absent status means stable, and an unrecognized one is not an error at the
    // model layer — it reads as the default and the validator reports it.
    write(&root, "absent.md", "---\ntype: Table\n---\n");
    write(
        &root,
        "bogus.md",
        "---\ntype: Table\nstatus: retired\n---\n",
    );

    let bundle = read_bundle(&root);
    let concept = |id: &str| {
        bundle
            .concepts
            .iter()
            .find(|c| c.id == id)
            .expect("concept")
    };

    assert_eq!(concept("draft").status, ConceptStatus::Draft);
    assert_eq!(concept("deprecated").status, ConceptStatus::Deprecated);
    assert_eq!(concept("absent").status, ConceptStatus::Stable);
    assert_eq!(concept("bogus").status, ConceptStatus::Stable);

    let dated = concept("dated");
    assert!(!dated.is_stale_on("2026-09-22"));
    // Stale on the day itself, not the day after.
    assert!(dated.is_stale_on("2026-09-23"));
    assert!(dated.is_stale_on("2026-11-01"));
    assert!(!concept("absent").is_stale_on("2099-01-01"));

    // "Still meant to be used" folds both signals together.
    assert!(dated.is_current_on("2026-09-22"));
    assert!(!dated.is_current_on("2026-09-23"));
    assert!(!concept("deprecated").is_current_on("2026-01-01"));

    fs::remove_dir_all(&root).expect("cleanup");
}

#[test]
fn reads_an_attested_computation_contract() {
    let root = scratch("attested");
    write(
        &root,
        "computations/revenue.md",
        r#"---
type: Attested Computation
title: Revenue for fiscal year
description: Recognized revenue for a fiscal year.
status: stable
runtime: bigquery
parameters:
  - { name: year, type: integer, required: true }
  - { name: region, type: string }
computation: references/computations/lib/revenue.sql
executor:
  resource: references/skills/run-on-bq.md
  receipt: [job_id, executed_sql, result]
attester:
  resource: references/attesters/revenue.py
verified: { by: human:ahormati, at: 2026-06-25T09:00:00Z }
stale_after: 2026-09-23
---
"#,
    );
    // The contract belongs to the type. A concept that happens to carry a
    // `runtime` key is not a computation.
    write(
        &root,
        "tables/orders.md",
        "---\ntype: Table\nruntime: bigquery\n---\n",
    );

    let bundle = read_bundle(&root);
    let concept = |id: &str| {
        bundle
            .concepts
            .iter()
            .find(|c| c.id == id)
            .expect("concept")
    };

    let revenue = concept("computations/revenue");
    assert!(revenue.is_attested_computation());
    let contract = revenue.computation.as_ref().expect("contract");
    assert_eq!(contract.runtime, "bigquery");
    assert_eq!(
        contract.computation.as_deref(),
        Some("references/computations/lib/revenue.sql")
    );

    assert_eq!(contract.parameters.len(), 2);
    assert_eq!(contract.parameters[0].name, "year");
    assert_eq!(
        contract.parameters[0].parameter_type.as_deref(),
        Some("integer")
    );
    assert!(contract.parameters[0].required);
    // Absent `required` means optional: treating it as required would refuse
    // runs the contract permits.
    assert!(!contract.parameters[1].required);

    let executor = contract.executor.as_ref().expect("executor");
    assert_eq!(executor.receipt, ["job_id", "executed_sql", "result"]);
    assert_eq!(
        contract
            .attester
            .as_ref()
            .and_then(|a| a.resource.as_deref()),
        Some("references/attesters/revenue.py")
    );

    let orders = concept("tables/orders");
    assert!(!orders.is_attested_computation());
    assert!(orders.computation.is_none());

    fs::remove_dir_all(&root).expect("cleanup");
}
