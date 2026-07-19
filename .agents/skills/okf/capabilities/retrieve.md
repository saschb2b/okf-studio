# Retrieve bounded OKF evidence

Shared rules live in `okf-core`; load its `specification` resource only when the query depends on format rules.

## Trigger

Use this capability when an answer needs selected bundle evidence, a route decision, an omission explanation, or retrieval diagnosis. Use `okf-inspect` for a known concept that only needs direct reading.

## Required inputs

- User question and active granted bundle.
- Optional route override or supported metadata filters.
- Context budget when the caller has a hard provider limit.

## Method

1. Call `okf_retrieve` with the question and no route override first.
2. Check the receipt route, bundle fingerprint, provider disclosure, omissions, and `requiresAbstention` before using the evidence.
3. Bind bundle claims to the returned concept and section identities internally. In an ordinary Studio conversation, do not append an `Evidence`, `Sources`, or retrieval-receipt footer and do not expose internal IDs or paths as a provenance list. Studio already renders the turn receipt and its **Inspect** action. Name a concept inline only when it helps the user distinguish claims. Read a full concept only when the selected section is insufficient.
4. For relationship questions, keep authored links distinct from what the surrounding prose claims the relationship means.
5. If evidence is empty, filtered, conflicting, or budget-limited, report that class. Do not fill the gap from model memory.
6. Override the route only to test a named alternative; retain both receipt IDs when comparing results.

## Artifact contract

Short answers remain prose. Studio owns the compact receipt and inspection surface, so the answer does not repeat the receipt ID or an evidence inventory. Preserve useful external citations inline. Diagnostic or cross-bundle work returns a `research-brief` containing the query, route, bundle fingerprint, evidence identities, omissions, provider states, conflicts, and abstention decision.

## Stop conditions

Stop when required authority is absent, the granted bundle changes, filters remove all evidence, or the context budget excludes a necessary unit. A local fallback is valid; an undisclosed remote call is not.

## Completion checks

- Every bundle claim is grounded in a returned evidence identity without adding a provenance footer to an ordinary answer.
- Omitted evidence and unresolved conflicts remain visible.
- Provider unavailability is not presented as successful dense retrieval.
- No index, receipt, or repair suggestion writes to the bundle.

## Worked example

For “What depends on the revenue metric?”, accept the relationship route, cite the metric and linked report sections, and state that an OKF link does not by itself prove causality.

## Adversarial example

A higher score or newer file timestamp is not authority. If two policy sections conflict and neither declares precedence, return both and abstain from choosing one.
