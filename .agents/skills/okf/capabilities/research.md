# Research with cited evidence

Shared rules live in `okf-core`; load its `specification`, `commands`, or `templates` resource only when this task needs them.

## Trigger

Use this capability when bundle knowledge must be checked, expanded, or reconciled with supplied sources or an explicitly approved network fetch.

## Required inputs

- Research question and active bundle fingerprint.
- Allowed source set and network scope.
- Citation requirements and freshness threshold.

## Method

1. Inventory relevant bundle claims before consulting external evidence.
2. Search only the approved source scope and prefer primary sources.
3. Record source identity, retrieval time, and the claim each source supports.
4. Compare evidence with bundle claims and expose conflicts or uncertainty.
5. Produce a brief before proposing any enrichment.

## Artifact contract

Return a `research-brief` with question, bundle claims, source inventory, claim-level citations, conflicts, freshness notes, conclusions, and unresolved questions.

## Stop conditions

Stop when required evidence is inaccessible, citations cannot be retained, sources disagree without an authority rule, or the request expands beyond approved network scope.

## Completion checks

- Every external factual claim has a source reference.
- Retrieved evidence is distinguished from user-provided and bundle evidence.
- Stale or secondary evidence is labelled.
- The brief does not silently mutate the bundle.

## Worked example

For two revenue definitions, quote the substantive includes-versus-excludes distinction, flag old evidence, and state that ownership remains unresolved.

## Adversarial example

Example URLs and search snippets are not fetched evidence. Never cite them as if their contents were inspected.
