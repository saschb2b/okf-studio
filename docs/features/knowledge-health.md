---
type: Feature
title: Knowledge Health
description: Give agents deterministic, revision-bound evidence about bundle quality without turning heuristics into OKF conformance rules.
tags: [feature, agents, health, validation, graph, provenance]
timestamp: 2026-07-23T15:45:00Z
---

# What it does

The [Agent Panel](agent-panel.md) can audit more than the one hard OKF rule without asking a model to invent its own quality criteria. A Rust-owned engine analyzes the parsed bundle and reports eight categories: conformance, graph connectivity, navigation, provenance, freshness signals, duplication, coverage hints, and advisory writing patterns.

This engine does not decide whether a bundle may open. [Validation](validation.md) remains the exact OKF v0.1 conformance surface, and tolerant consumption remains unchanged. Health adds evidence for agent work after the bundle is already readable.

# Why this exists

OKF conformance deliberately has one small hard rule. That tolerance keeps thin and producer-defined bundles readable, but it leaves graph isolation, stale provenance, duplicate concepts, and missing navigation outside the validator. Asking each agent to infer those quality criteria produced inconsistent audits and risked presenting optional guidance as a format error.

Knowledge Health gives every provider the same revision-bound evidence before it reasons about repairs. It separates facts from heuristics and supplies stable finding identities, so repeated audits can be compared, dismissed findings can remain dismissed, and deterministic repairs do not depend on model phrasing. The user gets a quality view without losing OKF's tolerant-consumer contract.

# Finding contract

Every finding carries:

- a stable rule ID and independent rule version;
- severity, category, and an explicit `fact` or `heuristic` basis;
- a plain explanation of why the finding exists;
- bounded evidence fields and affected concept IDs;
- `deterministic`, `guided`, or `not-repairable` repairability;
- a suppression fingerprint that survives unrelated bundle edits; and
- the fingerprint of the complete bundle revision that was analyzed.

Conformance findings are always facts copied from the existing validator. Missing optional metadata, isolation, title similarity, and other quality signals never become conformance errors.

The writing category finds observable patterns such as generic framing, empty headings, repeated adjacent paragraphs, and repeated bold-label bullets. Each is a heuristic with a path and evidence excerpt or count. These findings support the explicit [OKF Writing](okf-writing.md) workflow and never become a readability score, word blacklist, or validity gate.

The freshness category also evaluates authored [Reliability and Lifecycle](reliability-and-lifecycle.md) signals. Unknown lifecycle values and confidence outside 0 to 1 are facts about malformed profile metadata. A bounded linear graph pass finds supersession cycles and refuses to choose a terminal replacement. Missing reliability metadata creates no finding.

# Agent tools

Four read-only tools provide progressive disclosure:

1. `okf_health_summary` filters and pages compact finding summaries and returns the bundle fingerprint.
2. `okf_health_finding` returns one rule's evidence and rationale.
3. `okf_health_affected` pages bounded metadata for concepts named by that finding.
4. `okf_health_repair` returns an exact read-only recipe only for deterministic rules. Guided findings return no invented edit.

The detail tools require the summary's exact fingerprint. Native tools reparse the canonical bundle root for each call. The ACP MCP server also refreshes health snapshots from its root and checks the revision again after analysis. A live-reload change therefore invalidates the request instead of returning stale evidence. Any later edit still uses [reviewed staging](agent-panel.md#context-tools-and-writes).

# Bounds

The initial engine accepts at most 10,000 concepts and 50,000 intra-bundle links, including unresolved targets. Analysis runs in Rust outside the webview and performs no model or network call. A bundle above either analysis limit still opens normally; only the health request asks the user or agent to narrow or partition the work.

# Verification

The frozen [agent benchmark corpus](../reference/specialized-agent-systems.md#structured-work-and-verification) must produce the same ordered findings on repeated runs. Tests also cover the exact 10,000-concept and 50,000-link boundary, tolerant malformed bundles, deterministic repair recipes, and stale-fingerprint rejection after a file change.

Artifact-level checks reuse the same principle without pretending every heuristic is conformance. [Artifact Verification and Critic Passes](artifact-verification.md) keeps deterministic completion blocks separate from optional model critique and shows disagreement rather than letting one result overwrite the other.
