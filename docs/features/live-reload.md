---
type: Feature
title: Live Reload
description: Watch the opened folder and refresh the graph and reader in place as bundle files are added, changed, or removed.
tags: [feature, live, filesystem]
generated: { by: claude/unrecorded, at: 2026-07-23T20:30:00Z }
---

# What it does

While a folder is open, the app watches it for filesystem changes and updates the view automatically. Editing a concept in another editor, or an agent rewriting it, reaches Studio within moments, with no manual reload.

# Behavior

- A change to a concept file re-parses just that concept and updates its node, body, and links. [Backlinks](concept-reader.md) recompute incrementally.
- Adding or removing a `.md` file adds/removes a node and re-runs [bundle detection](../architecture/bundle-detection.md) if structure changed (a new sub-bundle, a new `index.md`).
- The graph updates **in place**. It keeps existing node positions so the layout does not jump, and only affected nodes settle.
- A reload keeps the selection and the scroll position when the selected concept still exists.

# Implementation notes

- Backed by a filesystem watcher in the [Rust core](../architecture/tech-stack.md) (the `notify` crate, exposed through a Tauri event channel, described in [IPC & Security](../architecture/ipc-and-security.md)).
- Debouncing turns a burst of writes, such as a bulk edit or a git checkout, into one coherent update. [Performance & Scale](../architecture/performance.md) covers the incremental re-parse and backlink strategy.
- The root [`.okfignore`](ignore-rules.md) matcher suppresses events for excluded paths. A rule-file change always triggers a refresh so a new exclusion or negation takes effect immediately.
- The watcher reads only, and only inside the chosen folder, which matches the [security model](../architecture/ipc-and-security.md).
