---
type: Architecture Decision
title: OKF Agent Benchmarking
description: The frozen corpus, task contracts, deterministic merge gate, and opt-in provider evaluation for OKF-specialized agents.
tags: [architecture, agents, benchmarks, testing, evaluation]
timestamp: 2026-07-18T18:20:00Z
---

# Decision

OKF specialization is evaluated against a versioned local corpus before it is evaluated by impression. The corpus lives in `benchmarks/okf-agent/`. Its manifest binds each task to a frozen fixture, a stable capability ID, allowed Studio tools, a structured artifact kind, hard-failure conditions, and quality checks totaling 100 points.

The benchmark has two lanes:

1. The deterministic merge gate validates the manifest, fingerprints, parser outcomes, identities, links, conformance findings, and task-contract shape without a model or network connection.
2. Provider evaluation runs the same task contracts against explicitly selected agents and models. It is opt-in because credentials, provider availability, latency, and model output are not deterministic merge dependencies.

Provider output cannot redefine the expected parser facts. A fluent answer that invents a source, crosses a bundle boundary, bypasses reviewed staging, or violates another declared hard failure receives a failing result even when a model-based critic prefers the prose.

# Why this decision exists

General chat benchmarks and polished demos do not answer whether an agent performed correct OKF work. They rarely check bundle identity, citations, path safety, parser facts, or the reviewed-write boundary. Provider output also varies with model revisions and credentials, so making live model runs the merge gate would produce a slow and unreliable suite.

The split benchmark makes the stable part of quality measurable on every change and reserves provider comparison for explicit evaluation runs. Frozen tasks expose regressions in capability routing and artifact contracts. Honest unavailable results prevent missing credentials or integrations from becoming false passes. This gives specialization work an evidence base without coupling ordinary development to a vendor endpoint.

# Frozen corpus

The first corpus contains five checked-in bundles and one deterministic generated-scale specification. Manifest schema 2 also freezes critic cases that seed semantic defects, require resolvable artifact reference kinds, and prohibit critic authority over deterministic completion:

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

The task contracts cover inspect, create, enrich, audit, repair, cited research, change impact, migration, concept authoring, and meaning-preserving writing revision. A task declaration contains:

- one stable task and capability ID;
- one fixture revision;
- the expected structured artifact kind;
- the user prompt and bounded tool allowlist;
- explicit hard failures; and
- positive, uniquely named score checks totaling exactly 100 points.

The manifest checker rejects duplicate IDs, unknown fixtures, path traversal, symbolic links, changed fingerprints, unsupported fixture kinds, empty tool or failure sets, and invalid score totals. `okf-core` reads the same checked-in bundles and asserts their exact semantic facts. This keeps the harness independent from the parser while proving that the product can consume its evidence.

# Reports and privacy

Provider reports belong in app data, not in the source tree or the user's bundle. A report records app and benchmark versions, capability-pack identity and digest, capability versions, fixture fingerprints, provider-reported agent and model identity, delivered resources, observed tools, artifact validation, hard failures, deterministic scores, timing, context volume, tool-call and invalid-claim counts, and cost when reported. The report writer validates that every task and frozen fixture is present, publishes a new JSON file without overwriting an earlier run, and records unavailable work with zero measurements and no invented score. Studio does not upload evaluation data.

The provider matrix covers Studio Agent, Codex ACP, Claude ACP, and a local model. Each row classifies all ten OKF tasks as supported, degraded, or unavailable, names integration-specific limitations, and records the clean repository environment as unavailable when no endpoint, installation, or authentication exists. Missing credentials, adapter support, or model output never become a pass.

# Writing evaluation

`writing-corpus.json` freezes seven reader jobs across product rationale, a qualified metric, a runbook, an architecture boundary, an unresolved decision, an API reference, and source-derived policy. Every case records required fragments, citations, links, unsupported claims, a deliberately weak baseline, and a fact-preserving reference. The deterministic scorer checks required knowledge before advisory style patterns. A smoother sentence that loses `after settlement`, an API code, or a source reference fails.

The review contract uses blinded pairwise comparison over directness, coherence, concreteness, structure, voice fit, and usefulness. The preference threshold is frozen at 70 percent before provider evaluation. A completed provider report must include all seven cases, content hashes, zero unsupported claims, full retention of required knowledge, qualifications, citations, and links, plus a blinded comparison result at or above that threshold. Unavailable provider runs retain a reason and no case or review measurements.

Three artifact cases machine-score schema, bundle identity, citation references, concept identity, proposed paths, and hard safety violations. A fluent but unsafe case must fail. The same cases produce identical results in shuffled order. Seven journey contracts bind first use, an object action, federated search, artifact review, memory, routines, and OS entry to both a real Storybook export and an automated test. A renamed or removed journey surface therefore breaks the benchmark gate instead of silently narrowing completion coverage.

# Commands

`pnpm test:agent-benchmarks` runs the Node corpus, provider-matrix, report, artifact-scoring, and journey checks. `cargo test -p okf-core --test agent_benchmarks` runs the parser assertions. Both are local and network-free. `node scripts/okf-agent-benchmark.mjs record <report.json> <app-data-root>` validates and stores one explicitly produced provider report without replacing an earlier report.

`node scripts/okf-agent-provider-eval.mjs --provider <provider> --model <model> --output <path>` prepares the explicit live-evaluation ledger. It includes both writing runs in different case orders, every hard preservation requirement, and the frozen blind-review threshold. The ledger starts as `not-run`; generating it does not invoke a provider or claim a score.

This contract implements the first stage of [OKF Agent Specialization](../product/agent-specialization-roadmap.md) and extends [Testing & Dogfooding](testing.md).
