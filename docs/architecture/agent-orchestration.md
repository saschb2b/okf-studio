---
type: Architecture Decision
title: Agent Orchestration
description: How Studio delegates bounded knowledge work to parallel agent runs, with Rust-computed context slices, one writer, declared budgets, and no claim to govern an external agent's own subagents.
tags: [architecture, agents, orchestration, subagents, delegation, token-economics]
generated: { by: claude/unrecorded, at: 2026-07-29T15:20:00+02:00 }
---

# Decision

Studio orchestrates delegated work at the level it actually controls: runs it starts itself, over context slices Rust computed, under a budget the user approved, writing through the one staged tree that already exists.

It does not attempt to manage subagents an external agent spawns inside its own process. The [Agent Client Protocol](../reference/agent-harness-research.md) has no sub-session concept, so that state is not observable, and a surface that presented it would be inventing it.

# Why this decision exists

The [Agent Panel](../features/agent-panel.md) already runs threads in parallel, but the user composes each one. Nothing decomposes a bundle-sized job, and the jobs Studio exists for are bundle-sized: audit every concept of a type, check a claim against six sources, find contradictions across a folder, migrate a naming convention through a hundred files. Asked as one prompt, these either exceed a context window or get sampled silently.

The [harness research](../reference/agent-harness-research.md) sets the terms. Delegation buys real capability and costs 3 to 10 times the tokens, orchestration design moves cost and latency more than model choice does, and the shape that survives contact is orchestrator-worker with reading fanned out and writing kept in one place. Studio already satisfies the safety condition, because the staged tree is the only write path. What it lacks is the decomposition layer above it.

There is also an asymmetry worth spending: a general coding agent must discover a repository by searching it, but `okf-core` has already parsed this bundle. Concepts, types, tags, indexes, link graph, health findings, and a revision fingerprint are known before any model is asked anything. A delegate that receives a computed slice does not spend a single token rediscovering structure Studio can hand it. Since token usage explains most of the performance variance in the published research, that is the largest efficiency lever available to us, and it is available to us specifically.

# The delegation unit

A delegated run is one bounded job with five declared parts, all resolved before a model is contacted:

Slice
: The exact concepts, sources, and health findings this run may reason about, computed by Rust from the bundle, not chosen by a model. A slice is addressed by bundle grant ID, revision fingerprint, and bundle-relative concept IDs, which is the identity contract the [agent system](agent-system.md) already uses.

Capability
: One narrow [capability pack](../features/capability-packs.md), with its declared tool set, artifact kinds, method, stop conditions, and completion checks. A run inherits no capability it did not name.

Budget
: A ceiling on the run, expressed in the units ACP reports back: context consumption and cumulative cost. A run without a budget does not start.

Contract
: The artifact kind the run must return. A run returns one validated `okf-artifact` or a bounded summary, never a conversation to be read by another model.

Provenance
: The producing session, capability digest, slice identity, and the fingerprint the slice was computed against, retained with the result.

Decomposition is by context boundary, as the research requires, and a bundle offers those boundaries directly: a folder, a type, a tag, a source, a health finding, a link neighbourhood. Studio does not split work by phase, because plan, draft, and check handoffs lose the context that made the plan.

# One writer

No delegated run may stage, apply, or restore. Delegates produce evidence and artifacts; the lead session assembles them; the human applies. This keeps the property the literature identifies as the condition under which parallel agents stop being fragile, and it costs nothing to keep, because it is the boundary Studio already enforces.

A delegate also may not delegate. Depth is one. This is an orchestrator-worker system, not a swarm, and a fan-out that can fan out again has no bounded cost.

# What a run may not assume

A slice is computed against a revision fingerprint. If the bundle changes underneath an in-flight fan-out, results computed against the old fingerprint are stale by the same rule that already makes a structured artifact stale, and stale results do not merge into an assembly. Studio reports which runs survived rather than quietly mixing generations.

Federated bundles stay read-only evidence inside a slice. A fan-out cannot turn eight granted bundles into eight staging destinations.

# Observability

Every run is a visible row: its slice, its capability, its budget, what it consumed, its artifact, and its outcome. A user who cannot see what a fan-out asked cannot judge what it returned, and a fan-out is exactly the shape where an unreviewed conclusion is cheapest to produce.

Cost is reported from the ACP usage update where the provider sends one, from the native provider's own accounting otherwise, and marked unavailable where neither exists rather than estimated. An external agent's internal subagents remain what the protocol makes them, tool calls in that agent's transcript, and Studio labels them as the agent's own activity.

# Verification stays separate

The [independent critic](../features/artifact-verification.md) is the verification-subagent pattern the research endorses, and it already has the properties that make the pattern work: it runs in isolation, it needs almost no transferred context, and it cannot approve. Two rules carry over. It must complete its declared checks rather than stop at the first satisfied one, which is the early-victory failure mode named in the literature. And model feedback still cannot clear a deterministic block.

# Determinism and testing

Orchestration is asynchronous, and asynchronous work that tests observe by polling produces suites that pass on speed rather than correctness. Delegated runs emit typed receipts at their milestones, including slice resolution, run completion, assembly, and fan-out quiescence, and the queue-backed workers behind them expose a drain operation. Tests wait on receipts. This is adopted from the comparison target's runtime and is worth adopting on its own terms, independent of agents.

Ordering follows the same rule as the rest of the host: one path out to the webview, sequenced, schema-checked at the boundary, so a fan-out cannot interleave two runs' events into one transcript.

# Boundaries

Rust owns slice computation, budget enforcement, run lifecycle, provenance, and validation. The webview renders typed state and owns no orchestration. This is the boundary in [IPC and Security](ipc-and-security.md), unchanged.

Studio never claims a delegated run followed its capability. Delivery is recorded; compliance is not asserted. That rule already exists for capability delivery to external agents and applies unchanged to every run in a fan-out.

# What this decision does not settle

Whether a fan-out may start without a per-run human confirmation, and what the default budget is, are product questions answered in the [Agent Harness Evolution](../product/agent-harness-roadmap.md) sequence rather than here. Scheduling a fan-out to run unattended stays with the deferred automation decisions in the [specialization roadmap](../product/agent-specialization-roadmap.md).
