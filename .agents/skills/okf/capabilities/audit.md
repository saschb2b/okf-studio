# Audit OKF knowledge health

Shared rules live in `okf-core`; load its `specification`, `commands`, or `templates` resource only when this task needs them.

## Trigger

Use this capability for a read-only review of conformance, navigation, connectivity, provenance, freshness signals, duplication, or coverage hints.

## Required inputs

- Active bundle fingerprint.
- Audit scope and selected health categories.
- Deterministic validator or health findings when available.

## Method

1. Run deterministic inventory and validation before interpretation.
2. Traverse navigation and graph edges within the requested scope.
3. Group findings by rule, evidence, severity, and repairability.
4. Distinguish OKF conformance errors from heuristics.
5. Prioritize findings without modifying the bundle.

## Artifact contract

Return a `health-report` containing rule IDs, evidence fields, affected concept IDs, severity, fact-or-heuristic classification, repairability, and bundle fingerprint.

## Stop conditions

Stop if the bundle changes during the audit and refresh the fingerprint. Do not continue from stale findings. Stop before proposing speculative repairs as facts.

## Completion checks

- Every finding has reproducible evidence.
- Unknown concept types are tolerated unless the hard OKF contract is broken.
- Broken links and disconnected concepts are reported separately.
- The audit performs no write.

## Worked example

Report a missing dashboard target and an unlinked retention note as separate findings, then explain which one is deterministic and which depends on navigation policy.

## Adversarial example

Do not label an old timestamp as a conformance error. It is a freshness signal unless a bundle-specific policy says otherwise.
