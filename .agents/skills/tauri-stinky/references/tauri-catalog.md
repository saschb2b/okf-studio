---
type: Smell Catalog
title: "Tauri Stinky: Tauri Catalog"
description: "The Tauri-layer smell catalog, pillars 8 to 13, categories 35 to 57."
tags: [tauri, rust, ipc, security, code-smells]
timestamp: 2026-07-15T00:00:00Z
---
# Tauri Stinky: Tauri Catalog

The Tauri-layer catalog, pillars 8 to 13 (categories 35 to 57), continuing from [rust-catalog.md](./rust-catalog.md). Everything here targets Tauri v2; when the project is still on v1, say so and adapt (allowlist instead of capabilities, `tauri://` event API differences) rather than prescribing v2 config verbatim.

Pillars:
8. Command design (35 to 39)
9. Managed state and lifecycle (40 to 42)
10. Events, channels, and streaming (43 to 45)
11. Security and capabilities (46 to 50)
12. IPC contract and codegen (51 to 53)
13. Config, build, and footprint (54 to 57)

# Pillar 8. Command design

## 35. fat-command [Funky]
- **Sniff for:** `#[tauri::command]` functions holding domain logic, filesystem work, and serialization inline; logic that cannot be unit-tested without a webview; business rules living only inside the command body.
- **Fix:** the command is a thin adapter, parse args, call a plain function in a domain module, map the error once. The domain function gets the unit tests; `lib.rs` stays a command registry.
- **Don't flag:** genuinely trivial commands (a getter over managed state); a facade that already delegates in two lines.
- **Source:** Tauri v2, Calling Rust from the Frontend (https://v2.tauri.app/develop/calling-rust/).

## 36. string-error-boundary [Funky]
- **Sniff for:** every command returning `Result<T, String>` with `.map_err(|e| e.to_string())`; the frontend branching on message substrings to distinguish "access denied" from "not found", which silently breaks on any reword.
- **Fix:** one command-error enum deriving `thiserror::Error` and `serde::Serialize` (serialize a stable `kind` plus a display message), so the frontend matches on kind and the strings stay free to change. Adopt it at the boundary first; interior code can migrate gradually.
- **Don't flag:** a codebase that consistently uses stable sentinel constants (a fixed `ACCESS_DENIED` string) as its de facto kind system, note the upgrade path once instead of flagging every command.
- **Source:** Tauri v2, error handling in commands (https://v2.tauri.app/develop/calling-rust/#error-handling).

## 37. sync-command-blocking [Rancid]
- **Sniff for:** a non-async command doing long work (network, big file IO, heavy CPU). Sync commands execute on the main thread and freeze the UI for their duration; the app reads as hung.
- **Fix:** make the command `async fn` (Tauri runs it on a separate pool) and push blocking work into `spawn_blocking` per category 21. Reserve sync commands for sub-millisecond reads.
- **Don't flag:** sync commands that only read a value from managed state; deliberate main-thread work (some webview and window APIs require it).
- **Source:** Tauri v2, async commands (https://v2.tauri.app/develop/calling-rust/#async-commands).

## 38. arg-case-mismatch [Rancid when the call fails at runtime]
- **Sniff for:** `invoke("cmd", { snake_case_key: ... })` against a default command, or camelCase keys against a command marked `rename_all = "snake_case"`; Tauri converts Rust snake_case args to camelCase on the JS side by default, and a mismatch fails only at runtime with "invalid args".
- **Fix:** pick one convention project-wide and encode it once, either accept the default camelCase in every wrapper or put `#[tauri::command(rename_all = "snake_case")]` on every command. A single typed wrapper layer (category 52) makes the choice unmissable.
- **Don't flag:** a consistent project-wide choice, either convention is fine; only the mix is the smell.
- **Source:** Tauri v2, passing arguments (https://v2.tauri.app/develop/calling-rust/#passing-arguments).

## 39. jumbo-ipc-payloads [Funky]
- **Sniff for:** file bytes or images base64-encoded through `invoke` JSON; a whole app-state object re-fetched on a poll timer; multi-megabyte strings crossing the boundary per keystroke.
- **Fix:** `tauri::ipc::Response` for raw bytes; a `Channel` for streams and progress; the asset protocol for media the webview should load; write large artifacts to disk and pass the path.
- **Don't flag:** payloads that are simply the data (a rendered markdown string, a reasonable list); one-off transfers where the simplicity is worth it.
- **Source:** Tauri v2, IPC and large payloads (https://v2.tauri.app/concept/inter-process-communication/).

# Pillar 9. Managed state and lifecycle

## 40. global-state-hack [Funky]
- **Sniff for:** `static mut`, `lazy_static`/global `OnceCell` holding app state instead of `app.manage(...)`; `AppHandle` threaded everywhere as a god object to reach state indirectly.
- **Fix:** `Manager::manage` in `setup`, `State<'_, T>` parameters in commands. State the framework injects is state tests can construct.
- **Don't flag:** true process constants (`LazyLock` regex, config parsed once); `AppHandle` where the API genuinely needs it (emitting events, paths, spawning).
- **Source:** Tauri v2, State Management (https://v2.tauri.app/develop/state-management/).

## 41. unmanaged-state-panic [Rancid]
- **Sniff for:** `State<T>` requested for a type never passed to `manage` (panics on first invoke, not at startup); two calls to `manage` with the same type, where the second is silently ignored (`manage` returns `false`); two conceptually different values managed as the same bare type (`String`).
- **Fix:** manage everything once in `setup`, next to the builder so the pairing is reviewable; wrap distinct values in newtype structs so the type system keys them apart.
- **Don't flag:** state managed conditionally behind the same `#[cfg]` as its commands.
- **Source:** Tauri v2, `Manager::manage` (https://docs.rs/tauri/latest/tauri/trait.Manager.html#method.manage).

## 42. wrong-mutex-flavor [Funky]
- **Sniff for:** `tokio::sync::Mutex` wrapping plain data in managed state, forcing `.await` on every access for nothing; or its inverse, a std guard held across an await inside an async command (category 22 with the Tauri hat on).
- **Fix:** `std::sync::Mutex` is the right default for managed state, lock, use, drop. Recover poison with `unwrap_or_else(|e| e.into_inner())` if crashing on a prior panic is not the policy. Go async-mutex only when a lock must genuinely span an await.
- **Don't flag:** the poison-recovery `unwrap_or_else` pattern (it is not an unwrap smell); an async mutex with a documented held-across-await reason.
- **Source:** Tauri v2, State Management, mutability section (https://v2.tauri.app/develop/state-management/#mutability).

# Pillar 10. Events, channels, and streaming

## 43. event-rpc [Funky]
- **Sniff for:** an emit-then-listen round trip standing in for request/response (frontend emits, Rust listens, Rust emits back); or the inverse, the frontend polling a command on an interval for state the backend knows changed.
- **Fix:** request/response is a command, one `invoke`, one typed result. Backend-initiated change is an event or a channel. Each direction has its tool.
- **Don't flag:** a poll where the backend genuinely cannot know (watching an external resource without a watcher API).
- **Source:** Tauri v2, Calling the Frontend from Rust (https://v2.tauri.app/develop/calling-frontend/).

## 44. events-as-firehose [Funky]
- **Sniff for:** high-frequency or ordered streams (per-token agent output, download progress, log tails) pushed through `emit`; events are broadcast, JSON-serialized, and not built for throughput, so streams stutter and interleave.
- **Fix:** `tauri::ipc::Channel` passed as a command argument for anything high-frequency, ordered, or per-request; keep `emit` for low-frequency broadcast notifications (state changed, file updated).
- **Don't flag:** coarse lifecycle events at human frequency, that is exactly what events are for.
- **Source:** Tauri v2, Channels (https://v2.tauri.app/develop/calling-frontend/#channels).

## 45. listener-leaks [Funky, Rancid under React StrictMode]
- **Sniff for:** `listen(...)` in a component or module whose returned unlisten promise is dropped; listeners registered per render or per mount with no cleanup, so handlers stack and fire N times (React 18+ StrictMode double-mount makes this bite in dev immediately).
- **Fix:** keep the unlisten function and call it in the effect cleanup (`useEffect` returning `() => { unlisten() }`, awaiting the promise correctly); or register once at module level for app-lifetime listeners and say so.
- **Don't flag:** app-lifetime listeners registered once at startup on purpose.
- **Source:** Tauri v2 JS API, event.listen (https://v2.tauri.app/reference/javascript/api/namespaceevent/#listen).

# Pillar 11. Security and capabilities

## 46. over-broad-capabilities [Rancid]
- **Sniff for:** capability files granting wide filesystem scopes (`$HOME/**`, `**`), broad shell execution, or `default` permission sets "just in case"; one capability granting everything to every window, including ones that render remote content; plugins granted to the webview when Rust already mediates that authority.
- **Fix:** least privilege per window, enumerate the specific permissions used, scope filesystem access to app directories, and keep high-authority operations (fs, network, process) Rust-mediated behind validated commands rather than granted to the webview at all. The strongest posture is a capability file whose description can honestly say what is deliberately absent.
- **Don't flag:** a tightly enumerated single capability file in a single-window-class app; `core:` window controls needed by a frameless window (drag, minimize, close).
- **Source:** Tauri v2, Capabilities (https://v2.tauri.app/security/capabilities/).

## 47. unvalidated-external-input [Rancid]
- **Sniff for:** paths from the frontend used directly in fs operations (traversal via `..` or absolute paths); opener/shell invoked with a frontend-supplied string; URLs fetched by Rust on the frontend's word with no allowlist. Anything running in the webview can call any command the capability allows, so command arguments are untrusted input.
- **Fix:** canonicalize paths and enforce containment against an approved base (`starts_with` after canonicalization, with symlink-escape tests); allowlist schemes and hosts for anything opened or fetched; validate in Rust, never only in JS.
- **Don't flag:** paths that already pass through a canonicalize-and-contain grant layer; user-picked paths from the dialog plugin used for exactly the picked operation.
- **Source:** Tauri v2, security best practices (https://v2.tauri.app/security/); OWASP path traversal (https://owasp.org/www-community/attacks/Path_Traversal).

## 48. csp-disabled [Rancid]
- **Sniff for:** `"csp": null` or missing in `tauri.conf.json`; wildcard sources; `unsafe-inline`/`unsafe-eval` added to make something work; `dangerousDisableAssetCspModification` set without a documented reason.
- **Fix:** a strict CSP (`default-src 'self'` as the base), widen one directive at a time with a comment for each exception; Tauri injects nonces for its own scripts, so its injection keeps working under a strict policy.
- **Don't flag:** a specific, commented widening a dependency genuinely requires (a WASM `unsafe-eval` with the culprit named).
- **Source:** Tauri v2, Content Security Policy (https://v2.tauri.app/security/csp/).

## 49. secrets-in-the-webview [Rancid]
- **Sniff for:** API keys in frontend env vars (`VITE_*` ships in the bundle), tokens parked in `localStorage`, secrets committed in `tauri.conf.json`; anything the webview holds is readable by anything that gets script execution in it.
- **Fix:** secrets live on the Rust side (OS keychain via a keyring crate or stronghold, or an encrypted store), and the frontend asks Rust to use the secret, never to have it.
- **Don't flag:** genuinely public values (an anonymous telemetry write key documented as public); the updater minisign public key, which is designed to ship.
- **Source:** Tauri v2, security overview (https://v2.tauri.app/security/).

## 50. trusting-the-webview [Funky, Rancid on a destructive command]
- **Sniff for:** authorization decisions made in JS (the UI hides the button, the command performs the action unchecked); destructive commands (delete, overwrite, execute) assuming only "my UI" calls them; permission prompts rendered by the frontend with the enforcement also in the frontend.
- **Fix:** the Rust side owns enforcement, check grants and invariants inside the command regardless of what the UI promised; treat the webview as a compromised-until-proven renderer for anything with authority.
- **Don't flag:** UI-side checks that are pure UX layered on top of Rust-side enforcement.
- **Source:** Tauri v2, security model (https://v2.tauri.app/security/).

# Pillar 12. IPC contract and codegen

## 51. duplicated-boundary-types [Funky]
- **Sniff for:** TypeScript interfaces hand-mirroring `#[serde(rename_all = "camelCase")]` Rust structs, dozens of pairs maintained by eye; a field renamed on one side and silently `undefined` on the other; drift the only guard against which is runtime behavior.
- **Fix:** generate one side from the other, `tauri-specta` (commands, events, and types) or `ts-rs` (types) emit the TypeScript from the Rust definitions, so drift becomes a compile error. Short of codegen, concentrate every mirrored type in one file per side and add a CI check that fails when the Rust structs change without the TS file changing.
- **Don't flag:** a handful of small stable types where codegen machinery outweighs the drift risk; deliberately narrowed frontend views of larger Rust structs (say so in a comment).
- **Source:** tauri-specta (https://github.com/specta-rs/tauri-specta); ts-rs (https://docs.rs/ts-rs).

## 52. stringly-invoke [Funky]
- **Sniff for:** raw `invoke("command_name", {...})` calls scattered through components; a typo'd command name that fails only at runtime; the same command invoked with differently-shaped args from two places.
- **Fix:** one boundary module owns every invoke (components import typed functions, never the string); generated wrappers via tauri-specta where category 51 is being fixed anyway. A single boundary file also gives the browser/test mock a natural home.
- **Don't flag:** the one boundary module itself containing the strings, that is the pattern working; a couple of directly-invoking outliers worth folding in rather than reporting per file.
- **Source:** Tauri v2, Calling Rust from the Frontend (https://v2.tauri.app/develop/calling-rust/).

## 53. unhandled-invoke-rejection [Rancid when the UI strands]
- **Sniff for:** `await invoke(...)` with no catch on a user-triggered path, the error lands in the console and the UI stays stuck in its loading state; catch blocks that only `console.error` with no user-visible result; double-submit while the first invoke is in flight.
- **Fix:** every user-facing invoke path resolves to a UI state (success, typed error from category 36, or retry); disable or guard the trigger while in flight. React-side async-state modeling smells belong to `react-stinky`; this category is only about the boundary contract.
- **Don't flag:** fire-and-forget invokes whose failure is genuinely inconsequential (telemetry) and marked as such.
- **Source:** MDN, using promises and error handling (https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Using_promises#error_handling).

# Pillar 13. Config, build, and footprint

## 54. dev-identity-shipped [Funky]
- **Sniff for:** `identifier` still `com.tauri.dev` or the template default; changing it later relocates app-data directories and breaks updater continuity, so it must be right before first release; version numbers drifting between `tauri.conf.json`, `Cargo.toml`, and `package.json`.
- **Fix:** a real reverse-domain identifier before anything ships; one version source of truth (omit `version` in `tauri.conf.json` to inherit `Cargo.toml`, or wire a bump script that updates all three).
- **Don't flag:** a project that has never shipped and says so; version skew between frontend `package.json` and the app version when only the latter is released.
- **Source:** Tauri v2, configuration reference (https://v2.tauri.app/reference/config/).

## 55. debug-bits-in-release [Funky, Rancid for a widened attack surface]
- **Sniff for:** `withGlobalTauri: true` without a stated need (it hands every script in the page the full IPC surface, injected-script XSS included); unconditional `window.open_devtools()`; verbose logs of user content in release builds; the `devtools` cargo feature enabled for production.
- **Fix:** import `@tauri-apps/api` as a module and drop `withGlobalTauri`; gate devtools behind `#[cfg(debug_assertions)]`; keep release logging structural, not content-bearing.
- **Don't flag:** devtools in debug builds (that is the point); `withGlobalTauri` where a documented constraint forces script-tag usage.
- **Source:** Tauri v2, configuration reference, app.withGlobalTauri (https://v2.tauri.app/reference/config/).

## 56. bloated-release-profile [Whiff, Funky once users download it]
- **Sniff for:** a default `[profile.release]`, no `lto`, no `strip`, `codegen-units` at 16, shipping binaries multiples larger than needed.
- **Fix:** the standard Tauri size profile, `lto = true`, `codegen-units = 1`, `strip = true`, `panic = "abort"`, `opt-level = "s"` when size beats speed. Measure before and after; it routinely halves the binary.
- **Don't flag:** debug and dev profiles; a deliberate `opt-level = 3` where runtime speed was measured to matter.
- **Source:** Tauri v2, reducing the app size (https://v2.tauri.app/concept/size/).

## 57. broken-entrypoint-split [Funky]
- **Sniff for:** app logic accumulating in `main.rs` instead of the library's `run()` (breaks mobile targets, which enter through the lib); a missing `#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]`, so release builds flash a console window on Windows; setup work in `main` before the builder that belongs in the `setup` hook.
- **Fix:** the v2 template split, `main.rs` stays a three-line shim calling `<app>_lib::run()`, everything real lives in `lib.rs` and its modules; keep the `windows_subsystem` attribute on `main.rs`.
- **Don't flag:** extra argv modes multiplexed in `main.rs` before handing off to `run()` (a CLI or helper subprocess mode is a legitimate pattern); desktop-only projects that still keep the split for consistency.
- **Source:** Tauri v2, project structure (https://v2.tauri.app/start/create-project/).
