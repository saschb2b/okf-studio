---
type: Playbook
title: "Tauri Stinky: Boundary Pass"
description: "A sweep-level audit of the IPC contract, commands, invokes, events, types, and capabilities checked against each other across the Rust/TS boundary."
tags: [tauri, rust, typescript, ipc, audit]
timestamp: 2026-07-15T00:00:00Z
---
# Tauri Stinky: Boundary Pass

A sweep-level audit of the IPC contract. The per-file catalogs judge each side alone; this pass checks the two sides against each other, where the worst Tauri bugs live, because nothing type-checks across the boundary unless codegen (category 51) makes it. Run it in repo-sweep and `src-tauri`-plus-frontend scope, after the per-file pass. Skip it for single-file or fragment scope and say so plainly.

Findings fold into the main report under a `Boundary contract` heading, using the closest catalog category (36, 38, 45, 46, 51, 52, 53).

## Build the four inventories

Search, do not eyeball. Collect each side into a table before comparing.

1. **Commands.** Grep `#[tauri::command]` for definitions and `generate_handler!` for registrations. Note per command, name, async or sync, argument names and types, return type, `rename_all` attribute if any.
2. **Invokes.** Grep `invoke(` (and any project wrapper like a boundary module) on the frontend. Note per call, command string, argument keys, expected TS type, whether the rejection is handled.
3. **Events.** Grep `emit(`/`emit_to(` and `Channel<` on the Rust side; `listen(`/`once(` and channel `onmessage` on the frontend. Note event names and payload types on both sides.
4. **Capabilities.** Read every file in `src-tauri/capabilities/` plus the `csp` and `withGlobalTauri` entries in `tauri.conf.json`. Note windows, permissions, and scopes.

## Cross-checks

Run each check both directions; the orphans are as telling as the mismatches.

- **Command parity.** Every invoke string has a defined AND registered command (defined-but-unregistered fails only at runtime); every registered command has at least one caller, an uncalled command is dead IPC surface and dead capability exposure, delete or justify it.
- **Argument parity.** For each invoke/command pair, keys match after Tauri's case conversion (snake_case Rust becomes camelCase JS unless `rename_all = "snake_case"`); optionality agrees (a TS optional against a non-`Option` Rust arg fails at runtime). Category 38.
- **Type parity.** For each command's return and payload structs, compare the Rust definition (with its serde attributes) field by field against the TS interface. Sample the biggest and the most-edited structs first; drift concentrates where churn is. Category 51. If a codegen step exists, this check collapses to "is it wired into CI".
- **Error contract.** What does the frontend actually do with a rejected invoke, match on a kind, match on a message substring (fragile, category 36), or nothing (category 53)? Grep the catch blocks for string matching on error messages, each hit is a reword away from a silent behavior change.
- **Event parity.** Every emitted event name has a listener and vice versa; payload shapes agree; every `listen` has a reachable unlisten path (category 45). High-frequency emits belong on channels (category 44).
- **Capability parity.** Every granted permission maps to an API the frontend actually uses, grants with no call sites are pure attack surface (category 46); every plugin JS binding in `package.json` has its plugin registered in the builder and its permission granted, or it fails at runtime.
- **Mock parity.** If the boundary module ships browser/test mocks, spot-check that mock behavior (especially error cases) matches what the Rust side really returns, a mock that diverges quietly rots every test above it.

## Don't flag

- The one boundary module containing all the invoke strings; that is the pattern working (category 52), not stringly sprawl.
- Commands kept for a documented upcoming feature, when marked as such.
- Deliberately narrowed TS views of larger Rust structs, when a comment says the narrowing is intentional.
- Capability grants required by a plugin's internal implementation even without direct frontend calls (check the plugin docs before calling it unused).

## Output

Report each confirmed mismatch as a normal finding with its catalog category, naming both sides (`src-tauri/src/lib.rs:412` vs `src/ipc.ts:988`). End the pass with a one-line contract summary, counts of commands, invokes, events, and grants, and how many of each are orphaned or mismatched. If the scope could not see one side, write "Boundary contract not checked (one side out of scope)" instead of implying it is clean.
