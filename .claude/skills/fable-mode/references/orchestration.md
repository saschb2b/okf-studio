---
type: Doctrine
title: Orchestration patterns
description: Multi-agent structure for scale and confidence; pipeline over barrier, adversarial verification, loop-until-dry, judge panels, multi-modal sweeps, and no silent caps.
tags: [workflow, subagents, verification, scale]
timestamp: 2026-07-16T10:00:00Z
---

# When work graduates to orchestration

Single [delegation](/delegation.md) answers a question. Orchestration structures many agents when the task needs one of three things: coverage one context cannot hold (a migration, an audit, a broad sweep), confidence one perspective cannot grant (independent verification before committing), or decomposition that must be deterministic (loops and fan-out driven by code, not by model whim). The shapes below are portable; a harness without a workflow engine emulates them with sequential passes, per [harness mapping](/harness-mapping.md).

# Pipeline over barrier

Multi-stage work flows each item through its stages independently. Item A can be in verification while item B is still being found. A barrier (wait for all of stage N before any of stage N+1) is correct only when stage N+1 genuinely needs cross-item context: deduplication across the full set, an early exit on a zero count, a prompt that compares "the other findings". "The stages are conceptually separate" and "it is cleaner" do not justify one; barrier latency is real, and the fast items idle behind the slowest.

# Adversarial verification

A finding is not real because it is plausible. Before asserting it, hand it to independent skeptics prompted to refute it, and let it die on a majority refutation. Two refinements:

- **Diverse lenses beat redundant ones.** When a finding can fail in several ways, give each verifier a distinct lens (correctness, security, does-it-reproduce) instead of three identical refuters.
- **The skeptic defaults to refuted.** A verifier that rubber-stamps is worse than none, because it launders plausibility into confidence.

This pattern is the fan-out form of [verification gates](/verification.md): same epistemics, applied to claims instead of code.

# Loop until dry

Discovery with unknown size (bugs, edge cases, affected call sites) does not stop at a target count. Keep spawning finders until K consecutive rounds return nothing new, deduplicating each round against everything *seen*, not everything *confirmed*; deduplicating against confirmed lets judge-rejected findings reappear forever and the loop never converges.

# Judge panel

For a wide solution space, generate N independent attempts from genuinely different angles, score them with parallel judges, then synthesize from the winner while grafting the runners-up's best ideas. One attempt iterated N times explores a line; N attempts explore a region.

# Multi-modal sweep

When one search angle cannot find everything, run parallel agents that each search a different way (by container, by content, by entity, by time), each blind to the others, and merge. Blindness is the point; a second searcher that sees the first's results anchors on them.

# No silent caps

Any bound on coverage (top N, sampled subset, skipped directory, no retry) is stated in the result. Silent truncation reads as "covered everything" and poisons every conclusion built on it. The same honesty rule as [faithful reporting](/reporting.md), applied to scope.

# Scale to the ask, and scale is opt-in

"Find any bugs" earns a few finders and a single-vote check. "Audit this thoroughly" earns a large finder pool, a multi-vote adversarial pass, and a synthesis stage. Matching structure to the user's actual request is part of [context economy](/context-economy.md); a tournament bracket for a typo fix is waste wearing rigor's clothes.

The upper end is a consent question, not just a sizing one. A large fan-out spends the user's money, quota, and time, and that spend is theirs to authorize: launch it when the user asked for that scale (in their words, via a standing setting, or through an explicit budget), and otherwise describe what the fan-out would do and roughly cost, then let them decide. Unrequested scale is [the irreversibility gate](/irreversibility.md)'s concern in a different currency; the spend cannot be un-spent.
