---
type: Feature
title: Compatibility Clinic
description: Explain how a bundle will travel across OKF consumers without confusing portability advice with conformance.
tags: [feature, compatibility, validation, portability, diagnostics]
timestamp: 2026-07-23T00:15:00Z
---

# What it does

The Compatibility Clinic groups parser, link, index, and extension findings for the open bundle. A sloppy bundle still opens. Each finding names its bundle-relative file and stable rule ID so an author can reproduce the result without searching the Markdown by hand.

The report keeps three meanings separate:

- **OKF conformance** carries the same errors and warnings as [Validation](validation.md).
- **Portability advice** identifies syntax that Studio can read but another consumer may handle differently. A resolved bundle-absolute link, for example, includes its deterministic relative replacement.
- **Preservation information** lists producer-defined frontmatter keys that Studio retained. Their presence is not an error and does not imply Studio understands their semantics.

# Machine-readable report

Export writes a bounded JSON report through the native save dialog. It includes bundle name and OKF version, rule IDs, relative files, levels, bases, and safe replacement pairs. It excludes the absolute bundle root, concept bodies, and frontmatter values. Opening the Clinic and building the report perform no network request and no bundle write.

# Reviewed normalization

A replacement shown in the Clinic starts as a proposal, not a write. **Review normalization** asks Rust to regenerate the current finding and derive a complete-file proposal from the current bundle. Rust edits only destinations of parser-confirmed inline Markdown links. Matching text in prose, code, titles, and reference definitions remains unchanged; reference-style links receive advice but no automatic repair.

The review displays a bounded diff and requires an explicit Keep or Reject decision for every hunk. Validation remains disabled until every hunk is reviewed. Apply remains disabled until the exact selected revision passes isolated bundle validation with no errors. A stale source file, forged finding, changed diff, path outside the granted bundle, or unreviewed hunk blocks the operation. Discard changes no bundle file.

Apply uses the same atomic replacement and checkpoint machinery as [agent writes](agent-panel.md#context-tools-and-writes). The Clinic offers Restore for the latest successful normalization while the applied file still matches its checkpoint. The frontend never receives direct filesystem access, and compatibility advice never grants an agent access.

# Bounds

The report is deterministic and ordered by category, level, file, and rule. Studio displays at most 4,096 findings and states when that bound was reached. One reviewed file is bounded to 1 MB by the shared staging engine. The complete bundle remains readable if report generation, staging, or validation fails or reaches a limit.

Related architecture: [OKF Parsing](../architecture/okf-parsing.md), [IPC & Security](../architecture/ipc-and-security.md), and [Testing](../architecture/testing.md).
