---
type: Reference
title: OKF Spec Summary
description: The Open Knowledge Format v0.1 rules Studio must honor — conformance, the consumer contract, reserved files, links, and versioning.
resource: https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md
tags: [reference, okf, spec, external]
generated: { by: claude/unrecorded, at: 2026-07-13T19:42:50Z }
sources:
  - resource: "https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md"
    title: OKF Specification (v0.1)
  - resource: "https://cloud.google.com/blog/products/data-analytics/how-the-open-knowledge-format-can-improve-data-sharing/"
    title: How the Open Knowledge Format can improve data sharing
---

# Summary

OKF (Open Knowledge Format) v0.1 is Google's vendor-neutral spec for the context an AI agent needs, represented as a **bundle**: a directory of markdown **concept** files with YAML frontmatter, kept in version control. It is the format OKF Studio reads. This is a condensed snapshot for implementers; the canonical spec is the `resource` above.

# What Studio must honor

## Conformance (the producer side)

A bundle is conformant when:
1. Every non-reserved `.md` file has a parseable YAML frontmatter block.
2. Every such block has a non-empty **`type`** field. *(This is the one hard rule.)*
3. Reserved files (`index.md`, `log.md`) follow their defined structure.

## The consumer contract (our side)

A consumer **MUST NOT reject a bundle** for any of: missing optional fields, unknown `type` values, unknown extra frontmatter keys, broken cross-links, or missing `index.md`. A consumer that doesn't understand the declared version should still attempt best-effort rendering. This is the basis of Studio's [tolerant-consumer principle](../product/principles.md) and its [Validation](../features/validation.md) feature.

The reference repo ships its own consumer — the [OKF Reference HTML Visualizer](okf-reference-visualizer.md) — that OKF Studio is the native desktop counterpart to, and a set of [sample bundles](okf-sample-bundles.md) that any conformant consumer should render.

## Concepts

- **Frontmatter:** `type` (required); recommended `title`, `description`, `resource`, `tags`, `timestamp`. Producers may add any other keys; consumers preserve them (our [`extra`](../architecture/data-model.md) map).
- **Concept ID** = file path minus `.md`. `tables/orders.md` → `tables/orders`.
- **Body:** ordinary markdown; conventional headings `# Schema`, `# Examples`, `# Citations`.

## Links

- **Bundle-absolute** (`/tables/x.md`, from the bundle root) — recommended, survives file moves.
- **Relative** (`x.md`, `../d/x.md`).
- A link asserts a relationship; its meaning is in the surrounding prose. Broken links are tolerated. See [OKF Parsing](../architecture/okf-parsing.md) for resolution.

## Reserved files

- **`index.md`**: directory listing for progressive disclosure; carries no frontmatter, except the bundle-root `index.md`, which may declare `okf_version`.
- **`log.md`**: dated change history, newest first, ISO `YYYY-MM-DD` headings.

## Versioning

`okf_version` is a `<major>.<minor>` string (e.g. `"0.1"`), declared only in the bundle-root `index.md`. Minor versions are backward-compatible.
