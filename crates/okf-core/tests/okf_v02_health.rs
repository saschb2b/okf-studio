//! Knowledge-health findings over the OKF v0.2 fields.
//!
//! Two of these pin bug fixes rather than new behaviour. The existing provenance
//! and freshness rules read `resource`, body citations and `timestamp` — none of
//! which a fully-declared v0.2 concept has to use — so a migrated bundle was
//! reported as undated and unsourced precisely because it had adopted the newer,
//! better fields.

use okf_core::health::{analyze, HealthSeverity};
use okf_core::parse::read_bundle;
use std::fs;
use std::path::{Path, PathBuf};

fn scratch(name: &str) -> PathBuf {
    let root = std::env::temp_dir().join(format!("okf-v02h-{name}-{}", std::process::id()));
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

fn rules_for(root: &Path, concept_id: &str) -> Vec<String> {
    let bundle = read_bundle(root);
    analyze(&bundle).expect("health report")
        .findings
        .into_iter()
        .filter(|finding| finding.affected_concept_ids.iter().any(|id| id == concept_id))
        .map(|finding| finding.rule_id.to_string())
        .collect()
}

#[test]
fn a_v02_concept_is_not_reported_as_undated_or_unsourced() {
    let root = scratch("migrated");
    // Everything declared, the v0.2 way: dated by generated.at, sourced by
    // `sources`. No `timestamp`, no `resource`, no body citations — and nothing
    // missing.
    write(
        &root,
        "tables/orders.md",
        r#"---
type: Table
title: Orders
generated: { by: reference_agent/gemini-2.5-pro, at: 2026-06-20T22:53:05Z }
sources:
  - id: schema
    resource: https://example.com/schema
    title: Order schema
---

One row per order.[^schema]

[^schema]: Order schema
"#,
    );

    let rules = rules_for(&root, "tables/orders");
    assert!(
        !rules.iter().any(|rule| rule == "okf.freshness.missing-timestamp"),
        "generated.at is a date; reading timestamp alone reported every migrated concept as undated: {rules:?}"
    );
    assert!(
        !rules.iter().any(|rule| rule == "okf.provenance.no-source-signal"),
        "declared sources are the spec's own source signal: {rules:?}"
    );

    fs::remove_dir_all(&root).expect("cleanup");
}

#[test]
fn a_concept_with_no_date_at_all_is_still_reported() {
    let root = scratch("undated");
    write(&root, "a.md", "---\ntype: Table\ntitle: Undated\nsources:\n  - resource: https://example.com/x\n---\n");

    let rules = rules_for(&root, "a");
    assert!(rules.iter().any(|rule| rule == "okf.freshness.missing-timestamp"), "{rules:?}");

    fs::remove_dir_all(&root).expect("cleanup");
}

#[test]
fn reports_a_concept_past_its_own_staleness_date() {
    let root = scratch("stale");
    // Long past, so this does not depend on when the suite runs.
    write(
        &root,
        "old.md",
        "---\ntype: Table\ntitle: Old\ntimestamp: 2020-01-01T00:00:00Z\nstale_after: 2020-06-01\nsources:\n  - resource: https://example.com/x\n---\n",
    );
    // Far future, so it is not stale on any plausible run date.
    write(
        &root,
        "fresh.md",
        "---\ntype: Table\ntitle: Fresh\ntimestamp: 2026-01-01T00:00:00Z\nstale_after: 2999-01-01\nsources:\n  - resource: https://example.com/x\n---\n",
    );

    let bundle = read_bundle(&root);
    let report = analyze(&bundle).expect("health report");
    let stale = report
        .findings
        .iter()
        .filter(|finding| finding.rule_id == "okf.freshness.stale")
        .collect::<Vec<_>>();

    assert_eq!(stale.len(), 1, "only the past-dated concept is stale");
    assert!(stale[0].affected_concept_ids.iter().any(|id| id == "old"));
    // A declared date and a calendar comparison: no judgement, so a warning
    // rather than an advisory heuristic.
    assert_eq!(stale[0].severity, HealthSeverity::Warning);

    fs::remove_dir_all(&root).expect("cleanup");
}

#[test]
fn reports_a_current_concept_that_links_to_deprecated_knowledge() {
    let root = scratch("deprecated");
    write(
        &root,
        "current.md",
        "---\ntype: Table\ntitle: Current\ntimestamp: 2026-01-01T00:00:00Z\nsources:\n  - resource: https://example.com/x\n---\n\nSee [legacy](/legacy.md).\n",
    );
    write(
        &root,
        "legacy.md",
        "---\ntype: Metric\ntitle: Legacy\nstatus: deprecated\ntimestamp: 2026-01-01T00:00:00Z\nsources:\n  - resource: https://example.com/x\n---\n",
    );
    // A deprecated concept linking to another is not the case worth surfacing:
    // history pointing at history is how deprecation is supposed to work.
    write(
        &root,
        "also-retired.md",
        "---\ntype: Metric\ntitle: Also retired\nstatus: deprecated\ntimestamp: 2026-01-01T00:00:00Z\nsources:\n  - resource: https://example.com/x\n---\n\nSee [legacy](/legacy.md).\n",
    );

    let bundle = read_bundle(&root);
    let report = analyze(&bundle).expect("health report");
    let linking = report
        .findings
        .iter()
        .filter(|finding| finding.rule_id == "okf.freshness.links-deprecated")
        .collect::<Vec<_>>();

    assert_eq!(linking.len(), 1, "only the current concept's link is reported");
    assert!(linking[0].affected_concept_ids.iter().any(|id| id == "current"));
    // The retired target is named too, because repairing this means deciding what
    // the link should point at.
    assert!(linking[0].affected_concept_ids.iter().any(|id| id == "legacy"));

    fs::remove_dir_all(&root).expect("cleanup");
}
