# Audit OKF knowledge health

Shared rules live in `okf-core`; load its `specification`, `commands`, or `templates` resource only when this task needs them.

## Trigger

Use this capability for a read-only review of conformance, navigation, connectivity, provenance, freshness signals, duplication, or coverage hints.

## Required inputs

- Active bundle fingerprint.
- Audit scope and selected health categories.
- Deterministic validator or health findings when available.

## Method

1. Run `okf_health_summary` before interpretation and retain its bundle fingerprint.
2. Filter by the requested categories, then inspect selected findings with `okf_health_finding`.
3. Use `okf_health_affected` for bounded concept metadata and read only the concepts needed to verify meaning.
4. Group findings by rule, evidence, severity, and repairability.
5. Distinguish OKF conformance errors from heuristics and prioritize without modifying the bundle.

## Artifact contract

Return a `health-report` envelope from the shared templates with a `health-summary` field, rule IDs, evidence fields, affected concept paths, severity, fact-or-heuristic classification, repairability, and exact bundle fingerprint.

## Stop conditions

Stop if the bundle changes during the audit and refresh the fingerprint. Do not continue from stale findings. Stop before proposing speculative repairs as facts.

## Completion checks

- Every finding has a stable rule version, reproducible evidence, and a suppression fingerprint.
- Unknown concept types are tolerated unless the hard OKF contract is broken.
- Broken links and disconnected concepts are reported separately.
- The audit performs no write.

## Worked example

Report a missing dashboard target and an unlinked retention note as separate findings, then explain which one is deterministic and which depends on navigation policy.

## Adversarial example

Do not label an old `generated.at` as a conformance error. It is a freshness signal unless a bundle-specific policy says otherwise. `stale_after` is the one freshness fact the bundle asserts about itself, so report a passed `stale_after` as the producer's own statement rather than as your judgment. Report trust tiers as they are recorded (absent `verified` means unverified, not untrustworthy) and never add a `verified` event to resolve a finding.
