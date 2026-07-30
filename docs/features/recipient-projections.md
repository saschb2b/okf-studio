---
type: Feature
title: Recipient Projections
description: Choose knowledge, review what will travel, and save a separate shareable bundle without changing the source.
tags: [feature, privacy, sharing, access, review]
generated: { by: claude/unrecorded, at: 2026-07-23T17:29:00Z }
audience: [maintainers, knowledge-owners]
sensitivity: public
---

# User job and value

A maintainer needs to share a useful subset of a bundle without editing, copying, and repairing Markdown by hand. Studio presents this as the user's own job:

1. Name who the copy is for.
2. Choose the concepts to share.
3. Review what the new bundle will contain, then choose where to save it.

The source bundle remains unchanged. The output is a normal OKF bundle, and any OKF reader can open it without Studio. The interface calls it a **shareable bundle**. Recipient projection remains the implementation and audit term.

# Choose content

**Create shareable bundle** is a bundle-level action. It stays beside the active bundle’s name in the persistent title bar, not inside one folder or concept. Its compact share icon opens the full workflow from the overview, any topic, and every workspace layout. The command launcher offers the same action for keyboard-led work.

The first screen asks who the copy is for and puts concept selection at the center. Studio writes the recipient name into the new bundle, and that name becomes its portable folder name.

Selected concepts without a recognized sensitivity label are eligible by default because concept selection is already explicit and access metadata is advisory. The review calls out how many unlabeled concepts would travel. Known sensitivity limits still apply.

**Sharing safeguards** remain available in one collapsed optional section:

- an audience filter
- the highest recognized sensitivity to include
- whether unlabeled or unknown sensitivity values are eligible
- exact words or phrases to remove.

An empty audience filter means no audience filtering. Entering one or more audiences narrows eligible concepts to matching authored labels. This prevents an optional blank field from silently excluding selected content.

# Review the new bundle

Planning writes nothing to the filesystem. Rust computes:

- explicitly selected concepts that pass the reviewed constraints
- transitively linked concepts that pass the same constraints
- every omitted concept and `.okfignore` path, with one exact reason
- retained links that must point to the projection omissions note
- broken links that already existed in the source
- every occurrence of an exact reviewed redaction term
- a destination folder name, source fingerprint, and plan revision.

The second screen leads with the outcome: concepts in the new bundle, concepts left out, link updates, and text removals. Detail sections explain each item in plain language. Source fingerprints, stale-plan protection, validation, and erasure checks remain available under **How Studio protects the source** instead of competing with the sharing decision.

If the safeguards exclude every selected concept, the review says that Studio can share nothing. It directs the user back to the audience and sensitivity safeguards. Saving remains disabled.

[Audience and sensitivity](access-hints.md) remain advisory. They guide this conservative copy operation but never grant access, prove classification, or change operating-system permissions.

# Export transaction

Saving starts only from **Choose save location** and a Rust-owned native folder picker. The user chooses the folder where Studio will create the named bundle. The interface never asks the user to understand a filesystem “parent.”

Rust reauthorizes the exact source, recomputes the plan, and rejects a stale revision. It writes a temporary sibling directory, rewrites parser-confirmed links to omitted concepts, and applies exact case-insensitive redactions. It then generates a root index and log, validates the result, and runs the [Erasure Audit](erasure-audit.md).

The complete directory moves into place only after validation and audit pass and the source fingerprint still matches the reviewed source. A successful output receives its own local folder grant so Studio can open it.

# Existing destinations

Studio never merges into an existing folder. The first conflict leaves both source and destination untouched and asks for an explicit replacement confirmation. Even after confirmation, Rust replaces only a real directory with the exact OKF Studio recipient-projection marker. Rust refuses a file, symlink, unmarked directory, or differently marked directory.

Replacement first renames the prior projection to a guarded sibling, installs the complete new directory, then removes the backup. A failed install attempts to restore the prior directory.

# Failure and recovery

- No selected concept or no named recipient keeps the preview action disabled and states what is missing.
- A selected concept that fails audience or sensitivity review appears as an omission.
- A source or choice change invalidates the plan and requires another review.
- Studio refuses the source, a descendant, or an ancestor as the destination.
- OKF validation errors remove the temporary output and stop export.
- Erasure findings remove the temporary output and retain a machine-readable audit beside the selected parent.
- Cancelling the picker writes nothing.

Planning accepts at most 2,048 selected concepts, 16 audience values, and 32 exact redaction terms. Planning caps the graph plan at 10,000 items. These are product bounds, not OKF conformance rules.

Related behavior: [Ignore Rules](ignore-rules.md), [Access Hints](access-hints.md), [Validation](validation.md), and [IPC and Security](../architecture/ipc-and-security.md).
