---
type: Feature
title: Compatibility Clinic
description: Explain how a bundle will travel across OKF consumers without confusing portability advice with conformance.
tags: [feature, compatibility, validation, portability, diagnostics]
timestamp: 2026-07-22T23:58:00Z
---

# What it does

The Compatibility Clinic groups parser, link, index, and extension findings for the open bundle. A sloppy bundle still opens. Each finding names its bundle-relative file and stable rule ID so an author can reproduce the result without searching the Markdown by hand.

The report keeps three meanings separate:

- **OKF conformance** carries the same errors and warnings as [Validation](validation.md).
- **Portability advice** identifies syntax that Studio can read but another consumer may handle differently. A resolved bundle-absolute link, for example, includes its deterministic relative replacement.
- **Preservation information** lists producer-defined frontmatter keys that Studio retained. Their presence is not an error and does not imply Studio understands their semantics.

# Machine-readable report

Export writes a bounded JSON report through the native save dialog. It includes bundle name and OKF version, rule IDs, relative files, levels, bases, and safe replacement pairs. It excludes the absolute bundle root, concept bodies, and frontmatter values. Opening the Clinic and building the report perform no network request and no bundle write.

# Repair boundary

A replacement shown in the Clinic is a proposal, not a write. The Rust core only computes it. Applying a normalization must use the same staged diff, validation, explicit review, and Apply boundary as [agent writes](agent-panel.md#context-tools-and-writes). Conformance advice never grants an agent or webview filesystem access.

# Bounds

The report is deterministic and ordered by category, level, file, and rule. Studio displays at most 4,096 findings and states when that bound was reached. The complete bundle remains readable if report generation fails or reaches its limit.

Related architecture: [OKF Parsing](../architecture/okf-parsing.md), [IPC & Security](../architecture/ipc-and-security.md), and [Testing](../architecture/testing.md).
