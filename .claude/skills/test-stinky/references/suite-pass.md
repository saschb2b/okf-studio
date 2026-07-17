---
type: Playbook
title: "Test Stinky: Suite Pass"
description: "A sweep-level audit of the whole suite's shape, layers, runtime, flake surface, and redundancy, plus the slimming procedure for an oversized suite."
tags: [testing, audit, test-pyramid, flakiness]
timestamp: 2026-07-17T00:00:00Z
---
# Test Stinky: Suite Pass

A sweep-level audit of the suite as a system. The per-file [catalog](./catalog.md) judges each test on its own; this pass sees what no single file shows: the shape of the [pyramid](./concepts/test-pyramid.md), where the runtime actually goes, how much coverage is duplicated across layers, and how big the disabled-and-[flaky](./concepts/flakiness.md) surface has grown. Run it in suite-sweep scope after the per-file pass. Skip it for single-file or fragment scope and say so plainly.

Findings fold into the main report under a `Suite shape` heading, using the closest catalog category (mostly 35 to 40, 45 to 48).

## Build the inventory

Search, do not eyeball. Collect before judging.

1. **Runners and lanes.** Every test framework and config in the repo (unit, browser, e2e, per-language), which command runs each, and which of those commands CI actually executes. A lane that exists but never runs in CI is a finding on its own.
2. **Counts and weight.** Test files and case counts per lane; the ten largest test files by lines; the source-to-test ratio per area. Concentration matters: four god files often hold half the suite.
3. **Runtime.** Per-lane wall clock from the last CI runs, and the slowest N tests from the runner's own reporting (`--durations`, `slowTestThreshold`, nextest timings). If nothing reports durations, that is category 40 before anything else.
4. **Flake surface.** Grep for the mechanical signals and count them per lane:
   - sleeps and naps: `sleep(`, `setTimeout(`, `Thread.sleep`, `time.sleep`, `tokio::time::sleep`, `waitForTimeout`
   - real clock: `Date.now`, `new Date(`, `Instant.now`, `SystemTime::now`, `datetime.now`, `time.time(`
   - disabled: `.skip`, `.only`, `xit`, `todo`, `@Disabled`, `#[ignore]`, `@pytest.mark.skip`, commented-out test blocks
   - retries: `retry`, `retries`, `flaky`, `reruns` in runner configs and CI files
   - hidden conditionals: early `return` or `if env` guards inside test bodies (category 48)
   - external reach: `http://`, `https://`, real hostnames, `TcpListener::bind`, docker invocations in the unit lane
5. **Isolation posture.** Parallelism settings per lane (workers, `runInBand`, serial markers), shared fixture directories, per-test temp usage, order-randomization on or off.

## Cross-suite checks

- **Pyramid shape.** Map behavior areas to the layer that tests them, against the placement rule in [test-pyramid](./concepts/test-pyramid.md). The question is not the ratio but the placement: is each behavior tested at the cheapest layer that can catch its failure (category 35)? Name the areas where pure logic is only reachable through a browser, an app boot, or a subprocess.
- **Redundancy map.** Sample a handful of central behaviors and find every test that asserts them, across layers. More than one home per behavior, where the duplication is accreted rather than chosen, is category 37; list the deletion candidates.
- **Runtime concentration.** Rank tests by cost and ask, for each of the top ten, what the expensive part buys (real browser, full app render, recursive fixture copy, spawned process) and whether a suite-level share or a lower layer keeps the proof (categories 36, 35).
- **Lane honesty.** Judge each lane against the [hermeticity](./concepts/hermeticity.md) lane rule: anything in the fast default lane that reaches network, disk beyond its own temp dir, subprocesses, or wall-clock time is category 28 or 24; anything slow-but-honest belongs in a marked lane instead of stretching the unit lane's timeout (category 33).
- **Dead and silent surface.** Total the disabled tests and their ages (category 6, 46), the env-gated silent passes and whether any CI lane actually provisions them (category 48), and the lanes that exist but run nowhere.
- **Trust check.** From CI history if available: first-attempt green rate, pass-on-retry counts, and the reruns-until-green habit (categories 45, 47).

## Slimming an oversized suite

When the ask is "the suite is huge and slow, shrink it", run the inventory above, then work this order. It removes cost roughly in exchange-rate order, most runtime recovered per unit of risk.

1. **Delete the can't-fail and the trivial.** Assertion-free tests, tautologies, getter tests, framework tests (categories 7, 9, 42, 44). Zero coverage is lost because none existed.
2. **Deduplicate across layers.** For each behavior with several homes, keep the cheapest sufficient one plus at most one journey above (category 37). This is usually the single biggest cut.
3. **Push tests down.** Rewrite e2e and full-app tests that prove pure logic as unit tests on the extracted seam (category 35). Keep a count: every push-down should retire at least one expensive test.
4. **De-slug the survivors.** Replace sleeps with condition waits (category 31), hoist heavy immutable setup to suite level (category 36), fix isolation and turn parallelism on (categories 27, 38).
5. **Merge the eager, split the god.** Long multi-behavior tests split along their assertion clusters; god files split by area; shared walk-ups become fixtures (categories 2, 5, 17).
6. **Settle the ledger.** Disabled tests get fixed, deleted, or quarantined with owner and expiry (categories 6, 46); silent conditional passes become honest skips with a CI lane that runs them (category 48).
7. **Install the ratchet.** Wire the gates ([gates.md](./gates.md)) so the suite cannot regrow the same fat: duration reporting, budgets, shuffle, flake tracking.

Report the plan as a table: action, tests affected, runtime recovered (estimate), coverage risk, catalog category. Deletions and merges are code changes; land them in reviewable slices, never one mega-purge.

## Don't flag

- A deliberately integration-heavy (trophy) shape in a wiring-dominated app; placement, not ratio, is the standard.
- Slow lanes that are measured, budgeted, and scheduled (nightly) rather than blocking every PR.
- A handful of chosen defense-in-depth duplicates on business-critical invariants.
- Infrastructure the suite provisions for itself (containers, localhost servers) in an honestly-marked integration lane.

## Output

End the pass with a one-line shape summary: tests and wall clock per lane, the top runtime concentration, counts of disabled, silently-conditional, and retried tests, and the pyramid verdict in a phrase. If the scope could not see CI or durations, say which parts of the pass ran blind instead of implying the suite is healthy.
