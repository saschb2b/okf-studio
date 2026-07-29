---
type: Reference
title: Agent Harness Research
description: What T3 Code and comparable control surfaces actually implement, what the multi-agent literature agrees and disagrees on, and the protocol limit that decides how far Studio can govern delegated work.
resource: https://github.com/pingdotgg/t3code
tags: [reference, agents, orchestration, subagents, acp, token-economics, research]
generated: { by: claude/unrecorded, at: 2026-07-29T15:20:00+02:00 }
sources:
  - resource: "https://github.com/pingdotgg/t3code"
    title: T3 Code repository
  - resource: "https://t3.codes/"
    title: "T3 Code: the open-source control plane for coding agents"
  - resource: "https://github.com/pingdotgg/t3code/issues/1740"
    title: "T3 Code issue 1740: Sub-Agent Customization UI"
  - resource: "https://claude.com/blog/building-multi-agent-systems-when-and-how-to-use-them"
    title: When to use multi-agent systems (and when not to)
  - resource: "https://www.anthropic.com/engineering/multi-agent-research-system"
    title: How we built our multi-agent research system
  - resource: "https://cognition.com/blog/dont-build-multi-agents"
    title: "Cognition: Don't Build Multi-Agents"
  - resource: "https://arxiv.org/abs/2607.06906"
    title: "The Harness Effect: How Orchestration Design Sets the Token Economics of Enterprise Agentic AI"
  - resource: "https://agentclientprotocol.com/protocol/prompt-turn"
    title: Agent Client Protocol, the prompt turn
---

# Research question

Studio hosts agents it does not own. The question this research answers is what a host can add above a harness it did not write, how far delegated work can be governed from that position, and which of those additions pay for themselves in tokens and latency rather than only in features.

The comparison target was chosen because it is the closest product on the market rather than the loudest: T3 Code is an open-source desktop application whose job is to run other people's coding agents, which is structurally what the [Agent Panel](../features/agent-panel.md) does for knowledge work.

# The premise this research corrects

T3 Code is often described as having a superior harness for spawning and managing subagents. Its own material does not claim that, and its code layout does not support it.

It calls itself an "agent harness control surface" and "the open-source control plane for coding agents", and it orchestrates Claude Code, Codex, Cursor, Grok, and OpenCode from one interface. The provider runtime is delegated: the server wraps `codex app-server` over JSON-RPC on stdio, and Claude is run as the ordinary `claude` binary. The model loop, the tool set, and the subagent machinery all belong to the harness underneath.

Subagents are not a T3 Code feature. Its support for them consists of passing through the underlying harness's `.claude/agents/` configuration files, and an open issue asks for a UI to manage them because none exists. So the interesting question is not how T3 Code spawns subagents, because it does not. It is what the control plane above a harness is worth, and that turns out to be a great deal.

# What the control plane actually implements

These are the mechanisms worth naming, taken from the project's own architecture documentation.

Single ordered output path
: Every outbound message to the client goes through one push bus carrying a channel, a monotonic per-connection sequence, and channel-specific data. Payloads are schema-validated at the transport boundary, and a decode failure produces a structured diagnostic with a code, a reason, and a path rather than a silent drop.

Event-sourced orchestration
: Provider-native events are normalized into orchestration events by a dedicated ingestion layer, persisted, folded into a read model, and only then exposed as domain events. The UI never reads provider runtime detail directly.

Queue-backed reactors
: Ingestion, provider command dispatch, and checkpoint capture are separate queue-backed workers rather than inline effects, which keeps ordering explicit and races rare.

Receipts instead of polling
: Important asynchronous milestones, such as checkpoint capture, diff finalization, and a turn becoming fully quiescent, emit typed receipts. Tests and orchestration code wait on those signals rather than polling internal state, and every worker exposes a drain operation for deterministic synchronization.

A readiness gate
: Clients are not welcomed until startup barriers complete, so there is no window in which a connected client sees partial state.

One retry owner
: A single supervisor owns desired state and retry scheduling, with exponential backoff capped at 16 seconds. Connection health is proven by a successful configuration call rather than by an open socket, and data synchronization state is tracked separately from transport state, so a failed subscription on a healthy transport is reported as a synchronization error rather than a fake reconnect.

Environment isolation by process
: Multiple accounts for the same provider are separated by giving each its own home directory, and a thread is bound to the environment it started in rather than being migrated between them.

Checkpoints per turn
: Git checkpoints are captured on turn start and completion, and each agent thread writes to its own branch.

# What transfers and what does not

The last two do not transfer. Thread-per-branch and per-turn Git checkpoints assume the change model belongs to Git. Studio's [second-pass review](../product/agent-specialization-roadmap.md) already rejected that analogy: a bundle is not required to be a repository, and knowledge changes travel as staged OKF revisions. Adopting branch-per-thread would make Git a prerequisite for agent work.

The rest transfers directly, and the receipt-and-drain pattern is the most valuable single item in this document for reasons that have nothing to do with agents. Studio's agent tests wait on observable state; a typed quiescence receipt is what makes "the turn is finished" a fact the test can await instead of a timeout it can lose.

# What the multi-agent literature agrees on

The two most cited positions are usually presented as opposites. They are not, and the shape of their disagreement is the useful part.

Anthropic's research system is the case for delegation. A lead agent plans and spawns subagents that explore in parallel, each with its own context window and tools, and their findings are synthesized with a separate citation pass. The reported result is 90.2% above single-agent performance on a research evaluation, with Opus leading and Sonnet subagents working.

Two details matter more to us than the headline. Fan-out width is scaled to the task rather than fixed: simple fact-finding is one agent with a handful of tool calls, a direct comparison is two to four subagents, and complex research passes ten. And the cost is stated plainly: agents use roughly 4 times the tokens of a chat, multi-agent systems roughly 15 times, and on their browse evaluation three factors explain 95% of performance variance, of which token usage alone explains 80%.

The second figure is the one to design against. If most of the variance is token spend, then a host that removes tokens from a task without removing information from it is buying performance directly, and a host that fans out at a fixed width is spending it blindly.

Anthropic's later guidance narrows when that trade is worth making to three reasons, and rejects a fourth that teams reach for first:

- Context protection, when material gathered for one subtask would pollute the next.
- Parallelization, when subtasks have genuinely independent information spaces.
- Specialization, when tasks need distinct tools or prompts that would confuse one agent.
- Not phase splitting. Dividing work by context boundaries is the rule; dividing plan, implementation, and test across agents loses context at every handoff.

The guidance puts the multiplier at 3 to 10 times for equivalent tasks, recommends starting with a single agent, and names one pattern as consistently effective: a verification subagent that black-box tests the main agent's output, which works precisely because it needs almost no context transferred. Its failure mode is named too, the early victory, where a verifier declares success after token testing unless it is explicitly required to run the whole check.

Cognition's position is the case against, and it is narrower than its title. Decisions dispersed across agents that cannot share context produce fragile systems, so the recommended shape is a single-threaded linear agent with continuous context, ephemeral subagents that run in a fresh window and return one summary string, and a separate compression model for long histories. The reconciling sentence is the one worth keeping: multi-agent systems work best when writes stay single-threaded and the additional agents contribute intelligence rather than actions.

Both sides therefore agree on more than they dispute. Delegate reading, keep writing in one place, divide by context rather than by phase, and expect to pay several times the tokens for the privilege.

# What the economics say

A 2026 study of orchestration design across six foundation models and 22 locked evaluation tasks makes the efficiency case directly. Its framing is that agentic development runs on buying capability with tokens, so tokens per task grow faster than task value, and its finding is that the orchestration layer, the part that assembles context, exposes tools, and sequences turns, is a larger lever on cost than the choice of model.

The measured change against conventional production orchestration was 41% lower cost per task, 44% faster median execution, and 38% fewer tokens, at quality parity. Every model improved, by 33% to 61%, regardless of architecture. The practical reading for a host: an orchestration improvement multiplies across every model the user might connect, present and future, while a model preference does not.

# The protocol limit

This is the constraint that decides Studio's design, and it is not negotiable from our side.

The Agent Client Protocol has no concept of a nested session, a sub-session, a child agent, or a subagent. During a prompt turn an agent reports a plan, message chunks, tool calls, tool call updates, and usage. When an external agent spawns subagents internally, they surface as ordinary tool calls: the host cannot see how many are running, what each was asked, what context each received, or which of them produced a given conclusion.

ACP does carry a usage update with context consumption and a cumulative cost object, so the host can observe what a turn consumed in total. It cannot attribute that total to delegated work.

The consequence is a hard line. Studio can govern delegation it performs itself, and it can report delegation performed by an external agent only as the tool calls the agent chose to expose. Any Studio surface that appeared to manage an external agent's subagents would be describing state it does not have, which the existing rule against claiming an external agent loaded a capability already forbids in a neighbouring case.

# Decisions

- Studio is a control surface, like the comparison target, and the honest comparison is control plane against control plane. Neither product owns the harness, so a claim to a superior harness is not the ground to compete on.
- Adopt the ordered push path, event-sourced orchestration, typed milestone receipts, drain-based test synchronization, the readiness gate, and the single retry owner. These are host qualities, independent of what the agent underneath does.
- Do not adopt branch-per-thread or Git checkpoints per turn. Staged OKF revisions remain the change model.
- Delegate reading and keep writing single-threaded. Studio already satisfies the literature's condition for safe delegation, because the staged tree is the only write path and Apply is a human control.
- Treat the [independent critic](../features/artifact-verification.md) as the verification subagent the literature endorses, and require it to complete its declared checks rather than report early success.
- Divide delegated work by context boundary. Studio can do this deterministically, because `okf-core` already knows the bundle's structure, which is the asymmetry the next architecture decision is built on.
- Scale fan-out width to the job rather than fixing it, since the published guidance scales from one agent to more than ten by task complexity, and a fixed width spends tokens on jobs that did not need them.
- Report delegated cost from the usage update, and never present an external agent's internal subagents as managed Studio state.
