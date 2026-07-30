---
type: Architecture Decision
title: OKF Agent Benchmarking
description: The frozen corpus, task contracts, deterministic merge gate, and opt-in provider evaluation for OKF-specialized agents.
tags: [architecture, agents, benchmarks, testing, evaluation]
generated: { by: claude/unrecorded, at: 2026-07-19T22:15:00Z }
---

# Decision

Studio evaluates OKF specialization against a versioned local corpus before anyone evaluates it by impression. The corpus lives in `benchmarks/okf-agent/`. Its manifest binds each task to a frozen fixture, a stable capability ID, and allowed Studio tools. It also binds a structured artifact kind, hard-failure conditions, and quality checks totaling 100 points.

The benchmark has two lanes:

1. The deterministic merge gate validates the manifest, fingerprints, parser outcomes, identities, links, conformance findings, and task-contract shape without a model or network connection.
2. Provider evaluation runs the same task contracts against explicitly selected agents and models. It is opt-in because credentials, provider availability, latency, and model output are not deterministic merge dependencies.

Provider output cannot redefine the expected parser facts. A fluent answer can invent a source, cross a bundle boundary, bypass reviewed staging, or violate another declared hard failure. That answer receives a failing result even when a model-based critic prefers the prose.

# Why this decision exists

General chat benchmarks and polished demos do not answer whether an agent did correct OKF work. They rarely check bundle identity, citations, path safety, parser facts, or the reviewed-write boundary. Provider output also varies with model revisions and credentials, so making live model runs the merge gate would produce a slow and unreliable suite.

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

The task contracts cover inspect, retrieval, create, enrich, audit, repair, cited research, change impact, migration, concept authoring, and meaning-preserving writing revision. Retrieval has its own conflict fixture contract, so adding `okf_retrieve` to adjacent capabilities cannot pass while the retrieval method itself remains unevaluated. A task declaration contains:

- one stable task and capability ID
- one fixture revision
- the expected structured artifact kind
- the user prompt and bounded tool allowlist
- explicit hard failures
- positive, uniquely named score checks totaling exactly 100 points.

The manifest checker rejects duplicate IDs, unknown fixtures, path traversal, symbolic links, and changed fingerprints. It also rejects unsupported fixture kinds, empty tool or failure sets, and invalid score totals. `okf-core` reads the same checked-in bundles and asserts their exact semantic facts. This keeps the harness independent from the parser while proving that the product can consume its evidence.

# Reports and privacy

Provider reports belong in app data, not in the source tree or the user's bundle. A report records app and benchmark versions, capability-pack identity and digest, capability versions, and fixture fingerprints. It also records provider-reported agent and model identity, delivered resources, observed tools, artifact validation, and hard failures. The last group is deterministic scores, timing, context volume, tool-call and invalid-claim counts, and cost when reported.

The report writer validates that every task and frozen fixture is present. It publishes a new JSON file without overwriting an earlier run. It records unavailable work with zero measurements and no invented score. Studio does not upload evaluation data.

The provider matrix covers Studio Agent, Codex ACP, Claude ACP, and a local model. Each row classifies all eleven OKF tasks as supported, degraded, or unavailable, and names integration-specific limitations. It records the clean repository environment as unavailable when no endpoint, installation, or authentication exists. Missing credentials, adapter support, or model output never become a pass.

# Writing evaluation

`writing-corpus.json` freezes seven reader jobs. They cover product rationale, a qualified metric, a runbook, an architecture boundary, an unresolved decision, an API reference, and source-derived policy. Every case records required fragments, citations, links, unsupported claims, a deliberately weak baseline, and a fact-preserving reference. The deterministic scorer checks required knowledge before advisory style patterns. A smoother sentence that loses `after settlement`, an API code, or a source reference fails.

The review contract uses blinded pairwise comparison over directness, coherence, concreteness, structure, voice fit, and usefulness. The preference threshold is frozen at 70 percent before provider evaluation. A completed provider report must include all seven cases, content hashes, and zero unsupported claims. It must retain the required knowledge, qualifications, citations, and links in full. It must also carry a blinded comparison result at or above that threshold. Unavailable provider runs retain a reason and no case or review measurements.

Three artifact cases machine-score schema, bundle identity, citation references, concept identity, proposed paths, and hard safety violations. A fluent but unsafe case must fail. The same cases produce identical results in shuffled order. Seven journey contracts cover first use, an object action, federated search, artifact review, memory, routines, and OS entry. Each binds to both a real Storybook export and an automated test. A renamed or removed journey surface therefore breaks the benchmark gate instead of silently narrowing completion coverage.

# Commands

`pnpm test:agent-benchmarks` runs the Node corpus, provider-matrix, report, artifact-scoring, and journey checks. `cargo test -p okf-core --test agent_benchmarks` runs the parser assertions. Both are local and network-free. `node scripts/okf-agent-benchmark.mjs record <report.json> <app-data-root>` validates and stores one explicitly produced provider report without replacing an earlier report.

`node scripts/okf-agent-provider-eval.mjs --provider <provider> --model <model> --output <path>` prepares the explicit live-evaluation ledger. It includes both writing runs in different case orders, every hard preservation requirement, and the frozen blind-review threshold. The ledger starts as `not-run`. Generating it does not invoke a provider or claim a score.

This contract implements the first stage of [OKF Agent Specialization](../product/agent-specialization-roadmap.md) and extends [Testing and Dogfooding](testing.md).
