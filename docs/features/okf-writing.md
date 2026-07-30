---
type: Feature
title: OKF Writing
description: Author and revise OKF concepts from a named reader job while preserving every supported claim, qualifier, citation, link, formula, code sample, and domain term.
tags: [feature, agents, writing, revision, evidence, review]
generated: { by: claude/unrecorded, at: 2026-07-18T20:30:00Z }
---

# What it does

Studio adds two native OKF tasks. **Write an OKF concept** turns accepted evidence or a reviewed bundle plan into new concept prose. **Improve this writing** revises an existing concept without changing its factual meaning. Both use the shared writing contract shipped in `okf-foundation@1.2.0`.

The same methods are available from ordinary chat. A generic writing request selects `okf-author` or `okf-revise` from the active capability catalog and loads the shared writing contract before work begins. The named task remains the stronger path when the user wants a visible, deterministic context and tool plan before sending.

The contract starts with a reader job: who needs the concept and which question or decision it must support. The agent inventories claims and references, chooses the information shape, drafts, edits for directness, and reconciles the result against the inventory. New facts belong to enrichment. A style-only revision may reword claims but cannot add or remove them.

# Why this exists

The first OKF capability suite improved task routing, evidence, safety, and review. It did not improve the prose method itself. An agent could produce a conformant, well-sourced concept that still opened with generic framing or repeated its conclusion. The same concept could hide its value behind feature description, or flatten reasoning into decorative lists.

Generic editing instructions are unsafe for knowledge work. A request to make prose shorter can remove a qualifier, citation, example, formula, or operational constraint. OKF Writing makes preservation the first gate. The user sees whether wording changed or knowledge changed before the proposal reaches staging.

# Shared writing contract

Studio delivers the versioned `writing` resource only to capabilities that produce concept prose. It tells the agent to:

- lead with the answer to the reader job
- distinguish sourced facts, user decisions, inferences, and unknowns
- preserve exact technical, legal, standards, formula, code, and quotation language
- use prose, tables, definitions, task lists, diagrams, or formulas according to the shape of the knowledge
- remove generic framing, repeated conclusions, vague authority, inflated significance, and decorative structure
- reconcile every claim after editing.

These are writing rules, not OKF conformance rules. The agent matches the bundle language and house style. Phrase matches are review clues and never automatic deletion instructions.

# Writing diagnostics

[Knowledge Health](knowledge-health.md) has an advisory `writing` category. The first rules find generic openers and closers, empty or excessively deep headings, repeated adjacent paragraphs, and repeated bold-label bullets. Every result carries a stable rule ID, version, concept path, evidence excerpt or count, heuristic basis, and suppression fingerprint.

Writing findings cannot block opening or validation. They identify passages worth reviewing. Quotations, standards text, checklists, reference indexes, and deliberately repeated warnings remain valid exceptions.

# Claim-preserving review

Agents return a `writing-revision` artifact bound to the current bundle fingerprint. It names the reader job, purpose, revision mode, concept paths, sources, and claim ledger. Each claim is `unchanged`, `reworded`, `added`, or `removed`.

Rust rejects a writing revision with no concept path or claim ledger. It also rejects added claims without a source and rejects added or removed claims from a `style-only` revision. Reworded and unchanged ledger entries carry their before and after text. Rust compares protected numbers, qualifiers, citation markers, link targets, formulas, and inline code before the artifact can render as trusted work. Existing staged-write validation remains responsible for the final file diff, frontmatter, links, citations, and Apply boundary.

The work surface labels a revision **Wording only** when its ledger contains no added or removed claims. Otherwise it labels the proposal **Knowledge changes included**. The claim ledger stays visible beside sources, citations, deterministic checks, and the per-hunk staged review.

# Recovery

An unavailable provider leaves the writing request and selected context intact so the user can retry or select another connected agent. An invalid claim ledger stays ordinary conversation text and names the failed boundary. It never becomes trusted work. The agent must regenerate a stale revision against the current bundle fingerprint. A conflict returns to the existing per-hunk staged review rather than replacing newer bundle content.

The user can suppress writing findings by their stable fingerprint when exact or repeated language is intentional. Suppression hides that instance, not the rule globally. Interrupted review does not apply any text: the staged revision remains behind the existing validation and Apply boundary.

# Independent writing critic

Studio Agent can run the optional critic in the existing isolated no-tool session. A writing revision changes the critic contract from general artifact coverage to clarity, redundancy, structure, voice fit, and claim preservation. The critic cannot edit, stage, approve, apply, fetch, or clear a deterministic failure.

# Evaluation

The frozen [OKF agent benchmark](../architecture/agent-benchmarking.md) adds seven writing cases across product rationale, metrics, runbooks, architecture, decisions, API reference, and source-derived policy. Each case records its reader job, required knowledge, qualifiers, citations, links, and unsupported claims. The model-free gate fails polished output that drops required knowledge.

Live provider reports must retain results for the same cases and a blinded pairwise review. A completed writing evaluation passes only when every hard preservation check succeeds and human preference reaches the frozen threshold. The report records an unconfigured provider as unavailable, with no invented measurements.

# Isolation and verification

`AgentArtifactWorkspace` has wide and narrow `writing-revision` stories. They verify the wording-versus-knowledge summary, claim-ledger heading, evidence display, and bounded layout through Storybook MCP. Component tests cover the same semantic distinction. Rust tests cover stable advisory findings, style-only claim rejection, source requirements, and the isolated writing-critic prompt.

Related work: [Native OKF Tasks](native-okf-tasks.md), [Structured Agent Work](structured-agent-work.md), [Declarative OKF Capability Packs](capability-packs.md), and the [OKF Writing Quality](../product/okf-writing-quality-roadmap.md) roadmap.
