---
type: Architecture Decision
title: OKF Agent Benchmarking
description: The frozen corpus, task contracts, deterministic merge gate, and opt-in provider evaluation for OKF-specialized agents.
tags: [architecture, agents, benchmarks, testing, evaluation]
timestamp: 2026-07-18T00:16:16Z
---

# Decision

OKF specialization is evaluated against a versioned local corpus before it is evaluated by impression. The corpus lives in `benchmarks/okf-agent/`. Its manifest binds each task to a frozen fixture, a stable capability ID, allowed Studio tools, a structured artifact kind, hard-failure conditions, and quality checks totaling 100 points.

The benchmark has two lanes:

1. The deterministic merge gate validates the manifest, fingerprints, parser outcomes, identities, links, conformance findings, and task-contract shape without a model or network connection.
2. Provider evaluation runs the same task contracts against explicitly selected agents and models. It is opt-in because credentials, provider availability, latency, and model output are not deterministic merge dependencies.

Provider output cannot redefine the expected parser facts. A fluent answer that invents a source, crosses a bundle boundary, bypasses reviewed staging, or violates another declared hard failure receives a failing result even when a model-based critic prefers the prose.

# Frozen corpus

The first corpus contains five checked-in bundles and one deterministic generated-scale specification:

| Fixture | Purpose |
| --- | --- |
| `conformant-linked` | Known metric lineage and a linked operational runbook |
| `thin-bundle` | One conformant fact with little optional metadata and no graph context |
| `disconnected-broken` | One missing target and one graph orphan |
| `malformed-tolerated` | Missing required metadata beside a producer-defined type that must survive |
| `conflicting-stale` | Contradictory definitions, unresolved ownership, and old evidence |
| `generated-scale` | A fixed 10,000-concept, 50,000-link performance boundary without a large checked-in tree |

Directory fingerprints hash sorted bundle-relative paths and bytes. The generated fixture hashes its complete generator declaration. A fixture edit therefore requires a deliberate manifest update and review.

# Task contract

The initial tasks cover inspect, create, enrich, audit, repair, cited research, change impact, and migration. A task declaration contains:

- one stable task and capability ID;
- one fixture revision;
- the expected structured artifact kind;
- the user prompt and bounded tool allowlist;
- explicit hard failures; and
- positive, uniquely named score checks totaling exactly 100 points.

The manifest checker rejects duplicate IDs, unknown fixtures, path traversal, symbolic links, changed fingerprints, unsupported fixture kinds, empty tool or failure sets, and invalid score totals. `okf-core` reads the same checked-in bundles and asserts their exact semantic facts. This keeps the harness independent from the parser while proving that the product can consume its evidence.

# Reports and privacy

Provider reports belong in app data, not in the source tree or the user's bundle. A report records app and benchmark versions, capability versions, fixture fingerprints, provider-reported agent and model identity, delivered resources, observed tools, artifact validation, hard failures, deterministic scores, timing, context and cost when reported, and unavailable cases. Studio does not upload evaluation data.

The report store, repeated shuffled runs, provider adapters, and model-judged checks are later SP0 implementation work. Until those exist, the repository gate proves corpus integrity and parser truth only; it does not claim agent quality.

# Commands

`pnpm test:agent-benchmarks` runs the Node contract tests and corpus check. `cargo test -p okf-core --test agent_benchmarks` runs the parser assertions. Both are local and network-free.

This contract implements the first stage of [OKF Agent Specialization](../product/agent-specialization-roadmap.md) and extends [Testing & Dogfooding](testing.md).
