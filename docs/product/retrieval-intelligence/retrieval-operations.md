---
type: Runbook
title: Retrieval Operations
description: Rebuild, diagnosis, provider removal, cache cleanup, migration, and rollback behavior for Retrieval Intelligence.
tags: [retrieval, operations, support, migration, cache, rollback]
generated: { by: claude/unrecorded, at: 2026-07-19T11:22:06Z }
---

# What is stored

Retrieval manifests and JSONL units are derived app-cache files under a versioned `retrieval-v1` directory. Their folder identities are hashes, not bundle paths. Receipts belong to conversation turns and diagnostic exports chosen by the user. No retrieval index, embedding, summary, or cache is written into an OKF bundle.

# Why the operational path matters

Derived retrieval state can become stale, corrupt, expensive, or unavailable while the source bundle remains healthy. Treating an index as the knowledge store would turn a recoverable cache problem into apparent data loss. Studio therefore makes bundle Markdown authoritative, keeps retrieval state disposable, and reports degraded operation instead of blocking reading or agent chat.

# Rebuild and live reload

A bundle fingerprint change creates a new manifest identity. The next query builds from the current parsed bundle and publishes the new manifest atomically when app cache is writable. An older receipt remains readable but is marked stale and can be rerun from its retained query and route. A failed cache write does not fail the retrieval result.

To force a rebuild, close Studio and remove only the `retrieval-v1` directory from the application's cache location. Do not remove the application data directory, credential store, bundle, or repository. The next query recreates the derived files.

# Provider removal and fallback

Removing or disabling an embedding, reranking, long-context, or cache provider invalidates only its derived state. Exact, lexical, graph, coverage, structured, conflict, and local hybrid routes remain available. Receipts name the missing capability and whether the local fallback ran. No provider credential is stored in a receipt or diagnostic export.

# Diagnose a miss

1. Open the turn's evidence summary and confirm the bundle fingerprint, route, filters, selected sections, and omissions.
2. Open Evidence Lab and compare the retained question with another search method.
3. Compare added and removed sections, exclusion changes, and token use.
4. Export the redacted diagnostic if the failure must be shared. Retrieved section text is omitted.
5. If the bundle itself is hard to retrieve, review an advisory repair. Do not edit merely to increase keyword count.

Empty results, filter mismatch, budget omission, conflict, and requested-provider failure have separate local recovery paths. A retained receipt becomes stale only when replay compares its fingerprint with a newer bundle revision; a fresh retrieval does not diagnose its own current manifest as stale. If automatic retrieval itself fails, Studio sends the user message without the evidence attachment and states that degradation beside the composer.

# Repair and rollback

Reviewing a repair prepares an existing author or enrich request with the diagnostic identity, affected query, expected improvement, and evidence section IDs. The normal structured artifact, claim ledger, staged revision, validation, hunk decisions, Apply transaction, and restore checkpoint remain in force. After a change, rerun the triggering and held-out queries and compare their receipts before claiming improvement.

Reject or restore a staged change when it adds unsupported claims, duplicates aliases, stuffs keywords, creates summary churn, or improves one query by damaging another. Removing retrieval cache files is always safer than editing bundle knowledge to accommodate a derived index.

# Upgrade behavior

The feature needs no bundle migration. Existing bundles acquire manifests only after a question is asked. Older app versions ignore the cache directory and the `okf-foundation@1.3.1` capability receipt. Rolling back the application may leave harmless derived cache files, which can be deleted as described above.
