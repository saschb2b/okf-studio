---
type: Runbook
title: "Test Stinky: Gate Stack"
description: "The mechanical enforcement layer that keeps a slimmed suite honest, lint rules, order shuffle, duration budgets, flake detection, mutation spot-checks, and CI lane wiring, with per-ecosystem tooling."
tags: [testing, ci, quality-gates, flakiness, mutation-testing]
timestamp: 2026-07-17T00:00:00Z
---
# Test Stinky: Gate Stack

The mechanical gates that keep a suite from regrowing the [catalog's](./catalog.md) smells after a cleanup. Wire them so review hunts judgment calls, not the things a machine catches. Order matters, cheap and deterministic first. The gates are ecosystem-neutral; each names the common tool per stack as an anchor, use the project's equivalent.

## The stack, in order

| # | Gate | What it enforces | Catches | Where |
| --- | --- | --- | --- | --- |
| 1 | Test lint | Rules for test code itself | Categories 3, 6, 7, 12, 32 mechanically | pre-commit + CI |
| 2 | Order shuffle | Randomized test order, seed printed | Order dependence (26) before it reaches CI roulette | always on |
| 3 | Duration report | Slowest-N visible on every run | Creep toward 36, 40 | every run |
| 4 | Lane split | Fast hermetic lane vs marked integration lane | 28 structurally; keeps the PR gate fast | CI |
| 5 | Flake detect | New and changed tests run repeatedly before merge | 24 to 31 caught at birth | CI on test diffs |
| 6 | Flake ledger | Pass-on-retry logged, quarantine has owner and expiry | 45, 46, 47 | CI + review cadence |
| 7 | Budget alarm | Per-lane wall-clock ceiling, breach fails loudly | 40 | CI |
| 8 | Mutation spot-check | Sampled mutation run on core modules | 41, 44 wholesale | scheduled |

## Gate 1: test lint

Turn on the rules that make catalog categories compile-time findings.

- **JS/TS (Vitest or Jest).** `eslint-plugin-vitest` or `eslint-plugin-jest`: `expect-expect` (category 7), `no-disabled-tests` and `no-focused-tests` (6, and `.only` never reaches CI), `no-conditional-expect` and `no-conditional-in-test` (3), `no-standalone-expect`, `valid-expect`. Plus `@typescript-eslint/no-floating-promises` covering test files (32). With Testing Library, `eslint-plugin-testing-library` catches implementation-detail queries (13) and `await`-misuse.
- **Python.** `flake8-pytest-style` or Ruff's `PT` rules; Ruff `PT004`-family plus `asyncio_mode = "strict"` (32); `pytest --strict-markers` so misspelled skip markers fail instead of silently not marking (48).
- **Rust.** Clippy already covers tests; add `#![deny(clippy::dbg_macro)]` in test modules if noise accumulates. The bigger lever is the runner: `cargo nextest` gives per-test timing, leak detection, and retries-with-reporting.
- **JVM.** ArchUnit or Error Prone test checks; JUnit 5 `@Disabled` requires a reason string by convention, enforce via a custom rule or review.

## Gate 2: order shuffle

Run tests in random order with the seed printed, so hidden coupling (26, 27) surfaces on the machine of whoever wrote it, not in CI three weeks later. Vitest `sequence.shuffle: true`, `pytest-randomly`, JUnit `Random` method orderer, Go `-shuffle=on`, nextest's default per-test process isolation. When a shuffled run fails, the seed reproduces it; fix the coupling, never pin the order back.

## Gate 3: duration report

Every run prints its slowest tests: Vitest `slowTestThreshold`, `pytest --durations=10`, nextest slow-test warnings, Playwright's reporter, Gradle test reports. Free, immediate, and the precondition for every speed conversation. A suite nobody can rank by cost will regrow fat silently (40).

## Gate 4: lane split

Two lanes minimum, split by [hermeticity](./concepts/hermeticity.md), not by directory accident:

- **Fast lane** (the PR gate): hermetic, parallel, seconds to low minutes. No network, no shared mutable resources, no wall-clock waits. This is the lane developers run locally without thinking.
- **Integration lane**: marked (`@pytest.mark.integration`, a separate Vitest project, `#[ignore]` plus an explicit CI step that runs ignored tests, Playwright project): may start containers and localhost servers, owns its provisioning, runs on merge or nightly with its own budget.

The gate is structural: a fast-lane test that reaches for the network or disk outside its temp dir should fail (network-off test environment, a jest/vitest environment that stubs `fetch` loudly, `cargo nextest` with no network sandbox is convention plus review). And every lane that exists must actually run somewhere in CI; a suite lane with no CI step is dead weight or, worse, false confidence.

## Gate 5: flake detection at birth

New and changed tests are the flake nursery. On PRs that touch tests, run the touched tests repeatedly before they join the suite: `cargo nextest run -E 'test(<changed>)' --retries 0` in a loop, `pytest --count` via pytest-repeat, Vitest `--retry=0` repeated, Playwright `--repeat-each=10`. Ten green repeats is a cheap bar that catches most timing and isolation races on day one, when the author still has context.

## Gate 6: flake ledger and quarantine

If the runner retries at all, every pass-on-retry is recorded (test name, seed, timestamps) and visible, never silently absorbed (45); the [flake lifecycle](./concepts/flakiness.md) defines the metrics this ledger feeds. Quarantine is a file in the repo: test, owner, ticket, expiry date. A CI step fails when an entry passes its expiry, so the graveyard cannot form (46). Review the ledger on a cadence; the metric that matters is first-attempt green rate (47).

## Gate 7: budget alarm

Give each lane a wall-clock ceiling in CI (a timeout on the job a notch above normal, plus an explicit check that fails with a message when the lane exceeds its budget). The point is not the number, it is that growth becomes a decision someone makes instead of drift nobody noticed (40).

## Gate 8: mutation spot-check

Scheduled, not per-PR: run a [mutation tool](./concepts/mutation-testing.md) over the modules where correctness matters most (Stryker for JS/TS, mutmut or cosmic-ray for Python, cargo-mutants for Rust, PIT for JVM) and read the survivors. Surviving mutants in covered lines are can't-fail tests (44) and coverage theater (41) located mechanically. Sample and rotate modules; whole-repo mutation runs are usually too slow to sustain.

## CI wiring sketch

```yaml
# PR gate: fast lane only, minutes
- run: <lint including test rules>            # gate 1
- run: <fast-lane tests, shuffled, parallel>  # gates 2, 4
- run: <repeat touched tests xN>              # gate 5, only when tests changed
# merge / nightly
- run: <integration lane, provisions its own deps>  # gate 4
- run: <quarantine expiry check + flake-rate report> # gate 6
- run: <mutation spot-check, rotating module>        # gate 8, scheduled
```

## Don't gate

- **Coverage percentage thresholds.** They reward assertion-free tests on trivial code (41); coverage is a map for finding untested behavior, not a target. If a ratchet is wanted, ratchet on reviewed behaviors and mutation score for chosen modules, not on lines.
- **Retries as a green-making device.** Retries exist inside gate 6 only, as instrumentation with a ledger; a bare `retries: 2` in the runner config is category 45, not a gate.
- **A mandated pyramid ratio.** Placement at the cheapest sufficient layer is the rule (35); a numeric unit-to-e2e quota just gets gamed with trivial tests.
