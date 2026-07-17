---
type: Concept
title: "Flakiness"
description: "What a flaky test is, where flakes actually come from, and the detect-quarantine-fix lifecycle with the metrics that keep a suite trusted."
tags: [testing, flakiness, ci, reliability]
timestamp: 2026-07-17T00:00:00Z
---
# Flakiness

A test is flaky when it can pass and fail on the same code. Every flake spends suite trust: once developers expect red-then-green, they rerun past real regressions too ([green-by-rerun](../catalog.md), category 47). Google reports roughly 1.5% of test runs flaking and observed that flakiness concentrates where tests are larger and more resource-hungry, which is why the [suite pass](../suite-pass.md) treats size and hermeticity findings as flake findings in waiting.

## Where flakes come from

In root-cause order, mapped to the catalog categories that detect each:

- Async waiting done by clock instead of condition (categories 31 to 33), the largest single source.
- Concurrency and ordering luck: races, test order dependence, shared mutable state (26, 27, 30).
- Environment reach: real network, real time, locale, platform (24, 28, 29).
- Unseeded randomness that makes failures unreproducible (25).
- Genuine product races, the flakes that are secretly bugs users will hit; this is why [retry-as-policy](../catalog.md) (45) is rated up to Rancid.

## The lifecycle

1. **Detect.** At birth (repeat new and changed tests, [gate 5](../gates.md)), and in the fleet (log every pass-on-retry as a flake event, gate 6). A retry that is not recorded is a flake converted into invisible latency.
2. **Quarantine.** Remove the flake from the blocking lane so it stops taxing everyone, but into a ledger with owner, ticket, and expiry, never a graveyard (category 46).
3. **Fix or delete.** Reproduce with the recorded seed and shuffle order, fix the root cause, or decide the test's proof is not worth its cost.

## Metrics

First-attempt green rate is the trust metric; pass-on-retry count is the leading indicator; quarantine size and age are the debt gauge. A suite with retries on and none of these measured is flying blind (categories 40, 45).

# Citations

- Fowler, Eradicating Non-Determinism in Tests (https://martinfowler.com/articles/nonDeterminism.html)
- Google Testing Blog, Flaky Tests at Google and How We Mitigate Them (https://testing.googleblog.com/2016/05/flaky-tests-at-google-and-how-we.html)
- Google Testing Blog, Where Do Our Flaky Tests Come From? (https://testing.googleblog.com/2017/04/where-do-our-flaky-tests-come-from.html)
