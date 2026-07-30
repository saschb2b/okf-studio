---
type: Feature
title: Safe Concept Move
description: Relocate a concept with parser-confirmed link repairs, a portable redirect, isolated validation, reviewed Apply, and Restore.
tags: [feature, maintenance, identity, links, navigation, staging]
generated: { by: claude/unrecorded, at: 2026-07-28T02:10:00+02:00 }
---

# User job

A maintainer wants to reorganize a bundle without breaking inbound links, outgoing relative links, navigation indexes, or citations. A reader tab that still points to the old path has to keep working too. The Concept Reader exposes **Move** in the header's [More concept actions](concept-reader.md) menu, beside Retire. The maintainer enters a bundle-relative Markdown destination and reviews the complete graph change before any file changes.

# Move plan

Rust reads only the parsed concept and the authored index and log Markdown inside the granted bundle. The per-file, file-count, and total-text limits match reviewed staging. The pure planner runs five steps:

1. It validates the source and destination, including traversal, collision, UTF-8, space, case, and `index.md` rules.
2. It creates the destination with the source content and rebases its parser-confirmed outgoing links.
3. It rewrites parser-confirmed inbound inline links and reference definitions, including authored indexes and citations.
4. It replaces the old concept with an explicit `Redirect` concept pointing to the destination.
5. It reports every affected file, link, index, and stable-identity warning.

The redirect keeps the old path useful for tools that did not observe the move. It is ordinary portable Markdown, not a hidden alias table. The move carries a bounded optional `stable_id` extension across with the concept, and the impact summary shows it. Missing or duplicate stable identity produces a warning, not an OKF validation error.

# Review and write boundary

The plan enters the same in-memory staged tree used by agent and Compatibility Clinic changes. The maintainer must open every file diff and explicitly keep every hunk. Reject marks the plan incomplete, because a move is one graph transaction. The Rust validation command enforces the same rule instead of trusting the interface. Studio then validates the isolated tree. Apply accepts only the reviewed validation revision, rechecks every disk base and path, and changes all files in one restorable transaction.

The source bundle remains unchanged while planning, diffing, and validating. Apply and Restore are explicit user actions. The maintainer can restore a successful Apply while the checkpoint still matches the applied files. Integrated Git shows the resulting create and modifications.

# Failure states

- Studio rejects an existing exact or case-insensitive destination.
- Studio rejects traversal, absolute paths, control characters, non-Markdown destinations, and `index.md` destinations.
- Studio rejects a case-only path change, because a portable redirect and destination cannot coexist on a case-insensitive filesystem.
- Symbolic links, changed disk bases, oversized files or plans, truncated diffs, stale revisions, and validation errors stop Apply.
- Studio reports a move affecting more than 64 files as too broad for one reviewed transaction.

# Verification

Pure fixtures cover spaces, percent encoding, UTF-8, inbound and outgoing links, reference definitions, root and nested indexes, collisions, traversal, case-only changes, and missing identity. Native tests prove that staging leaves disk unchanged, that review is mandatory, that validation runs in isolation, and that Apply updates all files. They also prove that Restore removes the created destination and restores every original.

Related behavior: [Concept Reader](concept-reader.md), [Navigation](navigation.md), [Validation](validation.md), [Integrated Git](integrated-git.md), and [IPC and Security](../architecture/ipc-and-security.md).
