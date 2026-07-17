---
type: Smell Catalog
title: "Tauri Stinky: Rust Catalog"
description: "The Rust-side smell catalog, pillars 1 to 7, categories 1 to 34."
tags: [rust, code-smells, maintainability]
timestamp: 2026-07-15T00:00:00Z
---
# Tauri Stinky: Rust Catalog

The Rust-side catalog, pillars 1 to 7 (categories 1 to 34). Each entry lists what to sniff for, the fix, what NOT to flag, and the source. Run the "Don't flag" line before you report anything. The default stink rating is in brackets; raise it when the smell causes a real bug, drop it when the code is internally consistent. The Tauri-layer pillars (8 to 13, categories 35 to 57) are in [tauri-catalog.md](./tauri-catalog.md).

Pillars:
1. Error handling and panics (1 to 6)
2. Ownership and allocation (7 to 11)
3. Type design and domain modeling (12 to 16)
4. Modules, API, and dependencies (17 to 20)
5. Async correctness (21 to 25)
6. Overgeneration and slop (26 to 31)
7. Unsafe, lints, and tests (32 to 34)

# Pillar 1. Error handling and panics

## 1. unwrap-in-production [Rancid]
- **Sniff for:** `.unwrap()` or bare `.expect("...")` on `Result`/`Option` in command handlers, event handlers, spawned tasks, and library paths. A panic in a Tauri command surfaces to the frontend as an opaque failure; a panic in a spawned task dies silently.
- **Fix:** propagate with `?` into the function's error type. Keep `expect` only for provable invariants, with a message that states why it cannot fail ("mutex poisoned means a prior panic").
- **Don't flag:** `#[cfg(test)]` modules and integration tests; the single `.expect("error while running tauri application")` on `Builder::run` in `main`/`run` (crash-at-startup is the intent); `.lock().unwrap_or_else(|e| e.into_inner())` (that is poison recovery, not a panic); build scripts.
- **Source:** Rust Book ch. 9.3, To panic! or Not to panic! (https://doc.rust-lang.org/book/ch09-03-to-panic-or-not-to-panic.html); Clippy `unwrap_used` (https://rust-lang.github.io/rust-clippy/master/index.html#unwrap_used).

## 2. stringly-errors [Funky]
- **Sniff for:** `Result<T, String>` as the pervasive error type; `.map_err(|e| e.to_string())` or `.map_err(|e| format!(...))` at every call site; callers (including the frontend) matching on error message substrings, which breaks on any reword.
- **Fix:** a `thiserror` enum per module or crate with `#[from]` conversions, so `?` just works and the cause chain survives. At an IPC or CLI boundary, serialize the enum once (see category 36) instead of stringifying at every site. `anyhow` is fine for application glue that only reports.
- **Don't flag:** a small tool or prototype where every error is terminal and only displayed; a boundary function that stringifies a rich internal error exactly once for transport.
- **Source:** thiserror docs (https://docs.rs/thiserror); Rust API Guidelines C-GOOD-ERR (https://rust-lang.github.io/api-guidelines/interoperability.html#c-good-err).

## 3. swallowed-results [Funky, Rancid when it hides a real failure]
- **Sniff for:** `let _ = fallible();`, `.ok()` used to discard, `if let Ok(x)` with no else path, `Err(_) => {}` match arms; `unwrap_or_default()` that turns an IO failure into "valid empty data" the rest of the code trusts.
- **Fix:** propagate with `?`, or handle deliberately, log with context at minimum. If ignoring is genuinely correct (best-effort cleanup, a fail-open convenience cache), say so in a one-line comment so the next reader knows it was a decision.
- **Don't flag:** documented fail-open paths (a corrupt preferences file starting empty on purpose); ignoring the error of a channel send whose receiver may have legitimately dropped.
- **Source:** std `#[must_use]` on Result (https://doc.rust-lang.org/std/result/#results-must-be-used).

## 4. context-free-errors [Funky]
- **Sniff for:** raw `io::Error` or `serde_json::Error` bubbled through several layers with no note of which file, path, or operation failed; the user sees "No such file or directory" with no subject.
- **Fix:** attach the operation and subject where the context exists, `anyhow::Context` (`.with_context(|| format!("reading manifest {}", path.display()))`) or a `thiserror` variant carrying the path.
- **Don't flag:** a single-layer function whose caller adds the context; hot paths where the allocation matters and the caller demonstrably wraps.
- **Source:** anyhow docs, Context (https://docs.rs/anyhow/latest/anyhow/trait.Context.html).

## 5. panic-as-control-flow [Rancid]
- **Sniff for:** reachable `panic!`, `todo!`, `unimplemented!`, `unreachable!` in shipped paths; `assert!` validating user or file input; indexing (`v[i]`, `map["key"]`) on data that came from outside.
- **Fix:** return an error for every expected failure (bad input, missing file, malformed data). Keep `unreachable!` only where the type system or a checked invariant genuinely proves it, and say which.
- **Don't flag:** `assert!`/`debug_assert!` on internal invariants; panics in tests; `unreachable!` directly under an exhaustive match the compiler checks.
- **Source:** Rust Book ch. 9.3 (https://doc.rust-lang.org/book/ch09-03-to-panic-or-not-to-panic.html).

## 6. catchall-match [Funky, Rancid when it eats a new variant]
- **Sniff for:** `_ =>` arms matching your own enum, so the next variant silently falls into the default; the same enum matched with catch-alls in several places, multiplying the risk.
- **Fix:** match exhaustively and let the compiler point at every site when a variant is added. Reserve `#[non_exhaustive]` for public APIs with external consumers.
- **Don't flag:** matching a foreign `#[non_exhaustive]` enum, where `_` is required; catch-alls over genuinely open sets (strings, integers).
- **Source:** Clippy `wildcard_enum_match_arm` (https://rust-lang.github.io/rust-clippy/master/index.html#wildcard_enum_match_arm).

# Pillar 2. Ownership and allocation

## 7. clone-to-appease [Funky]
- **Sniff for:** `.clone()` sprinkled until the borrow checker stops complaining; cloning a collection just to iterate it; cloning a large struct to pass it to a function that only reads.
- **Fix:** borrow (`&T`, `&[T]`, `&str`), restructure so the owner outlives the use, iterate by reference, or `Cow` when ownership is conditional.
- **Don't flag:** cheap handle clones (`Arc`, `Rc`, channel senders, `AppHandle`); clones that cross a thread, task, or `'static` closure boundary; cloning data out of a mutex guard to shorten the critical section (that is a good pattern, see category 22).
- **Source:** Rust Book ch. 4, Understanding Ownership (https://doc.rust-lang.org/book/ch04-00-understanding-ownership.html).

## 8. borrowed-owned-params [Whiff, Funky on a public API]
- **Sniff for:** `&String`, `&Vec<T>`, `&Box<T>` parameters; functions taking `String`/`Vec<T>` by value only to read them, forcing every caller to clone.
- **Fix:** `&str`, `&[T]`, `&T`. Take ownership only when the function stores the value; `impl Into<String>` when most callers pass an owned value anyway.
- **Don't flag:** by-value `Copy` types; taking `String` in a constructor that stores it.
- **Source:** Clippy `ptr_arg` (https://rust-lang.github.io/rust-clippy/master/index.html#ptr_arg).

## 9. needless-collect [Whiff]
- **Sniff for:** `.collect::<Vec<_>>()` mid-chain followed by more iteration; collect just to call `.len()`, `.contains()`, or `.is_empty()`; building a `Vec` in a loop with `push` where an iterator chain reads straighter.
- **Fix:** stay lazy, use `any`, `all`, `find`, `count` directly on the iterator.
- **Don't flag:** `collect::<Result<Vec<_>, _>>()` to short-circuit on the first error (idiomatic); collecting to end a borrow the next step needs released; collecting because the result is iterated twice.
- **Source:** Clippy `needless_collect` (https://rust-lang.github.io/rust-clippy/master/index.html#needless_collect).

## 10. shared-mutability-reflex [Funky]
- **Sniff for:** `Arc<Mutex<T>>` where a single owner or message passing would do; a mutex around data written once at startup; `RwLock` used as the default everywhere "for performance" with no measured contention.
- **Fix:** prefer ownership and channels; `OnceLock`/`LazyLock` for init-once globals; reach for `Arc<Mutex<T>>` when state is genuinely shared and mutated across tasks (in Tauri managed state it often is, see category 40).
- **Don't flag:** `Arc<Mutex<HashMap<..>>>` as Tauri managed state mutated from concurrent commands, that is the intended shape.
- **Source:** Tokio, Shared state (https://tokio.rs/tokio/tutorial/shared-state); std `OnceLock` (https://doc.rust-lang.org/std/sync/struct.OnceLock.html).

## 11. index-loops [Whiff]
- **Sniff for:** `for i in 0..v.len()` with `v[i]` inside; manual index bookkeeping where `enumerate`, `zip`, `windows`, or slice patterns exist.
- **Fix:** iterate directly, `for (i, item) in v.iter().enumerate()`; `zip` for parallel walks.
- **Don't flag:** genuine index arithmetic across multiple slices or in-place swaps.
- **Source:** Clippy `needless_range_loop` (https://rust-lang.github.io/rust-clippy/master/index.html#needless_range_loop).

# Pillar 3. Type design and domain modeling

## 12. stringly-domain [Funky, Rancid when a typo compiles into a bug]
- **Sniff for:** `String`/`&str` carrying a closed set of values ("light"/"dark", "pending"/"done") compared with `==`; string keys into maps for fields every call site knows; the same magic string typed in five places.
- **Fix:** an enum with `#[derive(Serialize, Deserialize)]` and `#[serde(rename_all = "camelCase")]` (or kebab-case) so the wire format stays stable; `FromStr` at the boundary, typed everywhere else.
- **Don't flag:** genuinely open sets (user input, extension points); strings at the serialization boundary that become typed one line later.
- **Source:** Rust Book ch. 6, Enums (https://doc.rust-lang.org/book/ch06-00-enums.html).

## 13. bool-blindness [Whiff, Funky at two or more flags]
- **Sniff for:** `fn render(true, false, true)` call sites nobody can read; multiple bool fields encoding one state machine (`is_loading` + `has_error` + `is_ready`) where combinations are invalid.
- **Fix:** a two-variant enum with names for a lone confusing flag; one state enum for the machine, each variant carrying its own data.
- **Don't flag:** a single bool whose meaning is obvious at the call site (`recursive: bool` on a named argument-style builder); bools mirroring a wire protocol.
- **Source:** Rust API Guidelines C-CUSTOM-TYPE (https://rust-lang.github.io/api-guidelines/type-safety.html#c-custom-type).

## 14. primitive-ids [Whiff, Funky when two id spaces mix]
- **Sniff for:** several distinct identifiers all typed `String` or `u64` and passable interchangeably (session id, worker id, bundle id); unit-less numbers (`timeout: u64`, seconds or millis?).
- **Fix:** newtypes (`struct SessionId(String)`) where confusion has bitten or realistically will; `std::time::Duration` for time.
- **Don't flag:** a small module where one id type exists; newtype ceremony on values that never travel.
- **Source:** Rust Book ch. 19.3, Newtype (https://doc.rust-lang.org/book/ch19-03-advanced-traits.html#using-the-newtype-pattern); std `Duration` (https://doc.rust-lang.org/std/time/struct.Duration.html).

## 15. impossible-states [Funky, Rancid when one has shipped]
- **Sniff for:** `Option` pairs that must co-occur or exclude each other (`data: Option<T>, error: Option<E>`); structs mixing status flags with optional payloads so illegal combinations construct fine.
- **Fix:** an enum whose arms carry their own data (`Loading | Ready(T) | Failed(E)`); make the invalid state unrepresentable instead of policing it at runtime.
- **Don't flag:** DTOs mirroring an external wire format you do not own; transitional structs validated once at the boundary and converted to the strict type.
- **Source:** Rust Book ch. 6.1, enum values with data (https://doc.rust-lang.org/book/ch06-01-defining-an-enum.html).

## 16. leaky-constructors [Whiff, Funky on invariant-carrying types]
- **Sniff for:** `pub` fields on a struct with invariants, so any code can break them; `#[derive(Default)]` on types whose required fields make an empty value meaningless; validation re-run at every use instead of once at construction.
- **Fix:** private fields plus a constructor that validates once and returns `Result`; parse, don't validate. A builder when optional fields pile up.
- **Don't flag:** plain data carriers and serde DTOs, pub fields are the point; `Default` where empty is genuinely valid.
- **Source:** Rust API Guidelines C-BUILDER (https://rust-lang.github.io/api-guidelines/type-safety.html#c-builder).

# Pillar 4. Modules, API, and dependencies

## 17. god-module [Funky]
- **Sniff for:** one file holding thousands of lines of production code across unrelated concerns (protocol handling plus persistence plus diffing plus formatting); a module whose test half is the only thing keeping it navigable; `lib.rs` accumulating domain logic between command definitions.
- **Fix:** split along the seams that already exist, one module per concern, keep `lib.rs` as the thin command registry. Measure cohesion, not just lines; 7,000 lines of one concern is rare.
- **Don't flag:** a large file that is mostly `#[cfg(test)]`; generated code; a module that is big but single-purpose and internally layered.
- **Source:** Rust Book ch. 7, Managing Growing Projects (https://doc.rust-lang.org/book/ch07-00-managing-growing-projects-with-packages-crates-and-modules.html).

## 18. pub-sprawl [Whiff]
- **Sniff for:** everything `pub`, so the crate has no surface and refactors touch the world; helper functions and internal structs exported for no consumer.
- **Fix:** default private, `pub(crate)` for cross-module internals, re-export the intentional surface from `lib.rs`.
- **Don't flag:** a binary crate where `pub` is only feeding integration tests; items a macro like `generate_handler!` requires visible.
- **Source:** Rust Book ch. 7.2, visibility (https://doc.rust-lang.org/book/ch07-03-paths-for-referring-to-an-item-in-the-module-tree.html).

## 19. version-drift [Whiff]
- **Sniff for:** wildcard or wide-open dependency versions; the same crate at two versions in `Cargo.lock` via careless requirements; `Cargo.toml` features pulling defaults nobody uses (`tokio` with `full` when four features suffice).
- **Fix:** pin sensible semver ranges, `default-features = false` plus the list you need, one version per crate where the graph allows.
- **Don't flag:** transitive duplicates you cannot control; `full` features in a dev-tool or prototype.
- **Source:** Cargo Book, Features (https://doc.rust-lang.org/cargo/reference/features.html).

## 20. dependency-for-a-function [Funky]
- **Sniff for:** a crate pulled in for something std or an existing dependency already does (a left-pad-scale helper, a second HTTP client, a date crate for one timestamp); unused dependencies lingering in `Cargo.toml`.
- **Fix:** check std and the current tree first; remove unused deps (`cargo machete` finds them, see [gates.md](./gates.md)).
- **Don't flag:** a well-chosen crate replacing genuinely subtle hand-rolled code (parsing, crypto, diffing); dev-dependencies.
- **Source:** cargo-machete (https://github.com/bnjbvr/cargo-machete).

# Pillar 5. Async correctness

## 21. blocking-in-async [Rancid]
- **Sniff for:** `std::fs`, `std::thread::sleep`, blocking HTTP, long CPU work, or process spawning directly inside an `async fn` body; it stalls the runtime worker and every future sharing it.
- **Fix:** wrap sync work in `tauri::async_runtime::spawn_blocking` or `tokio::task::spawn_blocking`; `tokio::time::sleep` for delays. Wholesale `std::fs`-behind-`spawn_blocking` is a legitimate architecture, the smell is only the unwrapped call on the async path.
- **Don't flag:** sync code inside a `spawn_blocking` closure (that is the fix); trivial fast calls (env var read) at startup; sync Tauri commands, which do not run on the async runtime (but see category 37).
- **Source:** Tokio, Async: What is blocking? (https://ryhl.io/blog/async-what-is-blocking/); Tokio `spawn_blocking` (https://docs.rs/tokio/latest/tokio/task/fn.spawn_blocking.html).

## 22. guard-across-await [Rancid]
- **Sniff for:** a `std::sync::MutexGuard` (or `RwLock` guard) alive across an `.await`; compiles in plain futures, then deadlocks under load or fails `Send` when spawned.
- **Fix:** scope the guard in a block, clone the needed data out, and drop before awaiting; `tokio::sync::Mutex` only when the lock must genuinely span an await.
- **Don't flag:** guards dropped before the await (the clone-out pattern); async mutexes chosen deliberately for held-across-await critical sections.
- **Source:** Tokio, shared state and on `std::sync::Mutex` (https://tokio.rs/tokio/tutorial/shared-state).

## 23. detached-tasks [Funky]
- **Sniff for:** `spawn` with the `JoinHandle` dropped and a fallible body, so errors and panics vanish; background loops with no shutdown story leaking across app restarts of the work they manage.
- **Fix:** log or report errors inside the task; keep the handle (or an abort handle) when the lifecycle matters; send failures over a channel or a Tauri event so the UI can react.
- **Don't flag:** true fire-and-forget with an infallible body; tasks whose errors are already emitted as events.
- **Source:** Tokio `spawn` (https://docs.rs/tokio/latest/tokio/task/fn.spawn.html).

## 24. block-on-bridge [Rancid]
- **Sniff for:** `block_on` (or `Runtime::new().block_on`) called from inside async context or a Tauri command to call async code "synchronously"; panics on nested runtimes or deadlocks the worker.
- **Fix:** make the path async end to end; a sync entry point that needs async work should hand it to the existing runtime (`tauri::async_runtime::spawn`) rather than standing up a nested one.
- **Don't flag:** `block_on` in `main`, tests, or a dedicated non-async thread bridging into the runtime.
- **Source:** Tokio `Runtime::block_on` panics section (https://docs.rs/tokio/latest/tokio/runtime/struct.Runtime.html#method.block_on).

## 25. needless-async [Whiff]
- **Sniff for:** `async fn` that never awaits, infecting every caller with `.await` and `Send` bounds for nothing.
- **Fix:** make it sync; callers simplify immediately.
- **Don't flag:** trait implementations and Tauri commands whose signature is fixed by the framework; a function about to gain awaits in the same change.
- **Source:** Clippy `unused_async` (https://rust-lang.github.io/rust-clippy/master/index.html#unused_async).

# Pillar 6. Overgeneration and slop

The counterweight pillar. Agents write Rust confidently and at volume; this pillar catches the volume that ships nothing.

## 26. dead-code-blanket [Funky]
- **Sniff for:** `#[allow(dead_code)]`, `#![allow(unused)]`, or `_`-prefixed names used to silence the compiler instead of deleting; commented-out blocks; helpers written "for later" that nothing calls.
- **Fix:** delete it, git remembers. If it is next week's work, a TODO with a ticket beats shipped dead weight.
- **Don't flag:** fields kept for serde wire-compat; platform-conditional code behind `#[cfg]`; public library API without in-crate callers.
- **Source:** rustc lint `dead_code` (https://doc.rust-lang.org/rustc/lints/listing/warn-by-default.html#dead-code).

## 27. speculative-abstraction [Funky]
- **Sniff for:** a trait with exactly one implementation and no test double consuming it; a generic parameter instantiated with one type; lifetime and generic gymnastics for a concrete, local need; "manager"/"service" layers that only forward calls.
- **Fix:** write the concrete version; introduce the trait when the second implementation or a test seam actually arrives. Collapse pass-through layers until a layer earns its existence.
- **Don't flag:** traits required by a framework or for object safety at a real extension point; generics on a genuinely reusable utility.
- **Source:** Rust API Guidelines C-GENERIC (https://rust-lang.github.io/api-guidelines/flexibility.html#c-generic).

## 28. reinvented-wheel [Funky]
- **Sniff for:** paths built by string concatenation with `/`; JSON assembled with `format!`; hand-rolled base64, hex, semver, retry, or debounce logic when std or a crate already in the tree does it.
- **Fix:** `Path`/`PathBuf` for paths, `serde_json::json!` and typed structs for JSON, the existing dependency for the rest.
- **Don't flag:** a deliberate two-line special case where the general crate is overkill and the code says why.
- **Source:** std `Path` (https://doc.rust-lang.org/std/path/struct.Path.html).

## 29. comment-noise [Whiff]
- **Sniff for:** comments restating the line below them ("// increment the counter"); doc comments that repeat the signature in words; section banner art; the density itself is the tell of generated code.
- **Fix:** keep comments that explain why, invariants, and gotchas; delete the rest. Doc comments earn their place on public API, ideally with an example.
- **Don't flag:** `SAFETY:` comments (required, category 32); license headers; genuinely tricky code documented at matching density.
- **Source:** rustdoc book, writing documentation (https://doc.rust-lang.org/rustdoc/how-to-write-documentation.html).

## 30. defensive-theater [Funky]
- **Sniff for:** checks for states the type system already excludes (re-checking `Some` right after constructing it, `if !v.is_empty()` guarding a `for` loop that handles empty fine); the same input re-validated at every layer it passes through.
- **Fix:** validate once at the boundary, convert to a type that carries the guarantee, and let the layers below trust it.
- **Don't flag:** re-validation across a genuine trust boundary (IPC input, file contents, network data), that is category 47's requirement, not theater.
- **Source:** Rust Book ch. 9.3, creating custom types for validation (https://doc.rust-lang.org/book/ch09-03-to-panic-or-not-to-panic.html#creating-custom-types-for-validation).

## 31. verbose-happy-path [Whiff, Funky past two levels]
- **Sniff for:** if-else pyramids and nested matches where `?`, `let .. else`, early returns, or a combinator reads straight; a 40-line function whose happy path is three lines wide when flattened.
- **Fix:** `let .. else` for extract-or-bail, `?` for propagation, early returns for guards. Do not overcorrect into unreadable combinator golf; the metric is how fast a reader finds the happy path.
- **Don't flag:** explicit matches kept for exhaustiveness over a domain enum; error paths that genuinely branch.
- **Source:** Rust Book, let-else (https://doc.rust-lang.org/rust-by-example/flow_control/let_else.html).

# Pillar 7. Unsafe, lints, and tests

## 32. unsafe-unjustified [Rancid]
- **Sniff for:** `unsafe` blocks with no `// SAFETY:` comment stating the upheld invariant; `unsafe` for things safe Rust does; `transmute` where `as`, `from_bits`, or a safe conversion exists.
- **Fix:** justify each block with the invariant and why it holds, or replace with the safe equivalent. In a typical Tauri app the correct amount of `unsafe` is zero.
- **Don't flag:** vetted `unsafe` inside dependencies; FFI blocks with their invariants documented.
- **Source:** Clippy `undocumented_unsafe_blocks` (https://rust-lang.github.io/rust-clippy/master/index.html#undocumented_unsafe_blocks); Rustonomicon (https://doc.rust-lang.org/nomicon/).

## 33. lint-suppression [Funky]
- **Sniff for:** blanket `#![allow(clippy::all)]` or file-wide allows; warnings scrolling by in every build that everyone has learned to ignore; no clippy gate anywhere (see [gates.md](./gates.md)).
- **Fix:** a `[lints]` table in `Cargo.toml` as the single policy; narrow `#[allow]` at the smallest scope with a `reason`; clean the warning list to zero once so new ones stand out.
- **Don't flag:** a scoped allow with a written reason; pedantic-group lints deliberately not adopted.
- **Source:** Cargo Book, the lints table (https://doc.rust-lang.org/cargo/reference/manifest.html#the-lints-section).

## 34. untested-core [Funky]
- **Sniff for:** pure logic (parsers, diff engines, path containment, transforms) with no `#[cfg(test)]` in sight; only happy-path tests; tests that assert the mock rather than the behavior; security-relevant logic (scope checks, canonicalization) without adversarial cases (symlink escape, `..` traversal).
- **Fix:** unit-test the pure core (the thin-command structure from category 35 is what makes this possible); table-driven cases for edge inputs; adversarial tests for anything guarding a boundary.
- **Don't flag:** thin glue whose behavior is the framework's; UI-adjacent code covered by frontend tests.
- **Source:** Rust Book ch. 11, Writing Automated Tests (https://doc.rust-lang.org/book/ch11-00-testing.html).
