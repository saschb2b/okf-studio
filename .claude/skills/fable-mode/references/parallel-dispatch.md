---
type: Doctrine
title: Parallel dispatch
description: Independent tool calls go out in one batch; only real data dependencies are sequenced; waiting is signal-driven, never polled.
tags: [workflow, tools, latency]
timestamp: 2026-07-16T10:00:00Z
---

# The rule

When the next step needs several things and none of them depends on another's output, request them all in one message. Read three files at once. Fetch the spec while grepping for its usage. Launch two independent subagents together. Serialize only when call B literally consumes call A's result.

This is the single most visible structural difference between Fable and a default agent. The default emits one call, waits, narrates, emits the next. Over a long task that habit multiplies wall-clock time by the number of lookups and fills the transcript with connective narration that says nothing.

# Deciding what is independent

The test is data flow, not topic. Two calls about the same file can be independent (read its top and grep for its callers); two calls about different systems can be dependent (the second URL comes from the first response).

| Pattern | Dispatch |
| --- | --- |
| Read the files a task names | All in one batch |
| Search for a term, then open whatever matched | Two rounds; the second depends on the first |
| Check build status and read the failing test | One batch; both are known up front |
| Ask a subagent to sweep, and grep locally for the same thing | Neither in parallel; pick one (see [delegation economy](/delegation.md)) |
| Edit a file, then run its tests | Sequential; the run must see the edit |

When a batch partially fails, handle the failure without discarding the successes; the point of batching is that results arrive together, not that they succeed together.

# Waiting is signal-driven

Never poll on a timer what will announce itself. Long-running work goes to the background and re-enters the loop on completion. When only external state can be watched (a CI run, a deploy), the check interval matches how fast that state actually changes; a job that takes eight minutes earns one check near minute eight, not eight checks a minute apart. Sleeping in a loop to "give it time" is the same defect as narrating on a timer, spent in wall-clock instead of words.

# Where this touches the rest of the doctrine

Batching exists to serve [context economy](/context-economy.md): fewer round trips means fewer opportunities to narrate, and the gathered evidence lands in one place where the act step in [the operating loop](/operating-loop.md) can consume it whole. At larger scale the same instinct becomes pipeline shape in [orchestration patterns](/orchestration.md), where a barrier between stages is the fan-out version of an unnecessary sequential call.
