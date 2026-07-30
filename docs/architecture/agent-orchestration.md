---
type: Architecture Decision
title: Agent Orchestration
description: How Studio delegates bounded knowledge work to parallel agent runs, with Rust-computed context slices, one writer, declared budgets, and no claim to govern an external agent's own subagents.
tags: [architecture, agents, orchestration, subagents, delegation, token-economics]
generated: { by: claude/unrecorded, at: 2026-07-29T15:20:00+02:00 }
---

# Decision

Studio orchestrates delegated work at the level it actually controls. A run starts in Studio, reads context slices Rust computed, and stays under a budget the user approved. It writes through the one staged tree that already exists.

It does not attempt to manage subagents an external agent spawns inside its own process. The [Agent Client Protocol](../reference/agent-harness-research.md) has no sub-session concept, so nothing can observe that state. A surface that presented it would invent it.

# Why this decision exists

The [Agent Panel](../features/agent-panel.md) already runs threads in parallel, but the user composes each one. Nothing decomposes a bundle-sized job. The jobs Studio exists for are bundle-sized: audit every concept of a type, or check a claim against six sources. They also include finding contradictions across a folder and migrating a naming convention through a hundred files. As a single prompt, each of these either exceeds a context window or gets sampled silently.

The [harness research](../reference/agent-harness-research.md) sets the terms. Delegation buys real capability and costs 3 to 10 times the tokens. Orchestration design moves cost and latency more than model choice does. The shape that survives contact is orchestrator-worker: fan out the reading, and keep the writing in one place. Studio already satisfies the safety condition, because the staged tree is the only write path. What it lacks is the decomposition layer above it.

There is also an asymmetry worth spending: a general coding agent must discover a repository by searching it, but `okf-core` has already parsed this bundle. Studio knows the concepts, types, tags, indexes, link graph, health findings, and a revision fingerprint before it contacts any model. A delegate that receives a computed slice does not spend a single token rediscovering structure Studio can hand it. Token usage explains most of the performance variance in the published research. So this is the largest efficiency lever available to us, and it is available to us specifically.

# The delegation unit

A delegated run is one bounded job with five declared parts. Studio resolves all five before it contacts a model:

Slice
: The exact concepts, sources, and health findings this run may reason about. Rust computes them from the bundle, and no model chooses them. Rust addresses a slice by bundle grant ID, revision fingerprint, and bundle-relative concept IDs, which is the identity contract the [agent system](agent-system.md) already uses.

Capability
: One narrow [capability pack](../features/capability-packs.md), with its declared tool set, artifact kinds, method, stop conditions, and completion checks. A run inherits no capability it did not name.

Budget
: A ceiling on the run, expressed in the units ACP reports back: context consumption and cumulative cost. A run without a budget does not start.

Contract
: The artifact kind the run must return. A run returns one validated `okf-artifact` or a bounded summary, never a conversation for another model to read.

Provenance
: The producing session, capability digest, slice identity, and the fingerprint Rust computed the slice against. Studio retains all of it with the result.

Decomposition follows a context boundary, as the research requires. A bundle offers those boundaries directly: a folder, a type, a tag, a source, a health finding, a link neighbourhood. Studio does not split work by phase, because plan, draft, and check handoffs lose the context that made the plan.

# One writer

No delegated run may stage, apply, or restore. Delegates produce evidence and artifacts. The lead session assembles them. The human applies. This keeps the property the literature identifies as the condition under which parallel agents stop being fragile. It costs nothing to keep, because it is the boundary Studio already enforces.

A delegate also may not delegate. Depth is one. This is an orchestrator-worker system, not a swarm, and a fan-out that can fan out again has no bounded cost.

# What a run may not assume

A slice is computed against a revision fingerprint. If the bundle changes underneath an in-flight fan-out, results computed against the old fingerprint are stale. The same rule already makes a structured artifact stale. Stale results do not merge into an assembly. Studio reports which runs survived rather than quietly mixing generations.

Federated bundles stay read-only evidence inside a slice. A fan-out cannot turn eight granted bundles into eight staging destinations.

# Observability

Every run is a visible row: its slice, its capability, its budget, what it consumed, its artifact, and its outcome. A user who cannot see what a fan-out asked cannot judge what it returned. A fan-out is exactly the shape where an unreviewed conclusion is cheapest to produce.

Studio reports cost from the ACP usage update where the provider sends one, and from the native provider's own accounting otherwise. Where neither exists, Studio marks the cost unavailable rather than estimating it. An external agent's internal subagents remain what the protocol makes them: tool calls in that agent's transcript. Studio labels them as the agent's own activity.

# Verification stays separate

The [independent critic](../features/artifact-verification.md) is the verification-subagent pattern the research endorses. It already has the properties that make the pattern work: it runs in isolation, it needs almost no transferred context, and it cannot approve. Two rules carry over. It must complete its declared checks rather than stop at the first satisfied one, which is the early-victory failure mode named in the literature. And model feedback still cannot clear a deterministic block.

# Determinism and testing

Orchestration is asynchronous, and asynchronous work that tests observe by polling produces suites that pass on speed rather than correctness. Delegated runs emit typed receipts at their milestones, including slice resolution, run completion, assembly, and fan-out quiescence. The queue-backed workers behind them expose a drain operation. Tests wait on receipts. Studio adopts this from the comparison target's runtime, and it is worth adopting on its own terms, independent of agents.

Ordering follows the same rule as the rest of the host: one path out to the webview, sequenced and schema-checked at the boundary. So a fan-out cannot interleave two runs' events into one transcript.

# Boundaries

Rust owns the authority: whether a run may exist, which tools it gets, what its prompt says, and whether a result is valid. It computes slices, resolves runs, and refuses the ones that break a rule. It withholds the staging tools from the ones it allows, and assembles the outcomes. This is the boundary in [IPC and Security](ipc-and-security.md), unchanged.

Sequencing is the webview's, and that is a correction to an earlier draft of this decision which said the webview owns no orchestration. It already sequences the [isolated critic](../features/artifact-verification.md). The webview creates a session, asserts that the session carries no write grant, prompts it, and collects the turn. Rust then validates the result. A fan-out is that shape repeated, and inventing a second orchestration model in Rust for the same job would leave the codebase with two. Authority is what has to live in Rust, not the loop.

Runs are sequential today. One turn per session is a host rule, so parallel runs need separate sessions. Nobody has shown that separate sessions on one connection are safe under permission prompts and cancellation. Sequencing first makes the fan-out honest before it makes it fast.

Studio never claims a delegated run followed its capability. Studio records delivery. It does not assert compliance. That rule already exists for capability delivery to external agents and applies unchanged to every run in a fan-out.

# What this decision does not settle

Two product questions stay open: whether a fan-out may start without a per-run human confirmation, and what the default budget is. The [Agent Harness Evolution](../product/agent-harness-roadmap.md) sequence answers them, not this decision. Scheduling a fan-out to run unattended stays with the deferred automation decisions in the [specialization roadmap](../product/agent-specialization-roadmap.md).
