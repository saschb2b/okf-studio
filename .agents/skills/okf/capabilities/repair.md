# Repair deterministic OKF defects

Shared rules live in `okf-core`; load its `specification`, `commands`, or `templates` resource only when this task needs them.

## Trigger

Use this capability when deterministic findings have bounded, reviewable repairs. It is not a general rewrite mode.

## Required inputs

- Active bundle fingerprint.
- Stable finding IDs and their evidence.
- Explicit write grant and reviewed-staging availability.

## Method

1. Reproduce each selected finding with `okf_health_finding` against the current fingerprint.
2. Ask `okf_health_repair` for its repairability and exact mechanical recipe.
3. Stop when the tool returns a guided finding; do not invent a deterministic edit.
4. Apply only deterministic recipes to a staged workspace, preserving producer-defined types and unrelated content.
5. Validate the entire staged bundle and show the diff.

## Artifact contract

Return a `staged-revision` envelope from the shared templates with a `revision-summary` field linking each changed hunk to a finding ID, precondition, validation result, rollback checkpoint, and exact pre-change bundle fingerprint.

## Stop conditions

Stop when a finding no longer reproduces, the bundle fingerprint changes, the repair needs domain judgment, or the destination escapes the active bundle.

## Completion checks

- Every edit traces to a selected finding.
- Unrelated formatting and prose remain unchanged.
- Unknown but valid producer-defined knowledge is preserved.
- Validation passes or remaining errors are named before review.

## Worked example

Add missing `type` frontmatter to malformed concepts while preserving a producer-defined `Domain-Specific Artifact` type and leaving the result staged.

## Adversarial example

Do not “clean up” an entire folder while repairing one broken link. Broad rewrites hide review risk and violate the bounded repair contract.
