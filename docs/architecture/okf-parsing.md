---
type: Reference
title: OKF Parsing
description: How a bundle root is turned into concepts, resolved links, backlinks, and an index tree.
tags: [architecture, parsing, links]
generated: { by: claude/unrecorded, at: 2026-07-23T20:30:00Z }
---

# Pipeline

For each [detected bundle root](bundle-detection.md), the [Rust core](tech-stack.md) produces the [data model](data-model.md):

1. **Enumerate** non-reserved `.md` files, and each one is a concept. The parser handles reserved filenames (`index.md`, `log.md`) separately. The root [`.okfignore`](../features/ignore-rules.md) matcher removes excluded files before parsing while retaining children restored by a later negation.
2. **Split frontmatter / body.** Parse the leading `---` YAML block (a tolerant subset: scalars, quoted strings, `[a, b]` / block lists, and **indentation-nested maps and lists**). The parser promotes concept keys according to the concept model. The root `index.md` separately promotes only `okf_version` and `odsf_version`. Every other parsed root field enters `Bundle.extra`, even when the concept model recognizes the same name. Scalars, nested objects, and arrays therefore survive IPC and agent inventory without changing conformance. The parser tolerates missing or malformed frontmatter. Only a present-but-typeless concept is an [error](../features/validation.md).
3. **Concept ID = path − `.md`,** relative to the bundle root. `tables/orders.md` becomes `tables/orders`.
4. **Extract links** with a CommonMark parser, classify, and **resolve**. Inline, full-reference, collapsed-reference, shortcut-reference, autolink, title, angle-destination, balanced-parenthesis, escaped-punctuation, and footnote-definition forms follow the same parser rules. Link-shaped text inside code does not create an edge.
   - Percent-decode the path before scheme, absolute-path, traversal, extension, and target checks. Keep the authored href for display and diagnostics.
   - Bundle-absolute (`/tables/x.md`) resolves relative to the bundle root.
   - Relative (`x.md`, `../d/x.md`) resolves from the concept's directory, normalizing `.` and `..`.
   - Strip a trailing `#anchor`, drop the `.md`, yielding a target Concept ID.
   - External (`http(s)://`, `mailto:`) stays an outbound web link rather than a graph edge.
   - Malformed percent sequences remain literal and continue through normal target lookup rather than stopping bundle parsing.
5. **Build the graph.** An intra-bundle link whose target Concept ID exists becomes a directed edge. The parser keeps a link to a **non-existent** target for display but creates **no edge**. The parser tolerates broken links.
6. **Backlinks.** Invert the edge set so each concept knows who [cites it](../features/concept-reader.md).
7. **Index tree.** Parse each `index.md` into sections and links for the [navigation](../features/navigation.md) sidebar. Synthesize one for any directory lacking an `index.md`.
8. **Log.** Parse `log.md` (if present) into dated entries for the log view.

# Compatibility report

After parsing, the same pure core can derive a bounded compatibility report without changing the bundle. Each finding carries a stable rule ID, parser/link/index/extension category, exact file, level, and basis. OKF conformance errors and warnings retain their validator meaning. Portability advice, such as replacing a resolved bundle-absolute link with a relative target, remains advisory. Preserved root and concept producer fields are informational and include no repair.

A safe normalization names both the authored target and its relative replacement. The core exposes a repair function that accepts only supported relative-link declarations and matches them back to parser-confirmed inline-link source ranges. It replaces destination bytes in descending source order, so it never changes identical text in prose, code, titles, and reference definitions. The report still names reference-style destinations, but the repair function does not touch them. The native host passes the resulting complete file through [reviewed staging](../features/compatibility-clinic.md#reviewed-normalization) before Apply.

# Attested computations

An OKF v0.2 `type: Attested Computation` concept exists for one purpose. A consumer can verify that a reported number came from the blessed computation, not from an agent writing plausible SQL. Studio does the part of that it can do honestly, and reports the rest as unavailable rather than as passed.

It **resolves** the computation from an inline fence under `# Computation`, or from a containment-checked `computation` path. It refuses a contract carrying both, because which one ran would be a guess. It looks for the fence under that heading rather than taking the body's first fence, since a concept may show an example query in its prose.

It **checks the receipt's shape** against the fields `executor.receipt` declares, because an attester cannot inspect evidence a run never returned.

It **checks provenance**: the executed text against the stored computation, canonicalized to ignore comments, repeated whitespace and case. This is the check that catches agent-authored SQL. It needs no database and no code execution, which is why it belongs in a reader.

For a stored computation with parameter holes, Studio wildcards those holes before the comparison, because binding semantics follow the runtime. Studio compares a shape rather than pretending to know how a runtime binds. The limit is deliberate. A rewrite that only reorders or renames will pass, so this is a provenance check and not a proof of semantic equivalence.

It does **not execute** the executor or the attester. A reader should not run arbitrary code out of a bundle, and the spec puts the executor outside the bundle for the same reason. It does **not check fidelity** (re-reading the authoritative result by job id, which only the runtime can do) and reports that as `Unavailable`, never `Passed`. A run with an unavailable check is not attested. Collapsing those two is how a gate silently stops gating.

A stale definition still attests cleanly. `verified` says the definition matches policy. Attestation says one run produced its values correctly. They answer different questions, so staleness warns and does not fail.

## What Studio can claim

`Attestation::attested` is the spec's full bar, provenance **and** fidelity. It is always false, because fidelity needs the executor's runtime. That is honest and useless to render. A perfect provenance match would look exactly like a forged one, and users stop reading a badge that never turns green. So `AttestationReport::verdict` states what Studio actually established: `provenance-established`, `failed`, or `contract-unreadable`. Every surface renders that verdict instead. The unchecked half stays visible rather than folded into a tick, and Studio prints the limit on a pass as well as a failure.

A contract that cannot be read is a bundle defect and reads as one, not as a failed run. Telling someone their query failed when the contract was never readable sends them to debug the wrong thing.

## Two doors, one verdict

Both call `attest_run`, so the answer cannot depend on who knocked.

The **reader's dialog** takes a pasted receipt. It is a tool for someone who already holds one. Studio runs nothing, so today every receipt comes from elsewhere.

The **agent panel** is the gate. `agent_receipt.rs` validates an `okf-receipt` fence in a turn, the third instance of the pattern `agent_artifact` and `agent_critic` already run. The verdict renders inside the turn, next to the number. This is where it belongs. The failure the type exists to prevent is an agent reporting a figure from a query it wrote itself, and the agent makes that claim here. Security research is consistent that readers ignore a passive indicator and heed one that interrupts the task. A badge on a concept page nobody consults mid-answer would be the ineffective shape.

The agent supplies **only its receipt**. Studio reads the contract it checks that receipt against from the bundle, because an agent that could supply both sides could always make them agree. Studio refuses a receipt naming a concept the bundle does not have, rather than treating it as a contract of the agent's own making.

Studio still renders the agent's prose on a failure. Withholding it would hide the evidence a reader needs to judge the failure and make a false negative far more costly. What changes is that the number arrives already labelled.

# Tolerance contract

Per the [spec](../reference/okf-spec-summary.md), the parser never throws on: missing optional fields, unknown `type`, unknown extra frontmatter keys (preserved as-is), broken links, or missing indexes. It also reads a v0.1 bundle without complaint. `timestamp` still answers "when was this written" when `generated` is absent. The parser reads a legacy `# Citations` section as `sources`, and invents no credibility signals for entries that carry none. It records issues for [Validation](../features/validation.md) and keeps going.

This whole pipeline runs in the core, off the UI thread, and parses lazily per bundle. See [Performance and Scale](performance.md) for the parsing-cost and incremental-reparse strategy.
