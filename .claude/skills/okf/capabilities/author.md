# Author an OKF concept

Shared rules live in `okf-core`. Load its `writing` resource before drafting and its `specification`, `commands`, or `templates` resource only when the task needs them.

## Trigger

Use this capability when accepted evidence or a reviewed bundle plan is ready to become one or more new concept documents. Use `okf-create` first when the destination, concept map, or required sources are still unresolved.

## Required inputs

- Active bundle fingerprint and explicit destination concept paths.
- Reader job for each concept.
- Accepted source set or user decisions for every factual claim.
- Required relationships, navigation placement, and write scope.

## Method

1. Run `okf_health_summary`, retain its exact bundle fingerprint, and read the destination neighborhood.
2. Load `okf-core` `writing`; inventory the required claims, qualifiers, citations, links, and exact terms.
3. Select the information shape and draft the smallest complete concept set.
4. Reconcile every final claim against the inventory and label unsupported gaps as questions.
5. Return a `writing-revision` artifact, then validate and stage the proposed files for review.

## Artifact contract

Return a `writing-revision` envelope with reader job, purpose, destination paths, source references, and a claim ledger. New claims are `added` and require evidence or an explicit user-decision source. Include the exact pre-change bundle fingerprint.

## Stop conditions

Stop before drafting when the destination, reader job, or factual authority is unclear. Stop before staging when a required claim has no source, a destination path leaves the active grant, or the concept set would duplicate existing knowledge without an identity decision.

## Completion checks

- Each concept answers its reader job from the opening.
- Every factual claim maps to evidence or a user decision.
- Frontmatter, navigation, and relationships are included.
- The proposal remains unapplied until review.

## Worked example

Turn an accepted refund-audit plan and cited operational evidence into a runbook that states the mismatch condition first, keeps the settlement qualifier, links the revenue metric, and stages both the concept and index entry.

## Adversarial example

A source calls a workflow "industry leading" without comparative evidence. Do not copy that claim into the concept. Keep the observable workflow facts and omit the promotion.
