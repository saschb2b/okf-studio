---
type: Feature
title: Live Reload
description: Watch the opened folder and refresh the graph and reader in place as bundle files are added, changed, or removed.
tags: [feature, live, filesystem]
timestamp: 2026-06-28T00:00:00Z
---

# What it does

While a folder is open, the app watches it for filesystem changes and updates the view automatically — so editing a concept in another editor (or an agent rewriting it) reflects in the viewer within moments, without a manual reload.

# Behavior

- A change to a concept file re-parses just that concept and updates its node, body, and links; [backlinks](concept-reader.md) recompute incrementally.
- Adding or removing a `.md` file adds/removes a node and re-runs [bundle detection](../architecture/bundle-detection.md) if structure changed (a new sub-bundle, a new `index.md`).
- The graph updates **in place** — existing node positions are preserved so the layout does not jump; only affected nodes settle.
- Selection and scroll position are retained across reloads when the selected concept still exists.

# Implementation notes

- Backed by a filesystem watcher in the [Rust core](../architecture/tech-stack.md) (e.g. the `notify` crate, exposed through a Tauri event channel — see [IPC & Security](../architecture/ipc-and-security.md)).
- Changes are debounced so a burst of writes (a bulk edit, a git checkout) produces one coherent update.
- Watching is read-only and scoped to the chosen folder, consistent with the [security model](../architecture/ipc-and-security.md).
