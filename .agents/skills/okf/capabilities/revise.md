# Revise OKF writing without changing meaning

Shared rules live in `okf-core`. Load its `writing` resource before editing and its `specification` or `templates` resource only when structure or conformance is in scope.

## Trigger

Use this capability when an existing concept contains the needed knowledge but its prose is indirect, repetitive, vague, or poorly shaped. Use enrichment when the user wants new facts, decisions, citations, or relationships.

## Required inputs

- Active bundle fingerprint and exact target concept paths.
- Reader job and requested writing improvement.
- Current concept bodies, frontmatter, citations, links, and relevant house-style examples.

## Method

1. Run `okf_health_summary`, retain its exact bundle fingerprint, and read only the target concepts plus required local examples.
2. Load `okf-core` `writing`; inventory every claim, qualifier, citation, link, formula, code block, and exact term.
3. Revise structure and prose without adding or removing meaning.
4. Reconcile the before and after claim inventories and classify each claim.
5. Return a `writing-revision` artifact, then validate and stage only the accepted concept paths.

## Artifact contract

Return a `writing-revision` envelope with reader job, purpose, target paths, findings addressed, source references, and a complete claim ledger. A style-only artifact may contain only `unchanged` and `reworded` claims. Include the exact pre-change bundle fingerprint.

## Stop conditions

Stop and route to enrichment when the requested edit needs a new fact, removes a supported claim, resolves a contradiction, or changes a citation target. Stop when the bundle language or house style cannot be determined and the user has not chosen one.

## Completion checks

- Required facts, numbers, qualifiers, citations, links, formulas, code, and domain terms remain.
- The opening answers the reader job directly.
- The claim ledger accounts for every before and after claim.
- The proposal remains unapplied until review.

## Worked example

Replace a generic feature introduction with the concrete review boundary and the gap it closes while preserving the exact statement that Apply remains a separate user action.

## Adversarial example

The original says a timeout is usually 30 seconds. Do not rewrite it as a 30-second guarantee. The qualifier carries operational meaning.
