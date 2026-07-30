---
type: UX Flow
title: First Run
description: The flow from launching the app with nothing open to browsing a detected bundle.
tags: [ux, flow, onboarding]
generated: { by: claude/unrecorded, at: 2026-07-17T00:10:00Z }
---

# Goal

A new user gets from "app just opened" to "reading a graph" in two clicks, with no configuration.

# Flow

1. **Launch, and the empty state.** The screen shows the brand mark, the one-line proposition, and a single welcome action list. That list follows the Zed and VS Code welcome pattern: one scannable column, not a row of equal buttons. Each row carries an icon, a label, a one-line description naming who it serves, and its shortcut inline. The primary row is **Open folder…** (`Ctrl/Cmd + O`), and it holds the one spot of accent. Next comes **Create new bundle…**, the agent-free [form flow](../features/create-bundle.md) for a user with no bundle yet. Then **Open from URL…** (`Ctrl/Cmd + Shift + O`) opens a [remote bundle](../features/bundle-switcher.md). A row for **Try the example** (this docs bundle) lets a brand-new user reach a real graph in one click. One line of fine print carries the trust contract: opening never changes files, agents connect only when chosen. See [Empty and Error States](empty-and-error-states.md) for the other no-content states.
2. **Pick a folder.** The OS folder picker opens (via the Tauri dialog plugin, see [IPC and Security](../architecture/ipc-and-security.md)). The chosen path becomes the active bundle [scope](../architecture/ipc-and-security.md). Opening and browsing do not modify it. Later agent changes require a reviewed transaction and an explicit **Apply**.
3. **Scanning.** A brief progress indicator while the [Rust core](../architecture/bundle-detection.md) walks the folder. Large folders stay responsive. The user can cancel a scan.
4. **Result.**
   - **One bundle found.** It opens directly into the [Browsing Layout](browsing-layout.md).
   - **Several found.** The [Bundle Switcher](../features/bundle-switcher.md) lists them, and the user picks one.
   - **None found.** A helpful [empty state](empty-and-error-states.md) explaining why and how to point at a real bundle.
5. **Browse.** The [graph](../features/graph-view.md) renders, fit to view, with the root concept selected in the [reader](../features/concept-reader.md).

# Re-entry

- The app remembers recent bundles. On relaunch it offers them in the [Bundle Switcher](../features/bundle-switcher.md) and can reopen the last one automatically.
- [Live Reload](../features/live-reload.md) keeps the open folder current. The [Bundle Switcher](../features/bundle-switcher.md) (top-left) is always available to switch bundle or open another folder.
