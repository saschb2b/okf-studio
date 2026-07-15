---
type: Runbook
title: "Tauri Stinky: Gate Stack"
description: "The mechanical quality-gate stack for a Tauri workspace, fmt, clippy, test, audit, deny, machete, plus the Cargo lints table and CI wiring."
tags: [rust, tauri, ci, quality-gates, clippy]
timestamp: 2026-07-15T00:00:00Z
---
# Tauri Stinky: Gate Stack

The mechanical gates that catch what a reviewer should never have to. Wire them so the catalog passes hunt judgment calls, not lint output. Order matters, cheap and deterministic first. Run from the workspace root; on a Tauri project the Rust crate usually lives in `src-tauri`, so either use workspace-level commands or `--manifest-path src-tauri/Cargo.toml`.

## The stack, in order

| # | Gate | Command | Catches | Where |
| --- | --- | --- | --- | --- |
| 1 | Format | `cargo fmt --all --check` | Diff noise, style drift | pre-commit + CI |
| 2 | Lint | `cargo clippy --workspace --all-targets --all-features -- -D warnings` | Catalog categories 1, 8, 9, 11, 21, 25, 26, 32 mechanically | pre-commit + CI |
| 3 | Test | `cargo test --workspace` | Regressions in the pure core (category 34) | pre-commit + CI |
| 4 | Advisories | `cargo audit` (or `cargo deny check advisories`) | Known-vulnerable dependency versions (RustSec) | CI + scheduled |
| 5 | Policy | `cargo deny check` | License violations, banned crates, duplicate versions | CI |
| 6 | Dead deps | `cargo machete` | Unused dependencies (category 20) | CI |
| 7 | Frontend | `tsc --noEmit` (or the project's typecheck) + ESLint + frontend tests | The other half of the boundary | pre-commit + CI |
| 8 | Build proof | `tauri build` (or `--no-bundle`) on at least one target | Config, capability, and bundling breakage plain `cargo check` misses | CI |

Local discipline is gates 1 to 3 before every commit; they are seconds. Gates 4 to 8 are CI's job, with 4 also on a schedule (new advisories land against old code).

## The lints table

Policy lives in `Cargo.toml`, not in per-file attributes, so it survives new files. A pragmatic starting set for an app crate:

```toml
[lints.rust]
unsafe_code = "deny"        # a typical Tauri app needs none (category 32)

[lints.clippy]
unwrap_used = "warn"        # category 1; test code can allow at module scope
expect_used = "warn"
dbg_macro = "warn"
todo = "warn"               # category 5
print_stdout = "warn"       # use a logger; stdout may be a protocol channel
large_enum_variant = "warn"
needless_pass_by_value = "warn"   # category 8
```

Escalate `warn` to `deny` once the codebase is clean; loosen with a scoped `#[allow(lint, reason = "...")]`, never file-wide (category 33). In a workspace, define once under `[workspace.lints]` and inherit with `lints = { workspace = true }`.

## Tauri-specific gates

These have no off-the-shelf linter; enforce them as review checklist items or small scripts.

- **Capability diff review.** Any PR touching `src-tauri/capabilities/` or the `security` section of `tauri.conf.json` gets a human reading the diff against categories 46 to 50. Wire it visibly, a CODEOWNERS line on those paths is the cheapest implementation.
- **Boundary contract check.** If types are generated (`tauri-specta`/`ts-rs`), run the generator in CI and fail on a dirty diff, drift becomes red instead of silent (category 51). Without codegen, run the [boundary pass](./boundary-pass.md) manually on boundary-touching PRs.
- **Config sanity.** Grep-level assertions that stay true, `csp` is non-null, `withGlobalTauri` is absent or justified, `identifier` is not a `com.tauri.*` default (categories 48, 54, 55).

## CI wiring sketch

```yaml
# per push/PR, Linux runner (add OS matrix when platform code appears)
- run: cargo fmt --all --check
- run: cargo clippy --workspace --all-targets --all-features -- -D warnings
- run: cargo test --workspace
- run: cargo deny check
- run: cargo machete
- run: pnpm typecheck && pnpm lint && pnpm test
- run: pnpm tauri build --no-bundle   # or a full bundle on tags
```

`tauri build` needs the platform webview toolchain on the runner (Linux needs `libwebkit2gtk`); budget for it being the slow step and keep it out of the pre-commit path.

## Don't gate

- Pedantic clippy groups wholesale (`clippy::pedantic = "deny"`), adopt individual lints you actually want or the allow-attributes proliferate and train people to silence lints (category 33).
- Coverage percentage thresholds; they reward asserting nothing on trivial code. Gate on the tests the catalog demands (adversarial cases for boundary-guarding logic, category 34) through review instead.
- `cargo outdated` as a failure; staleness is a report, not a break.
