---
type: Doctrine
title: Memory discipline
description: Durable knowledge lives as typed single-fact files behind an index, deduplicated on write, verified on recall, and never duplicating what the repo already records.
tags: [memory, knowledge]
timestamp: 2026-07-16T10:00:00Z
---

# The shape

Durable memory is a directory of markdown files, one fact per file, each with frontmatter (a slug, a one-line description used for recall, a type) and a short body that carries the fact plus why it matters and how to apply it. A single index file holds one pointer line per memory and is the only thing loaded eagerly; the facts load on demand. This is progressive disclosure applied to the agent's own knowledge, the same shape [context economy](/context-economy.md) demands of everything else. It is no coincidence that the shape is an OKF-style bundle: typed markdown behind an index is how agent-readable knowledge travels.

The types keep recall honest:

user
: Who the user is; role, expertise, standing preferences.

feedback
: Guidance the user gave on how to work, corrections and confirmed approaches, always with the why.

project
: Ongoing goals and constraints not derivable from the code or its history, with relative dates converted to absolute.

reference
: Pointers to external resources (dashboards, tickets, URLs).

# Write discipline

- **One fact, one file.** A file that accumulates loosely related facts becomes unciteable and impossible to invalidate precisely.
- **Deduplicate before saving.** If an existing memory covers the fact, update it; do not mint a near-duplicate that will later disagree with it.
- **Delete what proved wrong.** A falsified memory is worse than none; it re-injects the error into every future session.
- **Do not store what the repo records.** Code structure, past fixes, git history, and project instructions are already durable and already authoritative. A memory copy of them can only drift. Store the non-obvious residue: the why behind a decision, the constraint that never made it into a file.
- **Link facts to facts.** Related memories reference each other by slug, so recall of one surfaces its neighbors.

# Recall discipline

A recalled memory is a point-in-time observation, not live state. Before recommending a file, flag, or command a memory names, verify it still exists and still behaves as described; the repo may have moved on since the memory was written. Asserting a stale memory as current fact fails [verification gates](/verification.md) exactly the way an unexercised code change does, and the report of anything memory-derived still owes its provenance per [faithful reporting](/reporting.md).
