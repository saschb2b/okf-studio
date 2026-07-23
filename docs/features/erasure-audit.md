---
type: Feature
title: Erasure Audit
description: Block a recipient projection when excluded identities or reviewed sensitive terms remain in its output.
tags: [feature, privacy, audit, sharing, diagnostics]
timestamp: 2026-07-23T22:30:00Z
audience: [maintainers, knowledge-owners, security-reviewers]
sensitivity: public
---

# User job and value

A projection reviewer needs evidence that material excluded from a recipient copy did not reappear through frontmatter, indexes, backlinks, citations, generated text, diagnostics, or companion assets. Studio therefore treats erasure as a post-generation audit, not as an assumption about the planner.

# Terms checked

Rust derives a bounded term set from:

- omitted concept IDs, Markdown paths, titles, and stable identities;
- ignored paths reported by the root `.okfignore`;
- values under recognized provenance and evidence fields;
- exact sensitive terms entered by the reviewer.

The audit scans the complete temporary output after link rewriting, redaction, generated index and log creation, and OKF validation. It reads text and non-text files as bytes, so a leaked term in a Markdown body, YAML frontmatter, JSON diagnostic, index, log, or binary companion file is still detected.

# Result and retained evidence

The report records the schema version, pass state, checked file and byte counts, checked term count, relative path, category, matched value, occurrence count, truncation state, and bounded diagnostics. It is written as a JSON sibling of the requested output, outside the projected bundle.

A passing report permits the temporary bundle to move into place. Any finding blocks export and removes the temporary directory. The report remains so the reviewer can identify the source of the leak without receiving a partially sanitized bundle.

# Bounds and limits

The scanner does not follow symlinks. It checks at most 4,096 files, 64 MiB, and 512 findings. Reaching a file, byte, or finding bound sets the report's truncation state or diagnostic and does not produce a passing audit.

The audit is a deterministic string-leak check. It cannot prove that paraphrased meaning, visually encoded content, encrypted bytes, compressed archives, or an unlisted secret is absent. It does not replace filesystem permissions, encryption, recipient policy, or human review. A passing report means only that the declared bounded terms were not found in the generated output.

Seeded tests cover Markdown bodies, frontmatter, root indexes, JSON diagnostics, and binary assets. [Recipient Projections](recipient-projections.md) remain the only current caller.

