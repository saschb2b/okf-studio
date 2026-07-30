---
type: UX Flow
title: Empty and Error States
description: Every no-content, loading, and failure state: what it shows and how to recover.
tags: [ux, flow, errors, empty-states]
generated: { by: claude/unrecorded, at: 2026-07-17T00:10:00Z }
---

# Stance

Report, never refuse. Like the [tolerant-consumer principle](../product/principles.md), every state here explains what happened and offers a way forward instead of failing silently or blocking the app.

# No content yet

- **Nothing open.** On launch with no folder chosen, the connected-knowledge proposition appears above the welcome action list. That list offers to open a folder, create a new bundle, open from a URL, or try the example. Each row carries a one-line description and its shortcut inline. The list also carries one line of trust fine print: opening never changes files, and agents connect only when chosen. The top-left [Bundle Switcher](../features/bundle-switcher.md) also surfaces recent bundles. This is the [First Run](first-run.md) empty state.
- **Scanning.** While the [Rust core](../features/folder-autodetect.md) walks the folder, a progress indicator shows. The scan is cancelable and the app stays responsive.
- **No bundles found.** An empty state explains what an OKF bundle is: a directory of `.md` concepts (see the [spec summary](../reference/okf-spec-summary.md)). It also explains how to point at a real one. **Open Folder…** tries again, beside [creating a bundle](../features/create-bundle.md) right there.
- **Bundle with zero concepts.** A detected-but-empty bundle opens to an empty graph and reader. A one-line note says the bundle has no concepts yet. This is not an error.
- **No `log.md`.** The [Log view](../features/log-view.md) shows an empty state saying the bundle has no `log.md` rather than an error. The file is optional.

# Malformed or broken content

- **Conformance error / malformed frontmatter.** A concept missing a non-empty `type` or with an unparseable frontmatter block still renders, flagged through [Validation](../features/validation.md). This is the [tolerant-consumer principle](../product/principles.md) in action.
- **Broken cross-link.** Clicking a link whose target doesn't resolve does not error. The [reader](../features/concept-reader.md) styles it as unresolved and says the target is missing. The [parser](../architecture/okf-parsing.md) tolerates broken links by design.

# Failures

- **Agent process stopped.** The panel keeps the agent name, bounded host reason, **Review connections**, and **Dismiss** in one connection-owned notice. If no other agent remains, the space below confirms that browsing and reading still work instead of showing another connection action.

- **Permission denied / path gone.** If the app cannot read the chosen folder, or a previously-opened path no longer exists, the app explains why rather than crashing. It offers to pick another folder, or to forget the stale entry in the [Bundle Switcher](../features/bundle-switcher.md). Opening and browsing use the active bundle [scope](../architecture/ipc-and-security.md) without modifying it. Source, export, destination, and reviewed-write operations need separate authorization. A missing read path is therefore a recoverable prompt, not a fatal state.
- **File-watcher error.** If the watcher behind [Live Reload](../features/live-reload.md) drops, the app reports that live reload is paused and offers a manual **Re-scan**. The open bundle stays readable.
