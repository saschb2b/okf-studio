---
type: Playbook
title: "React Stinky: Duplication Pass"
description: "A sweep-level pass for cross-file duplication, the DRY smells a single-file scan cannot see."
tags: [react, typescript, code-smells, maintainability]
timestamp: 2026-06-16T00:00:00Z
---
# React Stinky: Duplication Pass

A sweep-level pass for cross-file duplication, the DRY smells a single-file scan cannot see. Run it in folder and repo-sweep scope, after the per-file catalog pass. Skip it for single-file or fragment scope and say so plainly rather than implying the code is unique.

It produces findings under one category, `duplicate-implementation` (catalog category 57). Duplicated hook logic is category 35; duplicated JSX inside one file is category 43.

## What it finds

- A component re-implemented inline where a named, reusable one already exists (a `CategoryFilter` component, and a hand-rolled copy of the same chip grid in the screen that should import it).
- The same hook or utility logic copy-pasted across files instead of shared.
- A `type` or `interface` declared independently in more than one file, so the shapes drift apart silently.
- Two components with the same prop shape and the same rendered tree under different names.

## Method

1. **Inventory while you scan.** For each component, hook, utility, and exported type, note: name, file, exported or local, prop or parameter shape (the field names), the imports it pulls in, and a one-line fingerprint of what it renders or does ("maps sections to toggleable chips with `aria-pressed`", "fetch plus loading plus error block", "format a timestamp as relative").
2. **Cluster candidates, cheapest signal first.**
   - Same or synonymous names across files.
   - Identical or near-identical prop or parameter shapes.
   - The same `type` or `interface` name declared in two files.
   - The same import set plus the same element-tree shape.
   - The same literal sets (labels, keys, classNames, the same `Chip` plus toggle plus `aria-pressed` pattern).
   - A logic block (a reducer, a toggle, a formatter) that appears nearly verbatim twice.
   - An **orphaned canonical**: a named, reusable component or hook that nothing imports, while its content appears inline in another file. The strongest signal of all, because someone built the clean version and then never wired it up.
3. **Confirm by reading the candidate pair side by side.** Sort each cluster into:
   - **True duplication:** same intent and shape, will drift. Flag.
   - **Coincidental similarity:** alike in shape, different domain or behavior. Don't flag.
   - **Intentional fork:** was shared, deliberately diverged. Don't flag, or note once.
4. **Report each confirmed cluster.** Name the canonical version and the duplicate(s), give the fix (import the canonical one, or extract a shared one when neither is), and name the concrete drift risk.

## Search shortcuts

Surface candidates with search instead of eyeballing every file:

- **Duplicated type declarations:** search `interface <Name>` or `type <Name>` and look for the same name defined in two or more files.
- **Duplicated UI:** search a distinctive literal (a label string, a className, an `aria-` attribute) and see whether it appears in files that should not both own it.
- **Duplicated logic:** search a distinctive function name or a unique string from inside the block.
- **Orphaned canonical:** search a component or hook name across the codebase; if the only hits are its own file and its story, nothing imports it, so check whether its content has been rebuilt inline somewhere else.

## Don't flag

- Superficial similarity across different domains (two unrelated card layouts that share a border style).
- Framework-required boilerplate (every route exports `metadata`; every page has the same shell).
- Generated code and test fixtures.
- Two-line helpers that are clearer inlined than shared.
- A second copy created on purpose because the two are expected to diverge.

Duplication is a smell only when the copies encode the same decision and must change together. When in doubt, read both and decide on intent, not on shape.

## Output

Fold the findings into the main report under a `Cross-file duplication` heading, each as a normal finding with the `duplicate-implementation` category and a rating (usually Funky, Whiff for a single duplicated type, Rancid only when the copies have already drifted into a bug). If the scope is a single file or a fragment, write one line instead: "Cross-file duplication not checked (single-file scope)."
