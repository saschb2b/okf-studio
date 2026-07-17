---
type: Concept
title: "Hermeticity and Lanes"
description: "What makes a test hermetic, why the fast lane demands it, and how an honestly-marked integration lane earns its exceptions."
tags: [testing, hermetic, isolation, ci]
timestamp: 2026-07-17T00:00:00Z
---
# Hermeticity and Lanes

A test is hermetic when its outcome depends only on inputs it controls: no real network, no shared machine state, no wall clock, no dependence on what ran before it. Hermeticity is what makes a test parallelizable, cacheable, and trustworthy at once; every non-hermetic input is a [flake](flakiness.md) source and a serialization constraint (catalog categories 24, 26 to 28, 38).

## The lane rule

Hermeticity is a **fast-lane rule, not a universal one**. The [gate stack](../gates.md) (gate 4) splits by it:

- **Fast lane** (blocks every PR, runs locally without thought): hermetic, parallel, seconds to low minutes. Anything here that reaches for the network, the clock, or disk outside its own temp dir is a finding.
- **Integration lane** (marked, scheduled, own budget): may spawn processes, bind localhost ports, and start containers, **provided the suite provisions those dependencies itself**. A localhost server the test starts is hermetic in the sense that matters: no external weather can fail it. A live third-party API is not, and never belongs in a blocking lane.

The dishonest middle is the smell: integration-weight tests squatting in the unit lane (category 28), or a lane that exists but no CI step runs ([suite pass](../suite-pass.md), lane honesty check).

## Achieving it

- Inject the unhermetic dependencies (clock, randomness seed, filesystem root, ports) so tests can pin them.
- One mutable world per test: unique temp dir, per-worker database or schema, transaction rollback; share only immutable ground.
- Reset state in setup, not teardown; a crashed test never runs its teardown.
- Emulate the outside at the boundary: in-process fakes with contract tests ([doubles](test-doubles.md)), official emulators, containers the suite owns.

# Citations

- Google Testing Blog, Hermetic Servers (https://testing.googleblog.com/2012/10/hermetic-servers.html)
- Google Testing Blog, Test Sizes (https://testing.googleblog.com/2010/12/test-sizes.html)
- Meszaros, xUnit Test Patterns, Erratic Test (http://xunitpatterns.com/Erratic%20Test.html)
