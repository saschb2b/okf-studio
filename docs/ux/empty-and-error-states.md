---
type: UX Flow
title: Empty & Error States
description: Every no-content, loading, and failure state — what it shows and how to recover.
tags: [ux, flow, errors, empty-states]
timestamp: 2026-06-28T12:00:00Z
---

# Stance

Report, never refuse. Like the [tolerant-consumer principle](../product/principles.md), every state here explains what happened and offers a way forward instead of failing silently or blocking the app.

# No content yet

- **Nothing open.** On launch with no folder chosen, a centered prompt explains the app in one line and offers **Open Folder…**. This is the [First Run](first-run.md) empty state.
- **Scanning.** While the [Rust core](../features/folder-autodetect.md) walks the folder, a progress indicator shows; the scan is **cancelable** and the app stays responsive.
- **No bundles found.** A helpful empty state explains what an OKF bundle is (a directory of `.md` concepts — see the [spec summary](../reference/okf-spec-summary.md)) and how to point at a real one, with **Open Folder…** to try again.
- **Bundle with zero concepts.** A detected-but-empty bundle opens to an empty graph and reader with a one-line note that the bundle has no concepts yet, not an error.
- **No `log.md`.** The [Log view](../features/log-view.md) shows an empty state saying the bundle has no `log.md` rather than an error — the file is optional.

# Malformed or broken content

- **Conformance error / malformed frontmatter.** A concept missing a non-empty `type` or with an unparseable frontmatter block is **still rendered**, flagged via [Validation](../features/validation.md). This is the [tolerant-consumer principle](../product/principles.md) in action.
- **Broken cross-link.** Clicking a link whose target doesn't resolve doesn't error — the [reader](../features/concept-reader.md) styles it as unresolved and says the target is missing. The [parser](../architecture/okf-parsing.md) tolerates broken links by design.

# Failures

- **Permission denied / path gone.** If the chosen folder can't be read, or a previously-opened path no longer exists, the app explains why and offers to pick another folder rather than crashing. Access is read-only and [scoped](../architecture/ipc-and-security.md), so this is a recoverable prompt, not a fatal state.
- **File-watcher error.** If the watcher behind [Live Reload](../features/live-reload.md) drops, the app reports that live reload is paused and offers a manual **Re-scan**; the open bundle stays readable.
