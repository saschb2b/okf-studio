---
type: Reference
title: Retrieval Schema Adapters
description: Provider-neutral retrieval manifest and receipt fields, with mappings for the built-in local engine and an external vector store.
tags: [reference, retrieval, jsonl, adapters, vector-store]
generated: { by: claude/unrecorded, at: 2026-07-19T14:00:00Z }
---

# Purpose

The retrieval manifest is the interchange boundary, not a commitment to one search library or vector database. Every exported JSONL line represents one coherent OKF section and keeps the identity needed to resolve a result back to visible bundle text. An adapter may add provider-specific vectors or index fields in disposable storage, but it must return the original section identity and content hash.

# Unit contract

Required identity fields are `schemaVersion`, `bundleId`, `bundleFingerprint`, `conceptId`, `sectionId`, `contentHash`, `structuralOrdinal`, `headingPath`, and `sourceRange`. Search fields include concept title, type, tags, section text, citations, links, backlinks, resource, timestamp signals, token estimate, and health caveats.

An adapter must not write provider IDs, vectors, summaries, scores, or inferred relationships into the source bundle. Absolute filesystem paths and credentials are not part of the manifest.

# Built-in local adapter

The shipped engine reads the manifest directly in Rust. It indexes exact identity fields separately from tokenized title, heading, tag, type, citation, and section text fields. Deterministic BM25 scores are combined with exact-field and authored-graph scores. Results return `sectionId`, score components, matched terms, relationship path, and an exclusion reason when not selected.

This is the reference behavior. It needs no model, account, network call, vector database, or separate service.

# External vector-store mapping

An external adapter such as Qdrant can map one manifest unit to one point:

| Vector-store field | Manifest source |
| --- | --- |
| point ID | stable hash of `bundleFingerprint` and `sectionId` |
| vector input | section text plus bounded title and heading path |
| `bundle_id` | `bundleId` |
| `bundle_fingerprint` | `bundleFingerprint` |
| `concept_id` | `conceptId` |
| `section_id` | `sectionId` |
| `content_hash` | `contentHash` |
| `type` | concept type |
| `tags` | tags |
| `timestamp` | timestamp signal, never silent authority |

Candidate queries must filter the exact bundle and fingerprint before similarity ranking. The adapter returns identities and scores to Studio; Studio still performs bounded fusion, coherent context compilation, omission accounting, and receipt generation. A point from another fingerprint or grant scope is rejected rather than silently reused.

# Activation boundary

The mapping above is a published adapter contract, not an active hosted integration. A configured external provider must disclose endpoint, embedding identity, dimensions, normalization, text scope, and remote transfer before activation. Until a provider passes the frozen semantic benchmark, receipts report dense retrieval as unavailable and the complete local route remains in use.

See [Retrieval Engine](../architecture/retrieval-engine.md) for pipeline ownership and [Retrieval Operations](../product/retrieval-intelligence/retrieval-operations.md) for invalidation and removal.
