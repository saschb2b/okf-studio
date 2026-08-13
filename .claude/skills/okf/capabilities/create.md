# Create an OKF bundle plan

Shared rules live in `okf-core`; load its `specification`, `commands`, or `templates` resource only when this task needs them.

## Trigger

Use this capability when the user wants a new bundle or a new bounded knowledge area derived from supplied sources. Do not treat an existing bundle as a writable template unless the user selected it as the destination.

## Required inputs

- Explicit destination boundary.
- Intended audience and questions the bundle must answer.
- Source inventory or a clear statement that sources are not yet available.

## Method

1. Run `okf_health_summary`, retain its exact bundle fingerprint, confirm the destination, and keep examples separate from target facts.
2. Inventory sources, provenance, and unanswered domain questions.
3. Propose stable concept identities, types, and links.
4. Plan the root index and navigation paths.
5. Validate the plan against the shared OKF specification before any staged revision.
6. When the accepted plan becomes concept prose, hand it to `okf-author` and load the shared `writing` resource.

## Artifact contract

Return a `bundle-plan` envelope from the shared templates with `destination` and `scope` fields, proposed concept paths, types, relationships, source inventory, open questions, validation checks, and exact bundle fingerprint. Creation itself must go through a reviewed `staged-revision`.

## Stop conditions

Stop before staging if the destination is ambiguous, outside the active grant, or overlaps a source bundle unexpectedly. Stop when essential domain facts have no source or user decision.

## Completion checks

- The plan has a root index and connected concepts.
- Proposed facts preserve source provenance.
- Missing inputs are questions, not invented content.
- No file was written outside reviewed staging.

## Worked example

Use a commerce bundle only as a structural example for a support-quality bundle. Reuse the pattern of metrics and runbooks, never the commerce facts.

## Adversarial example

Reject “create it somewhere convenient on my computer.” Ask the user to choose a bounded destination rather than selecting an OS path silently.
