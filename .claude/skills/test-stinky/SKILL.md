---
name: test-stinky
description: Detect test-suite quality smells in any language or framework, explain the cost of each, and propose a fix with a source link. A counterweight to agents that blindly chase coverage and ship huge, slow, flaky suites. Covers test intent and naming, assertions (assertion-free, weak, tautological, snapshot-everything), fixtures and duplication (DAMP over DRY, mystery guests, logic in tests), test doubles (over-mocking, mock drift), determinism (time, randomness, order, shared state, hermeticity), async waiting (sleeps vs condition waits), speed and cost (inverted pyramid, redundant layers), coverage theater, and lifecycle hygiene (skipped-test rot, retries as policy, green-by-rerun), plus a suite-level shape pass with a slimming plan and a mechanical gate stack. Use when reviewing or writing tests, auditing, slimming, or speeding up a test suite, hunting flaky or slow tests, or asked to sniff, smell-check, or clean up specs or a test folder. Defers production-code smells to react-stinky and tauri-stinky.
tags: [testing, quality, review]
date: 2026-07-17
---

# Test Stinky

A holistic quality detector and gate stack for test suites, in any language and any framework. It exists as a counterweight, agents love to cover code with tests and overshoot: they ship suites that are huge, slow, and flaky, where coverage is the goal instead of a map, and where a green badge stops meaning anything. It finds the patterns that make a suite expensive to run, impossible to trust, and painful to change, explains the cost of each, and proposes a concrete fix. The full catalog with detection signals, fixes, exceptions, and sources is in [catalog.md](./references/catalog.md); read it before running a scan.

The judged artifact is the tests, not the production code. Production smells found along the way defer to sibling skills (`react-stinky` for React/TypeScript, `tauri-stinky` for Rust and Tauri); if those are not installed, note the finding in one line and move on. Everything about the tests themselves, the fixtures, the doubles, the waiting, the lanes, and the CI hygiene around them is in scope.

## What it sniffs for

Nine pillars, 49 categories. Detection signals, fixes, and sources live in [catalog.md](./references/catalog.md). The background models the findings lean on (the test pyramid, the doubles taxonomy, flakiness, hermeticity, DAMP vs DRY, mutation and property-based testing) are separate linked concepts under [references/concepts/](./references/concepts/index.md); read one when a finding needs the underlying model explained, not just named.

1. **Test intent and shape.** Vague names, eager multi-behavior tests, logic in tests, structure mirroring and internals-poking, god test files, rotting disabled tests.
2. **Assertions.** Assertion-free tests, weak asserts where exact values are known, tautologies, snapshot-everything, wide brittle asserts, assertion roulette, implementation-detail asserts.
3. **Fixtures, setup, and duplication.** Mystery guests, general fixtures, over-DRY abstraction (DAMP wins), copy-paste setup drifting across files, irrelevant-detail noise.
4. **Test doubles.** Over-mocking, mocking what you don't own, mock drift with no contract test, deep mock chains, partial mocks of the unit under test.
5. **Determinism.** Real clocks, unseeded randomness, order dependence, shared mutable state, unhermetic units, platform and locale dependence, concurrency races.
6. **Async and waiting.** Sleep-based synchronization, missing awaits, unbounded or globally-inflated waits, retry loops inside test bodies.
7. **Speed and cost.** Inverted pyramid, heavy per-test setup, the same behavior tested at three layers, forced serial execution, mega-parametrization, no speed budget.
8. **Coverage theater and gaps.** Coverage-driven tests, trivial tests, happy-path-only suites, tests that cannot fail.
9. **Lifecycle and CI hygiene.** Retry as policy, quarantine without a ledger, green-by-rerun culture, silent conditional passes, asserts fixed by deletion.

## Scope modes

Match the scope to the request, then run the workflow below over it.

| Mode | Trigger | What to scan |
| --- | --- | --- |
| Suite sweep | "audit the test suite" | Every test file, runner config, and the CI steps that run them, all languages in the repo. Prioritize the largest files and the slowest lanes. |
| Folder scan | one or more directories named | Test files and their shared fixtures/helpers in those directories. |
| File scan | specific files named | Read each fully; check every test, fixture, helper, and inline test module. |
| Fragment sniff | a pasted test or one named case | Check only that surface. State what you assumed about helpers and fixtures off-screen. |
| Slim mode | "the suite is huge/slow, shrink it" | Suite sweep, then the slimming procedure in [suite-pass.md](./references/suite-pass.md), ending in a ranked deletion-and-push-down plan. |
| Gate setup | "keep it from regressing", "add test quality gates" | Skip the scan; apply the [gate stack](./references/gates.md) to the project's toolchain and report what each gate will start catching. |

Suite-sweep and slim scope additionally run the [suite pass](./references/suite-pass.md), the shape-of-the-whole audit (pyramid placement, runtime concentration, redundancy across layers, flake and disabled surface) that per-file scans cannot see. Narrower scopes cannot, so say the suite shape was not checked rather than implying it is fine.

## Workflow per target

1. Establish the ground first: frameworks and runners per language, which lanes exist, which commands CI actually runs, retry and parallelism config. Two minutes here prevents advice the project already outgrew, and a lane that never runs in CI is a finding by itself.
2. Walk each test file against the catalog pillars (1 to 9).
3. Run the matching "Don't flag" line before reporting. If it applies, suppress the finding.
4. Rate the smell (see ratings below).
5. Emit a finding with location, the cost, and a before-to-after fix.
6. In sweep or slim scope, run the [suite pass](./references/suite-pass.md) after the per-file pass and fold its findings in under a `Suite shape` heading.
7. When asked for gates, or when findings cluster in categories a machine catches (disabled tests, floating promises, order dependence, missing durations), propose the [gate stack](./references/gates.md) so the class of smell stays fixed instead of the instance.
8. End with a summary count. If nothing survives the guard, say it smells fresh.

## Stink ratings

- **Rancid.** The test lies or the suite cannot be trusted. Fix now. (A test that cannot fail, a missing await, a tautology, a silent conditional pass, sleep-based sync in a race, order dependence, real network in the unit lane, mock drift nothing verifies, green-by-rerun culture.)
- **Funky.** A genuine cost or trust drag, not yet a lie. Should fix. (A 400-line eager test, a god file, copy-paste setup in four files, over-mocking, the same behavior tested at three layers, heavy per-test setup, retry-as-policy, quarantine with no ledger.)
- **Whiff.** Minor or stylistic. Optional. (Assertion roulette in a framework with good failure output, trivial getter tests, mega-parametrization of a cheap pure function, a missing durations report.)

## Don't flag (the guard that keeps this useful)

The catalog carries a per-smell exception line. These cut across all of them. Honor them or this skill becomes a nuisance.

- Judge placement, not ratios. A trophy-shaped, integration-heavy suite in a wiring-dominated app is a choice, not an inverted pyramid.
- An honestly-marked integration lane may spawn processes, bind localhost ports, and start containers it provisions itself. Hermeticity is a fast-lane rule, not a universal one.
- Multiple assertions on one behavior's outcome are one behavior. The eager-test smell is about many behaviors, not many asserts.
- Property-based testing with reported seeds is disciplined randomness, not a randomness smell.
- Deliberate defense-in-depth duplicates on a few business-critical invariants are chosen, not accreted; leave them.
- Real-clock reads for unique temp names are uniqueness, not time logic. Fixed exact-value asserts on wire formats are the spec, not brittleness.
- Interaction asserts on a true outbound boundary (the payment API was called once) are the behavior, not implementation detail.
- One finding per real problem, smallest fix that removes the smell. Respect a consistent local convention over the catalog default.
- Defer production-code smells to `react-stinky` and `tauri-stinky` rather than duplicating them.

## Output format

```
Test Stinky report, <scope>

src/App.test.tsx
  [Funky] eager-test (intent and shape), line 746
    Smell: one it() walks connect, scope dialog, templates, attachments, streaming,
      and export, ~400 lines and 114 awaited steps.
    Cost: a failure at step 12 hides every behavior after it, and all failures share
      one test name; nobody can tell what actually broke.
    Fix: split along the assertion clusters into six tests sharing a fixture that
      gets the app to the connected state.
    Source: xUnit Test Patterns, Eager Test (http://xunitpatterns.com/Assertion%20Roulette.html)

src-tauri/src/agent/host/agent_process.rs
  [Rancid] silent-conditional-pass (lifecycle and CI), line 181
    Smell: the test returns early, and green, unless OKF_STUDIO_PROCESS_TREE_FIXTURE is set.
    Cost: it reports passed on machines where it never ran; the guarantee is only
      checked in one special CI job, if that.
    Fix: convert the early return into a framework skip with a reason, and make the
      provisioned CI lane assert zero skips for it.
    Source: pytest, Skipping tests (https://docs.pytest.org/en/stable/how-to/skipping.html)

Suite shape: 266 frontend cases in 33 files (2 god files hold 27%), 242 Rust tests;
storybook lane never runs in CI; 1 ignored network test; no durations reporting.

Summary: 1 rancid, 1 funky across 2 files, plus 3 suite-shape findings.
```

When the scope is clean, say so plainly: "Smells fresh. No test-suite smells found in `<scope>`."

## Source

The catalog distills the canon of test-suite quality: Meszaros's xUnit Test Patterns smell taxonomy, the Google Testing Blog and Software Engineering at Google chapters on unit tests, doubles, flakiness, and coverage, Fowler's non-determinism and test-pyramid essays, Kent C. Dodds on implementation details and snapshots, and the Playwright best-practice docs. Each entry in [catalog.md](./references/catalog.md) carries its own link.
