---
type: Feature
title: Recipient Projections
description: Build a reviewed least-disclosure bundle for a named recipient without changing the source.
tags: [feature, privacy, sharing, access, review]
timestamp: 2026-07-23T22:30:00Z
audience: [maintainers, knowledge-owners]
sensitivity: public
---

# User job and value

A maintainer needs to share a useful subset of a bundle with a named recipient without editing, copying, and repairing Markdown by hand. Studio turns that job into two separate actions: review a deterministic plan, then choose where to write a new bundle.

The source bundle remains unchanged. The output is a normal OKF bundle that can be opened without Studio.

# Reviewed plan

The root folder home opens **Project bundle**. The maintainer names the recipient, provides optional recipient audiences, chooses the highest recognized sensitivity, decides whether concepts without a sensitivity hint are eligible, selects seed concepts, and may name exact text to redact.

Planning performs no filesystem write. Rust computes:

- explicitly selected concepts that pass the reviewed constraints;
- transitively linked concepts that pass the same constraints;
- every omitted concept and `.okfignore` path, with one exact reason;
- retained links that must point to the projection omissions note;
- broken links that already existed in the source;
- every occurrence of an exact reviewed redaction term;
- a destination folder name, source fingerprint, and plan revision.

The reviewer sees this complete plan before a destination picker opens. [Audience and sensitivity](access-hints.md) remain advisory. They guide this conservative copy operation but never grant access, prove classification, or change operating-system permissions.

# Export transaction

Export starts only from **Choose parent & export** and a Rust-owned native folder picker. Rust reauthorizes the exact source, recomputes the plan, and rejects a stale revision. It writes a temporary sibling directory, rewrites parser-confirmed links to omitted concepts, applies exact case-insensitive redactions, generates a root index and log, validates the result, and runs the [Erasure Audit](erasure-audit.md).

The complete directory moves into place only after validation and audit pass and the source fingerprint still matches the reviewed source. A successful output receives its own local folder grant so Studio can open it.

# Existing destinations

Studio never merges into an existing folder. The first conflict leaves both source and destination untouched and asks for an explicit replacement confirmation. Even after confirmation, Rust replaces only a real directory with the exact OKF Studio recipient-projection marker. A file, symlink, unmarked directory, or differently marked directory is refused.

Replacement first renames the prior projection to a guarded sibling, installs the complete new directory, then removes the backup. A failed install attempts to restore the prior directory.

# Failure and recovery

- No selected concept or no named recipient keeps plan review disabled.
- A selected concept that fails audience or sensitivity review appears as an omission.
- A source or choice change invalidates the plan and requires another review.
- Choosing the source, a descendant, or an ancestor as destination is refused.
- OKF validation errors remove the temporary output and stop export.
- Erasure findings remove the temporary output and retain a machine-readable audit beside the selected parent.
- Cancelling the picker performs no write.

Planning accepts at most 2,048 selected concepts, 16 audience values, and 32 exact redaction terms. The graph plan is capped at 10,000 items. These are product bounds, not OKF conformance rules.

Related behavior: [Ignore Rules](ignore-rules.md), [Access Hints](access-hints.md), [Validation](validation.md), and [IPC and Security](../architecture/ipc-and-security.md).

