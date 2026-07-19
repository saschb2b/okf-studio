---
type: Architecture Decision
title: Retrieval Engine
description: A revision-bound, provider-neutral retrieval pipeline shared by ordinary chat, Studio Agent, and granted MCP clients.
tags: [architecture, retrieval, rust, agents, mcp, privacy]
timestamp: 2026-07-19T23:15:00Z
---

# Decision

`okf-core` owns retrieval semantics. It builds a deterministic structural manifest from the parsed bundle, classifies a query, executes one bounded route, compiles an evidence packet, and emits a retrieval receipt and diagnostic. Tauri authorizes the bundle root and persists disposable manifest files in app cache. React renders the result but does not rank content or read the filesystem.

The same core result feeds ordinary Agent Panel prompts, the native Studio Agent tool loop, and the read-only `okf_retrieve` MCP tool. Provider-specific embeddings, rerankers, and caches may contribute through typed states, but they do not change the evidence or security schema.

# Why this boundary exists

Search and traversal were previously separate primitives. Agents had to orchestrate them in prompts, which made evidence selection provider-dependent and impossible for Studio to explain. Keeping retrieval in React would also expose source handling and cache authority to the webview. Binding the feature to one hosted vector service would make offline use and provider choice secondary paths.

A shared Rust pipeline makes exact ranking, grant enforcement, source identity, budgeting, and failure classification deterministic. Optional providers can improve a measured query class without becoming the definition of retrieval.

# Pipeline

1. Rust reads only the already authorized bundle through the existing parser.
2. The manifest builder splits Markdown at structural boundaries and preserves tables, lists, code, citations, heading ancestry, and source lines.
3. Query classification chooses an exact, lexical-graph, coverage, temporal-conflict, structured, full-context, or hybrid-fallback route.
4. Candidate generators score exact fields, deterministic BM25 terms, authored graph context, coverage, and supported authority signals.
5. Filters run before final ranking. Every rejected or budget-omitted unit receives a stable reason.
6. The compiler deduplicates overlap, retains distinct conflicts, orders defining evidence before dependent context, and keeps whole units within the token budget.
7. Diagnostics classify the result and may produce advisory, review-only repair proposals.
8. Tauri persists the manifest as JSON and provider-neutral JSONL under a safe bundle and fingerprint identity in app cache.

# Routing boundary

The agent does not choose the search method. `okf-core` classifies the question before any prompt is sent and records the reason in the receipt. Exact identities win first, followed by relationship, time, structured-data, full-bundle, overview, semantic, and direct factual intents; only a question that fits none of those stable classes uses the local text-and-links fallback. An explicit method selected in Evidence Lab overrides classification for that diagnostic run only.

The frozen corpus includes ordinary phrasing such as “What is this repository about?”, “Give me a summary of this bundle”, “What is the Revenue metric?”, and “What changed in the retention policy?”. Each case asserts both the chosen route and minimum evidence recall. This keeps routing deterministic while preventing most everyday questions from collapsing into one vague fallback. It does not claim that the classifier is perfect: new rules need a labeled case and a retrieval result before they ship.

# Identity and invalidation

A section ID derives from concept ID, heading ancestry, structural ordinal, and content hash. The bundle fingerprint binds the complete ordered manifest. A content change therefore creates a new revision identity without mutating authored files. Cache and snapshot scope include the manifest fingerprint and bundle grant set; a different revision or scope cannot reuse them.

The cache is disposable. Failure to publish it does not block retrieval or ordinary reading. Reopening or changing a bundle rebuilds from source, and removing the cache cannot remove knowledge.

# Conflict boundary

Studio raises a conflict caveat conservatively. Different text under a generic heading such as `Why`, `Overview`, or `Decision` is not enough: those sections may describe unrelated concepts. A conflict requires different content from distinct concepts with the same normalized concept title and section heading, and every participating concept must carry an independent resource or citation identity. This catches separately sourced definitions of the same subject without presenting ordinary variation across the bundle as an error.

The rule deliberately favors silence over a speculative contradiction claim. Retrieval retains all selected excerpts either way; the caveat only changes when Studio may tell the user that sources disagree and require the answer to remain unsettled.

# Provider contract

Dense retrieval and reranking have `local`, `configured`, `unavailable`, `degraded`, and `cancelled` states. A receipt records the provider ID, capability, disclosure state, and whether text left the device. No remote text is sent by the shipped baseline. A semantic question falls back to local lexical and graph stages.

Full-context eligibility considers canonical snapshot size, declared provider window, scope, cache capability, and privacy. Cache creation remains unavailable when a provider does not advertise an exact, fingerprint-bound prefix or KV contract. The receipt names that state and falls back without rewriting the query.

# IPC and MCP

`retrieve_okf_context` accepts a typed request and returns the manifest summary, evidence packet, receipt, diagnostic, and repair proposals. `diff_okf_retrieval_receipts` compares two receipts without source access. `export_retrieval_diagnostics` writes a user-selected redacted JSON file after validating its basename, size, and JSON structure.

`okf_retrieve` exposes the same local engine through Studio Agent and the one-shot granted MCP server. Its output is bounded, contains no absolute path or credential, and never shares text remotely. The `okf-foundation@1.3.0` pack adds a focused retrieval method and makes inspect, research, and change-impact methods use coherent retrieval before broader reads.

# Security and trust

- Relevance cannot create or widen a bundle grant.
- Source text remains untrusted evidence when attached to an agent prompt.
- Receipts distinguish Studio selection from any claim that a model used the evidence.
- Authored links, derived graph paths, ranker scores, timestamps, and authority hints remain different evidence classes.
- Repair proposals cannot call Apply and cannot write directly from a manifest, receipt, or diagnostic.

The user-facing behavior is defined in [Retrieval Intelligence](../features/retrieval-intelligence.md). Rebuild and rollback behavior is in [Retrieval Operations](../product/retrieval-intelligence/retrieval-operations.md).
