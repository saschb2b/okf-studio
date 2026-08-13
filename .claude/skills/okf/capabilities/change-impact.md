# Map change impact

Shared rules live in `okf-core`; load its `specification`, `commands`, or `templates` resource only when this task needs them.

## Trigger

Use this capability before renaming, moving, deprecating, or materially changing a concept, field, metric, relationship, or operational instruction.

## Required inputs

- Active bundle fingerprint.
- Stable identity of the proposed change target.
- Proposed semantic or structural change.

## Method

1. Run `okf_health_summary`, retain its exact bundle fingerprint, then read the target and identify its stable identity.
2. Call `okf_retrieve` with the relationship route, then traverse explicit inbound and outbound links needed to verify its paths.
3. Search for textual, schema, formula, and navigation references.
4. Separate observed dependents from inferred consumers.
5. Order required follow-up changes without staging them.

## Artifact contract

Return a `change-impact-map` envelope from the shared templates with `target` and `proposed-change` fields, direct dependents, transitive dependents, textual references, inferred risks, affected indexes, and exact bundle fingerprint.

## Stop conditions

Stop if the target is ambiguous or the bundle changes during traversal. Stop before editing until the user accepts the impact boundary.

## Completion checks

- Explicit links and inferred impact are visibly distinct.
- Operational and navigation dependents are included, not only schemas.
- Stable identity is preserved unless migration is the stated goal.
- No change was staged before the map was complete.

## Worked example

Before renaming `refunded_usd`, include the net-revenue formula and the refund-audit runbook as separate dependents.

## Adversarial example

A text search with no matches does not prove no consumers exist. Report the inspected surfaces and residual uncertainty.
