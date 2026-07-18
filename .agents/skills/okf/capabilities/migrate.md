# Plan an OKF specification migration

Shared rules live in `okf-core`; load its `specification`, `commands`, or `templates` resource only when this task needs them.

## Trigger

Use this capability for a versioned schema, convention, layout, or identity migration affecting many concepts. Small deterministic defects belong to repair.

## Required inputs

- Source and target specification versions or conventions.
- Active bundle fingerprint and inventory.
- Identity, compatibility, rollback, and downtime constraints.

## Method

1. Run `okf_health_summary`, retain its exact bundle fingerprint, then establish source-version evidence and target rules.
2. Inventory affected concepts without loading every body.
3. Define identity-preserving transformations and explicit exceptions.
4. Plan bounded batches, checkpoints, validation, and parity measures.
5. Rehearse on a copy or staged workspace before any apply action.
6. Load the shared `writing` resource only for concept prose changed by the migration, not for mechanical identity updates.

## Artifact contract

Return a `migration-plan` envelope from the shared templates with `source-version`, `target-version`, and `rollback` fields, affected population, identity map, batch plan, preflight, validation and parity checks, exceptions, context budget, and exact bundle fingerprint.

## Stop conditions

Stop when target rules are unavailable, stable identities cannot be mapped, the requested destination is outside the active grant, or rollback cannot be defined.

## Completion checks

- Stable concept identities and links have an explicit preservation rule.
- Large bundles use bounded inventory and batches.
- Preflight, post-migration parity, and rollback are testable.
- The plan does not imply that all bodies fit in one prompt.

## Worked example

For 10,000 concepts, derive affected sets from metadata and graph indexes, migrate bounded batches, and compare counts, identities, links, and validation at each checkpoint.

## Adversarial example

Do not accept “move everything to the latest format” without a named target version and compatibility contract.
