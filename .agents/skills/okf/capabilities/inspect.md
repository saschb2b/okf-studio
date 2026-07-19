# Inspect an OKF bundle

Shared rules live in `okf-core`; load its `specification`, `commands`, or `templates` resource only when this task needs them.

## Trigger

Use this capability to answer questions about an existing bundle, explain a concept, or trace a relationship. Do not use it to propose edits.

## Required inputs

- Active bundle identity and fingerprint.
- The user question.
- An active concept or bounded search terms when available.

## Method

1. Run `okf_health_summary`, retain its exact bundle fingerprint, then inventory metadata before reading bodies.
2. Call `okf_retrieve` when the answer needs selected evidence or a route decision; use `okf_search` for a simple concept locator.
3. Read only the concepts needed to answer.
4. Traverse explicit links when the question asks about lineage, dependencies, or procedures.
5. Separate observed facts from inference and name missing evidence.

## Artifact contract

Return a `health-report` envelope from the shared templates containing a `health-summary` field, the answer, inspected concept paths, traversed links, evidence gaps, and exact bundle fingerprint. A short answer may remain prose when a work surface would add no value.

## Stop conditions

Stop when the answer is supported by the bounded bundle evidence. Stop early and ask for clarification when multiple concepts match and choosing one would change the answer.

## Completion checks

- Every factual claim points to an inspected concept or explicit link.
- No external source is implied unless it was supplied and labelled.
- No write or staged-write tool was used.

## Worked example

For “How is net revenue calculated?”, read the metric, traverse its input link, and name the linked mismatch runbook. Report the formula and path, not an invented owner.

## Adversarial example

If two revenue definitions conflict, do not choose the newer-looking one as authoritative. Report the conflict and the missing precedence evidence.
