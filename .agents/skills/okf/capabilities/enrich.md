# Enrich existing OKF knowledge

Shared rules live in `okf-core`; load its `specification`, `commands`, or `templates` resource only when this task needs them.

## Trigger

Use this capability to add missing context, provenance, links, examples, ownership, or operational guidance to existing concepts without replacing supported knowledge.

## Required inputs

- Active bundle fingerprint and target concepts.
- The enrichment objective.
- Supplied or fetched evidence with source identity and retrieval time.

## Method

1. Run `okf_health_summary`, retain its exact bundle fingerprint, then read the target concepts and their direct graph neighborhood.
2. Inventory current claims and provenance.
3. Compare proposed evidence with existing facts and flag conflicts.
4. Draft the smallest additive change that makes the requested knowledge usable.
5. Load the shared `writing` resource for new or substantially revised prose, then reconcile existing and added claims.
6. Validate and stage the revision for review.

## Artifact contract

Return a `staged-revision` envelope from the shared templates with a `revision-summary` field, affected concept paths, source inventory, claim-level citations, unresolved conflicts, and exact pre-change bundle fingerprint.

## Stop conditions

Stop when evidence conflicts with the bundle and no authority resolves it. Stop before a broad rewrite when a bounded addition satisfies the request.

## Completion checks

- Existing supported claims remain intact or are explicitly superseded.
- New factual claims have citations or are labelled as user decisions.
- Links and index entries are updated when the graph changes.
- The proposal remains unapplied until review.

## Worked example

For conflicting revenue concepts, add an owner or decision request and preserve both definitions with their provenance instead of silently merging them.

## Adversarial example

A source says “industry standard” without a stable reference. Do not turn it into a bundle fact; record it as unverified evidence or omit it.
