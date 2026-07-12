---
type: UX Flow
title: First Run
description: The flow from launching the app with nothing open to browsing a detected bundle.
tags: [ux, flow, onboarding]
timestamp: 2026-07-12T00:00:00Z
---

# Goal

A new user gets from "app just opened" to "reading a graph" in two clicks, with no configuration.

# Flow

1. **Launch → empty state.** A centered prompt introduces Studio as connected knowledge that can be explored with user-chosen agents. It offers a primary **Open Folder…** button (native OS dialog) beside a secondary **Open from URL…** (`Ctrl/Cmd + Shift + O`) for a [remote bundle](../features/bundle-switcher.md). Below, a one-click **example** card (this docs bundle) lets a new user see the graph and reader immediately. The fine print states that opening a bundle does not change its files and agent connections start only when chosen. See [Empty & Error States](empty-and-error-states.md) for this and the other no-content states.
2. **Pick a folder.** The OS folder picker opens (via the Tauri dialog plugin — see [IPC & Security](../architecture/ipc-and-security.md)). The chosen path becomes the read-only [scope](../architecture/ipc-and-security.md).
3. **Scanning.** A brief progress indicator while the [Rust core](../architecture/bundle-detection.md) walks the folder. Large folders stay responsive; scanning is cancelable.
4. **Result.**
   - **One bundle found →** it opens directly into the [Browsing Layout](browsing-layout.md).
   - **Several found →** the [Bundle Switcher](../features/bundle-switcher.md) lists them; the user picks one.
   - **None found →** a helpful [empty state](empty-and-error-states.md) explaining why and how to point at a real bundle.
5. **Browse.** The [graph](../features/graph-view.md) renders, fit to view, with the root concept selected in the [reader](../features/concept-reader.md).

# Re-entry

- The app remembers **recent bundles**; relaunching offers them in the [Bundle Switcher](../features/bundle-switcher.md) and can reopen the last one automatically.
- [Live Reload](../features/live-reload.md) keeps the open folder current; the [Bundle Switcher](../features/bundle-switcher.md) (top-left) is always available to switch bundle or open another folder.
