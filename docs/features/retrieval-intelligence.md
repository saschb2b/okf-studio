---
type: Feature
title: Retrieval Intelligence
description: Route bundle questions through local structural retrieval, preserve coherent evidence, and expose every selection through an inspectable receipt.
tags: [feature, retrieval, agents, context, evidence, diagnostics]
timestamp: 2026-07-23T15:45:00Z
---

# What it does

Every ordinary Agent Panel question can use a Rust-owned retrieval pass over the active granted bundle before it reaches the selected agent. Studio classifies the question, chooses a local route, compiles coherent sections into a bounded evidence packet, and attaches that packet with stable concept and section identities. The agent does not need its own chunker or unrestricted filesystem access.

The generated attachment carries the lowercase SHA-256 digest of the exact Markdown sent through the prompt boundary. The retrieval receipt remains a separate identity and is never substituted for this content digest.

The answer turn shows one compact evidence receipt with the excerpt count, search method, and an Inspect action. It adds a plain status only when the evidence is incomplete, conflicting, stale, unavailable, or shared remotely. The answer does not append an `Evidence`, `Sources`, concept-path, or receipt-ID footer because Inspect already owns that provenance. A concept or external citation may still appear inline when it helps the reader understand a claim. Internal generation instructions such as the abstention flag never appear in the conversation.

Opening the receipt replaces the conversation viewport with an inspector organized around three user questions: whether the evidence supports the answer, which sources were used, and what to do when those sources disagree. Conflicting sources are marked directly. Raw ranking, optional provider state, receipt identity, and other implementation detail stay collapsed under **Technical details**. **Search evidence again** states that it updates the evidence view without resending the prompt or rewriting the answer. The retained transcript is removed from layout while the inspector is open, so the two surfaces cannot overlap. Closing the inspector restores the conversation, draft, scroll position, and focus.

The separate **Evidence Lab** is available from the thread actions menu. It states that it does not contact an agent, rewrite an answer, or change the bundle. The primary flow is question, trust outcome, and source review. Search-method options, comparisons, technical export, and advisory bundle improvements appear progressively. A compared evidence set can become the Lab's current result, but only the existing reviewed-write workflow can apply a proposed knowledge change.

# Why this exists

Before this feature, Studio exposed search, graph traversal, and concept reads, but left each agent to decide how to combine them. Two agents could receive different evidence for the same question, and a confident wrong answer gave the user no way to tell whether retrieval, filtering, context assembly, or generation had failed. Adding a vector database alone would not solve that trust gap and would make an optional provider part of the product's foundation.

Retrieval Intelligence makes evidence selection a Studio contract. Exact identities remain stronger than similar prose, authored links can supply bounded relationship context, tables stay intact, conflicts remain visible, and every omitted candidate has a reason. The result is useful offline and reproducible across agents. Optional dense, reranking, long-context, and provider-cache capabilities are represented honestly as configured, degraded, or unavailable; their absence never disables the local path. Granting remote disclosure does not mark text as shared: the receipt does so only after provider work actually runs.

# Routes

| Route | Best fit | Local behavior |
| --- | --- | --- |
| Exact wording | IDs, titles, headings, tags, types, citations, short factual lookups | Field-weighted exact scoring followed by deterministic BM25 |
| Related concepts | Dependency, impact, neighborhood, and path questions | Exact and lexical candidates plus bounded links and backlinks |
| Across the bundle | Themes and corpus-wide questions | Balances direct evidence across concepts and types |
| Current and conflicting claims | Current-state, changed-since, ownership, and competing claims | Applies supported metadata filters and retains unresolved conflicts |
| Tables and fields | Tables, fields, schemas, and numeric evidence | Keeps table headers and rows together |
| Full bundle | Small granted bundles that fit the declared context window | Uses one canonical, fingerprinted manifest snapshot |
| Text and related concepts | Semantic or mixed questions without an optional provider | Combines deterministic lexical and graph evidence and names the fallback |

Studio, not the selected agent, chooses the automatic route before sending the prompt. Natural overview, summary, definition, explanation, and change questions have labeled benchmark cases; the receipt explains the resulting method. Questions that match no narrower intent use **Text and related concepts** instead of presenting the vague label “Broader local search”. Route selection never changes the bundle grant. A remote provider may receive text only after explicit configuration and disclosure. The shipped baseline makes no remote retrieval call.

# Evidence and receipts

A retrieval unit carries the bundle fingerprint, concept ID, deterministic section ID, heading path, source-line range, content hash, type, tags, links, backlinks, citations, timestamp and [reliability](reliability-and-lifecycle.md) signals, token estimate, and health caveats. Context compilation keeps units intact instead of cutting them at arbitrary token boundaries. The receipt identity binds filters, limits, provider choices, provider window, and disclosure as well as query, route, budget, and bundle revision, so two materially different searches cannot appear to be the same run.

The versioned receipt records:

- the query class, route, and route reason;
- every ranked candidate and its exact, lexical, graph, coverage, and authority scores;
- inclusions, exclusions, matched terms, relationship paths, and filters;
- estimated context use, whole-unit budget omissions, and elapsed time;
- bundle, manifest, cache-scope, and receipt fingerprints; and
- dense, reranking, and cache provider states, including whether remote text was shared.

The inspector opens a concept at its visible source identity. The redacted diagnostic export retains identities, decisions, scores, caveats, and repair proposals but removes retrieved section text.

# Failures and abstention

The shipped local pass distinguishes ready evidence, empty results, filter mismatch, route-relevant missing metadata, independently sourced conflicts, budget omissions, and requested provider failure. Low recall and noisy candidates require task-specific ground truth; stale evidence requires a retained receipt from an older fingerprint; generation non-use requires answer-citation telemetry. The schema and UI can represent those evaluation states, but the local pass does not fabricate them from an arbitrary score threshold. A missing local retrieval result does not block the user's message: Studio names the degraded send and continues without automatic bundle evidence.

When required authority or current evidence is absent, independently sourced concepts make different claims about the same subject and section, or included evidence declares a conflict or non-current lifecycle state, the evidence packet requires abstention. Uncertain confidence produces a caveat without claiming the assertion is objectively unreliable. A missing optional timestamp or reliability field does not affect an ordinary lookup, but a time-sensitive answer stays qualified when its concepts provide no timestamp, effective time, or supersession signal. A reused generic heading on unrelated concepts is not treated as a conflict. The flag instructs the agent not to present an unsupported claim as settled; it is not a user error. The conversation translates it into a status such as **Conflicting evidence** or **No supporting evidence**, while the inspector and native agent tool expose the bounded caveat. A rank, profile value, or file timestamp never silently becomes authority.

# Reviewed repair

Retrieval diagnostics currently propose only a missing description or directly observed broken link. They do not ask every unsourced concept for a citation merely because it appeared in an answer. The proposal includes its evidence sections, triggering query, held-out queries, and expected improvement. Selecting it only prepares an author or enrich request. Existing claim-ledger, staging, validation, hunk review, Apply, restore, and before-and-after receipt comparison remain authoritative; retrieval state cannot write to the bundle.

Related contracts: [Retrieval Engine](../architecture/retrieval-engine.md), [Retrieval Experience Contract](../product/retrieval-intelligence/retrieval-experience-contract.md), and [Retrieval Operations](../product/retrieval-intelligence/retrieval-operations.md).
