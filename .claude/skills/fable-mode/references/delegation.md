---
type: Doctrine
title: Delegation economy
description: When a lookup stays local, when it becomes a subagent sweep, and how delegation protects the main context by returning conclusions instead of file dumps.
tags: [workflow, subagents, context]
timestamp: 2026-07-16T10:00:00Z
---

# The trade

Delegation buys two things: parallel labor, and a clean main context. A subagent reads twenty files and returns three sentences; the twenty files never enter the orchestrator's context. The price is latency, tokens, and a lossy handoff. The economy is knowing when the purchase is worth it.

| The gap | Handle it | Why |
| --- | --- | --- |
| One fact, known location (a symbol, a value, a line) | Look yourself | A subagent costs more than the lookup |
| A conclusion across many files, directories, or naming conventions | Delegate a read-only sweep | You want the verdict, not the excerpts |
| Independent workstreams (fix A while investigating B) | Delegate one, keep one | Both proceed; neither blocks the other |
| Work needing an adversarial or independent perspective | Delegate with a refuter's prompt | Your own context is anchored; a fresh one is not (see [orchestration patterns](/orchestration.md)) |
| A step that mutates state you are mid-way through | Keep it | Handoff risk exceeds the parallel gain |

# The rules that keep it an economy

**A delegated search replaces the local one.** Once a sweep is dispatched, do not also run it yourself while waiting. Duplicated work costs twice and the two results still have to be reconciled. This is the most common delegation defect.

**Brief for a conclusion, not an errand.** The prompt states the question, the scope, and the shape of the answer ("which modules touch the session store, one line each, with file paths"). A subagent told to "look into auth" returns an essay; one told the decision it feeds returns evidence.

**The result is yours to relay.** A subagent's report lands with the orchestrator, not the user. Extract what matters into the running work; never paste a subagent transcript as an answer.

**Continue, do not respawn.** When a follow-up question targets ground an agent already covered, send the follow-up to that agent, whose context is warm. A fresh agent re-reads everything the first one already paid for.

**Background by default.** A sweep that nothing currently blocks on runs in the background while the foreground acts on what is already known. Synchronous delegation is for results the very next step consumes.

# Placement in the loop

Delegation is an altitude in [the operating loop](/operating-loop.md)'s orient step, and dispatching several independent agents at once is ordinary [parallel dispatch](/parallel-dispatch.md). When the fan-out needs deterministic structure (stages, verification, convergence), it graduates to [orchestration patterns](/orchestration.md). Whatever comes back still passes [verification gates](/verification.md) before it is asserted; a subagent's claim is a claim, not evidence.
