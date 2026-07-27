---
type: Feature
title: Retirement Workflow
description: Deprecate, redirect, tombstone, or delete a concept through one impact-aware, reviewed, restorable graph transaction.
tags: [feature, maintenance, lifecycle, retirement, deletion, staging]
generated: { by: claude/unrecorded, at: 2026-07-23T16:15:00Z }
---

# User job

A maintainer needs to stop readers and agents from treating a concept as current without leaving an unexplained gap in the graph. The Concept Reader exposes **Retire** beside **Move**. Before any file changes, the maintainer chooses the intended outcome, names the reason and decision date, and sees the affected links, indexes, files, and retrieval consequence.

# Four explicit outcomes

| Choice | What remains | Retrieval behavior |
| --- | --- | --- |
| **Deprecate** | The original concept and claims, marked `lifecycle: deprecated` with the date, reason, and optional replacement. | The concept remains searchable and every included excerpt carries a lifecycle caveat. |
| **Redirect** | A portable Markdown `Redirect` concept at the old identity. Parser-confirmed inbound links and indexes point to the required replacement. | New paths lead to the replacement while old links still explain where the concept went. |
| **Tombstone** | The identity, retirement date, reason, optional replacement, and a short explanation. Former claims are removed. | Retrieval can explain the retirement but cannot reuse the former claims. |
| **Delete** | No source concept file. Parser-confirmed inbound links and indexes point to the selected replacement. | The concept leaves the active bundle. A replacement is required while inbound Markdown links remain. |

The choice is semantic, not cosmetic. Studio never infers delete from a lifecycle field or silently turns a broken reference into a redirect. Deletion requires a separate acknowledgement in the interface. A selected replacement must be another concept in the same live bundle.

# Deterministic impact plan

Rust reads the bounded live Markdown inside the exact granted bundle and derives the plan. The frontend supplies the choice, concept identity, replacement identity, plain-text reason, and ISO decision date; it never supplies replacement file content. The planner:

1. verifies the concept and replacement still exist;
2. finds parser-confirmed inbound links and authored indexes;
3. derives the source modification or deletion and every safe link rewrite;
4. states the retrieval consequence and any typed-relationship warning; and
5. adds a dated **Retirement** entry to `log.md`, creating the log only when needed.

Deprecate and tombstone keep inbound links because the identity remains meaningful. Redirect and delete rewrite confirmed inline links and reference definitions. Unknown profile annotations remain preserved and visible; Studio warns when typed relationships may still name the retired concept instead of guessing how a producer-specific field should change.

# Review, Apply, and Restore

Every derived create, modification, and deletion enters the same complete-file staged tree as [Safe Concept Move](safe-concept-move.md). Each file diff must be opened and every hunk explicitly kept. Rejecting one hunk blocks validation because retirement is one graph transaction, not a menu of unrelated edits.

Validation runs against an isolated mirror where a selected deletion is actually absent. Apply is revision-bound, rechecks the disk base, moves existing files through private transaction backups, and commits all selected files atomically. A durable checkpoint records both present and absent applied states, so Restore can recreate a deleted file byte-for-byte even after the staging service restarts. [Integrated Git](integrated-git.md) then shows the same modifications and deletion in the ordinary repository diff.

# Bounds and failure states

- A missing, self-referential, or out-of-bundle replacement is rejected.
- Redirect always requires a replacement. Delete requires one while backlinks remain.
- Empty, control-bearing, or longer-than-1,024-character reasons are rejected; the decision date must use `YYYY-MM-DD`.
- Symbolic links, non-regular files, protected paths, changed disk bases, stale revisions, truncated diffs, validation errors, and plans over the reviewed-write file or byte limits stop Apply.
- Opening, planning, diffing, and validating do not change the source bundle.
- Restore stops if an applied file has changed externally, preserving that newer work.

# Verification

Pure fixtures cover all four outcomes, retrieval consequences, inbound and index impact, log creation, and refusal to delete a cited concept without a replacement. Native integration applies a deletion with rewritten links and a new log, then restores all original files and removes the created log. A separate restart test proves a persisted deletion checkpoint recreates the deleted bytes. Browser integration covers the complete deprecation review, validation, Apply, and Restore journey; stories cover choice and narrow destructive-review states.

Related behavior: [Reliability and Lifecycle](reliability-and-lifecycle.md), [Concept Reader](concept-reader.md), [Validation](validation.md), [Integrated Git](integrated-git.md), and [IPC & Security](../architecture/ipc-and-security.md).
