---
type: Reference
title: Scope & Non-Goals
description: What ships in v1, what is deferred, and what OKF Viewer deliberately will not be.
tags: [product, scope, roadmap]
timestamp: 2026-07-04T18:00:00Z
---

# v1 scope (the MVP)

The first release must deliver the full read loop end to end:

- [Folder Autodetect](../features/folder-autodetect.md) — pick a folder, find all bundles in it.
- [Bundle Switcher](../features/bundle-switcher.md) — switch between bundles in the folder and recently-opened bundles, from the top-left; also **Open from URL** to fetch a remote bundle (a GitHub repo tarball or a direct archive) into a local cache and read it offline like any folder.
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
- **Editable scan ignore-list** — the directories the [scan](../architecture/bundle-detection.md) skips are a fixed default today; let users add/remove entries in [Settings](../ux/settings.md) (the **max depth** is already configurable).
- **Custom-frame platform polish** — the [borderless title bar](../ux/browsing-layout.md) still trades away two per-OS niceties: the Windows 11 **Snap Layouts** flyout on the maximize button, and macOS **traffic-light** placement. (Rounded corners are now drawn ourselves via a transparent window; a solid-corner fallback for environments without compositing could be a later refinement.)

# Non-goals

- **Not an editor (in v1).** OKF Viewer reads bundles; it does not author or mutate them. (Authoring belongs to a producer such as the `okf` skill.) Editing may be revisited later, but read-only is the default forever.
- **Not a general markdown wiki.** It renders markdown, but it is organized around OKF concepts, types, and links — not arbitrary note-taking.
- **Not a cloud / sync product.** No backend, no accounts, no telemetry. Software updates are **opt-in** (a user-initiated "Check for updates"), never silent or automatic. See [Design Principles](principles.md).
- **Not a git client.** [Open-from-URL](../features/bundle-switcher.md) fetches a GitHub repo **tarball** or a direct archive — a one-shot download, read-only. It deliberately does **not** clone arbitrary git hosts: that would drag in libgit2 and invite pull/sync/branch flows the viewer has no business owning. Cloning is a local `git clone` away; the viewer just reads what's on disk.
- **Not a validator CLI.** It surfaces conformance in the UI, but the canonical checker remains the standalone `scripts/okf-validate.mjs`.
- **Not tied to one bundle schema.** It must never assume a specific set of `type` values or domain.
