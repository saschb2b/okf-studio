---
type: Feature
title: Retrieval Intelligence
description: Route bundle questions through local structural retrieval, preserve coherent evidence, and expose every selection through an inspectable receipt.
tags: [feature, retrieval, agents, context, evidence, diagnostics]
timestamp: 2026-07-19T18:30:00Z
---

# What it does

Every ordinary Agent Panel question can use a Rust-owned retrieval pass over the active granted bundle before it reaches the selected agent. Studio classifies the question, chooses a local route, compiles coherent sections into a bounded evidence packet, and attaches that packet with stable concept and section identities. The agent does not need its own chunker or unrestricted filesystem access.

The answer turn shows one compact evidence summary. Opening it replaces the conversation viewport with an inspector that explains the route, selected sections, scores, relationship paths, omissions, provider state, context budget, and exact bundle fingerprint. Closing the inspector restores the conversation, draft, scroll position, and focus. The separate Retrieval Lab compares routes, diagnoses misses, exports a redacted receipt, and can hand an advisory repair to the existing reviewed-write workflow.

# Why this exists

Before this feature, Studio exposed search, graph traversal, and concept reads, but left each agent to decide how to combine them. Two agents could receive different evidence for the same question, and a confident wrong answer gave the user no way to tell whether retrieval, filtering, context assembly, or generation had failed. Adding a vector database alone would not solve that trust gap and would make an optional provider part of the product's foundation.

Retrieval Intelligence makes evidence selection a Studio contract. Exact identities remain stronger than similar prose, authored links can supply bounded relationship context, tables stay intact, conflicts remain visible, and every omitted candidate has a reason. The result is useful offline and reproducible across agents. Optional dense, reranking, long-context, and provider-cache capabilities are represented honestly as configured, degraded, or unavailable; their absence never disables the local path.

# Routes

| Route | Best fit | Local behavior |
| --- | --- | --- |
| Exact and lexical | IDs, titles, headings, tags, types, citations, short factual lookups | Field-weighted exact scoring followed by deterministic BM25 |
| Related concepts | Dependency, impact, neighborhood, and path questions | Exact and lexical candidates plus bounded links and backlinks |
| Bundle coverage | Themes and corpus-wide questions | Balances direct evidence across concepts and types |
| Current and conflicting | Current-state, changed-since, ownership, and competing claims | Applies supported metadata filters and retains unresolved conflicts |
| Structured evidence | Tables, fields, schemas, and numeric evidence | Keeps table headers and rows together |
| Full bundle | Small granted bundles that fit the declared context window | Uses one canonical, fingerprinted manifest snapshot |
| Local hybrid | Semantic or mixed questions without an optional provider | Combines deterministic lexical and graph evidence and names the fallback |

Route selection never changes the bundle grant. A remote provider may receive text only after explicit configuration and disclosure. The shipped baseline makes no remote retrieval call.

# Evidence and receipts

A retrieval unit carries the bundle fingerprint, concept ID, deterministic section ID, heading path, source-line range, content hash, type, tags, links, backlinks, citations, timestamp signals, token estimate, and health caveats. Context compilation keeps units intact instead of cutting them at arbitrary token boundaries.

The versioned receipt records:

- the query class, route, and route reason;
- every ranked candidate and its exact, lexical, graph, coverage, and authority scores;
- inclusions, exclusions, matched terms, relationship paths, and filters;
- estimated context use, whole-unit budget omissions, and elapsed time;
- bundle, manifest, cache-scope, and receipt fingerprints; and
- dense, reranking, and cache provider states, including whether remote text was shared.

The inspector opens a concept at its visible source identity. The redacted diagnostic export retains identities, decisions, scores, caveats, and repair proposals but removes retrieved section text.

# Failures and abstention

Studio distinguishes empty results, low recall, noisy candidates, filter mismatch, stale manifests, missing metadata, conflicting evidence, budget omissions, provider failure, and evidence that an answer did not use. A missing local retrieval result does not block the user's message: Studio names the degraded send and continues without automatic bundle evidence.

When required authority or current evidence is absent, or selected sources conflict without a supported rule, the evidence packet requires abstention. A rank or file timestamp never silently becomes authority.

# Reviewed repair

Retrieval diagnostics can propose a clearer title or description, an authored link, an index entry, a citation, a concept split, or another bounded knowledge repair. The proposal includes its evidence sections, triggering query, held-out queries, and expected improvement. Selecting it only prepares an author or enrich request. Existing claim-ledger, staging, validation, hunk review, Apply, restore, and before-and-after receipt comparison remain authoritative; retrieval state cannot write to the bundle.

Related contracts: [Retrieval Engine](../architecture/retrieval-engine.md), [Retrieval Experience Contract](../product/retrieval-intelligence/retrieval-experience-contract.md), and [Retrieval Operations](../product/retrieval-intelligence/retrieval-operations.md).
