---
name: tauri-stinky
description: Detect Rust and Tauri maintainability smells across the backend crate, the IPC boundary, and the app shell, explain the cost of each, and propose a fix with a source link. Covers Rust discipline (error handling and panics, ownership and clones, type design, module structure, async correctness, overgeneration and dead code, unsafe and lint hygiene, testing) and the Tauri layer (command design, managed state, events vs channels, capabilities and security, IPC contract and type codegen, config and build footprint), plus a cross-boundary contract audit and a mechanical gate stack (fmt, clippy, test, audit, deny, machete). Use when reviewing or writing Rust code or a Tauri app, auditing src-tauri, setting up quality gates or CI lints for Rust, or asked to sniff, smell-check, lint, or clean up a Rust or Tauri codebase, crate, command, or pasted snippet. Defers React component and hook smells to react-stinky and color literals to theme-colors.
tags: [desktop, rust, tauri, review]
date: 2026-07-15
---

# Tauri Stinky

A holistic code-smell detector and quality gate for Rust and Tauri. It exists as a counterweight, agents trained mostly on frontend code write Rust confidently and at volume, and the volume is where the smells hide. It finds the patterns that make a crate, a command, or the IPC boundary hard to read, reason about, and trust, explains the cost of each, and proposes a concrete fix. The full catalogs with detection signals, fixes, exceptions, and sources are in [rust-catalog.md](./references/rust-catalog.md) and [tauri-catalog.md](./references/tauri-catalog.md); read the relevant one before running a scan.

It defers neighboring concerns to sibling skills so it does not duplicate them: React component, hook, and TypeScript smells on the frontend half to `react-stinky`, and color literals to `theme-colors`. If those are not installed, note the finding in one line and move on. Everything about Rust discipline, the Tauri shell, and the boundary between them is in scope.

Targets Tauri v2. On a v1 project, say so and adapt the Tauri-layer advice rather than prescribing v2 config verbatim.

## What it sniffs for

Thirteen pillars, 57 categories. Detection signals, fixes, and sources live in the two catalogs.

Rust discipline ([rust-catalog.md](./references/rust-catalog.md)):

1. **Error handling and panics.** `unwrap` in production paths, `Result<T, String>` and message-substring matching, swallowed results, context-free errors, panic as control flow, catch-all match arms.
2. **Ownership and allocation.** Clones that appease the borrow checker, `&String` params, needless collects, the `Arc<Mutex<T>>` reflex, index loops.
3. **Type design.** Stringly-typed domains, bool blindness, interchangeable primitive ids, representable impossible states, leaky constructors.
4. **Modules, API, and dependencies.** God modules, `pub` sprawl, version drift, a dependency for a function.
5. **Async correctness.** Blocking calls on the runtime, guards held across `.await`, detached tasks that swallow errors, `block_on` bridges, needless `async`.
6. **Overgeneration and slop** (the counterweight pillar). Dead code silenced instead of deleted, speculative traits and layers, reinvented std, comment noise, defensive theater, verbose happy paths.
7. **Unsafe, lints, and tests.** Unjustified `unsafe`, blanket lint suppression, untested pure cores and unguarded boundary logic.

The Tauri layer ([tauri-catalog.md](./references/tauri-catalog.md)):

8. **Command design.** Fat commands, stringly error boundaries, blocking sync commands on the main thread, argument case mismatches, jumbo JSON payloads.
9. **Managed state.** Global-state hacks around `manage`, unmanaged-state panics, the wrong mutex flavor.
10. **Events and channels.** Events as RPC, events as firehose where channels belong, listener leaks.
11. **Security and capabilities.** Over-broad capability grants, unvalidated paths and URLs from the webview, disabled CSP, secrets in the webview, authorization decided in JS.
12. **IPC contract.** Hand-duplicated Rust/TS types with no codegen, stringly `invoke` sprawl, unhandled rejections.
13. **Config, build, and footprint.** Dev identifiers shipped, debug bits in release, bloated release profiles, a broken main/lib entrypoint split.

## Scope modes

| Mode | Trigger | What to scan |
| --- | --- | --- |
| Repo sweep | "smell-check the app" | `src-tauri/**/*.rs`, `tauri.conf.json`, `capabilities/`, `Cargo.toml`, plus the frontend boundary module and every `invoke`/`listen` call site. Skip `target/`, generated code, and `#[cfg(test)]` bodies for production-only categories. |
| Crate or folder scan | directories named | Same, scoped to those directories. |
| File scan | specific files named | Read each fully; check every function, type, command, and config block. |
| Fragment sniff | a pasted function or snippet | Check only that surface. State what you assumed about anything off-screen. |
| Gate setup | "add quality gates", "set up clippy/CI" | Skip the scan; apply [gates.md](./references/gates.md) to the project's toolchain and report what each gate will start catching. |

Repo-sweep and boundary-inclusive scopes additionally run the [boundary pass](./references/boundary-pass.md), the cross-check of commands, invokes, events, types, and capabilities against each other that per-file scans cannot see. Narrower scopes cannot, so say the boundary contract was not checked rather than implying it is clean.

## Workflow per target

1. Establish the stack first, Tauri major version, async runtime, plugin list, and whether type codegen exists. Two minutes here prevents advice the project already outgrew.
2. Walk each file against the catalog pillars in scope (1 to 7 for any Rust, 8 to 13 for the Tauri layer).
3. Run the matching "Don't flag" line before reporting. If it applies, suppress the finding.
4. Rate the smell (see ratings below).
5. Emit a finding with location, the cost, and a before-to-after fix.
6. In sweep scope, run the [boundary pass](./references/boundary-pass.md) after the per-file pass and fold its findings in.
7. When asked for gates, or when findings cluster on categories a linter catches mechanically, propose the [gate stack](./references/gates.md) so the class of smell stays fixed instead of the instance.
8. End with a summary count. If nothing survives the guard, say it smells fresh.

## Stink ratings

- **Rancid.** A bug, a freeze, a panic path, or a security hole. Fix now. (An `unwrap` a user input can reach, a sync command doing network IO on the main thread, a mutex guard across `.await`, a `$HOME/**` capability scope, a path from the webview used without containment, `csp: null`, a secret in the JS bundle.)
- **Funky.** A genuine maintainability or trust drag, not yet a bug. Should fix. (Stringly errors the frontend substring-matches, hand-mirrored boundary types, a god module, a trait with one impl, dead code behind `#[allow]`, events used as a stream firehose.)
- **Whiff.** Minor or stylistic. Optional. (A `&String` parameter, a needless mid-chain collect, comment noise, a default release profile before anyone downloads the app.)

## Don't flag (the guard that keeps this useful)

The catalogs carry a per-smell exception line. These cut across all of them. Honor them or this skill becomes a nuisance.

- Test code plays by test rules. `unwrap`, `expect`, and panics are fine inside `#[cfg(test)]` and integration tests.
- `.lock().unwrap_or_else(|e| e.into_inner())` is poison recovery, not an unwrap smell. `std::sync::Mutex` is the right default for Tauri managed state.
- Sync-fs-behind-`spawn_blocking` is a legitimate architecture; do not demand `tokio::fs` where `std::fs` is consistently wrapped.
- One boundary module owning every `invoke` string is the pattern working, not stringly sprawl. Browser/test mocks beside it are a feature.
- A tightly enumerated capability file is the goal state, not a finding, even when it is a single file.
- Stable sentinel error strings used consistently as a de facto kind system get one upgrade-path note, not a finding per command.
- DTOs mirroring an external wire format keep their shape; flag the missing conversion to a strict internal type, not the DTO.
- Respect a consistent local convention over the catalog default. One finding per real problem, smallest fix that removes the smell.
- Defer frontend component and hook smells to `react-stinky`, color literals to `theme-colors`.

## Output format

```
Tauri Stinky report, <scope>

src-tauri/src/export.rs
  [Rancid] sync-command-blocking (command design), line 41
    Smell: #[tauri::command] fn export_bundle does zip compression synchronously.
    Cost: runs on the main thread; the window freezes for the whole export.
    Fix: make it async and wrap the compression in spawn_blocking, returning progress
      over a Channel.
    Source: Tauri v2 async commands (https://v2.tauri.app/develop/calling-rust/#async-commands)

  [Funky] stringly-errors (error handling), line 58
    Smell: returns Result<PathBuf, String> via map_err(|e| e.to_string()).
    Cost: the frontend can only substring-match; any reword silently breaks handling.
    Fix: one thiserror enum deriving Serialize with a stable kind field; map once at
      the boundary.
    Source: Tauri v2 error handling (https://v2.tauri.app/develop/calling-rust/#error-handling)

Boundary contract: 52 commands, 49 invoked, 3 orphaned; 5 events, all paired.

Summary: 1 rancid, 1 funky across 1 file, 3 orphaned commands.
```

When the scope is clean, say so plainly: "Smells fresh. No Rust or Tauri smells found in `<scope>`."

## Source

The Rust categories are sourced to the Rust Book, the Rust API Guidelines, Clippy lint docs, and the Tokio docs; the Tauri categories to the Tauri v2 documentation (develop, security, and config references). Each entry in [rust-catalog.md](./references/rust-catalog.md) and [tauri-catalog.md](./references/tauri-catalog.md) carries its own link.
