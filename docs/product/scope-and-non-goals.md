---
type: Reference
title: Scope & Non-Goals
description: What ships in v1, what is deferred, and what OKF Viewer deliberately will not be.
tags: [product, scope, roadmap]
timestamp: 2026-06-29T12:00:00Z
---

# v1 scope (the MVP)

The first release must deliver the full read loop end to end:

- [Folder Autodetect](../features/folder-autodetect.md) — pick a folder, find all bundles in it.
- [Bundle Switcher](../features/bundle-switcher.md) — switch between bundles in the folder and recently-opened bundles, from the top-left.
- [Graph View](../features/graph-view.md) — force-directed, type-colored, cross-linked.
- [Concept Reader](../features/concept-reader.md) — rendered markdown, frontmatter, backlinks.
- [Search & Filter](../features/search-and-filter.md) and [Navigation](../features/navigation.md).
- [Validation](../features/validation.md) surfaced non-blockingly.
- [Live Reload](../features/live-reload.md) on file changes.
- Packaged installers for **Windows** (`.msi`/`.exe`) and **Ubuntu** (`.deb`/AppImage) — see [Build & Release](../architecture/build-and-release.md).

# Later (post-v1)

- Tag-browsing views and saved filters.
- Export: the current graph as PNG/SVG, or the bundle as a static self-contained HTML.
- "Cited by" graph focus mode and shortest-path-between-concepts.
- **Folder-as-workspace grouping** — treat the containing folder as a first-class entity that groups the bundles it holds, so bundles from one repo or context are visually connected (today recents are per-bundle via the [Bundle Switcher](../features/bundle-switcher.md), with the folder kept only as the read scope).
- Optional remote bundles (git URL, tarball) — fetched locally, still read-only.

# Non-goals

- **Not an editor (in v1).** OKF Viewer reads bundles; it does not author or mutate them. (Authoring belongs to a producer such as the `okf` skill.) Editing may be revisited later, but read-only is the default forever.
- **Not a general markdown wiki.** It renders markdown, but it is organized around OKF concepts, types, and links — not arbitrary note-taking.
- **Not a cloud / sync product.** No backend, no accounts, no telemetry. See [Design Principles](principles.md).
- **Not a validator CLI.** It surfaces conformance in the UI, but the canonical checker remains the standalone `scripts/okf-validate.mjs`.
- **Not tied to one bundle schema.** It must never assume a specific set of `type` values or domain.
