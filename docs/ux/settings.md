---
type: Reference
title: Settings & Preferences
description: The preferences surface — theme, reader text size, scan tuning, motion, and reset.
tags: [ux, settings, preferences]
timestamp: 2026-07-05T16:00:00Z
---

# Opening Settings

Settings open from the **⚙ at the foot of the [Activity Bar](browsing-layout.md)** (the desktop convention — like VS Code's "Manage" gear at the bottom of its rail, not a gear floating in the title bar), with `Ctrl/Cmd + ,` (see [Keyboard Shortcuts](keyboard-shortcuts.md)), and from the [command palette](../features/command-palette.md). It is a small, local preferences surface — there is deliberately no account and no cloud sync, per the [local-first principle](../product/principles.md). The one place it touches the network is an **opt-in** "Check for updates" (below), which runs only when the user clicks it — never automatically.

# Preferences

- **Theme.** System / Light / Dark. Defaults to following the OS; see [Theming](theming.md).
- **Reading layer.** Scales the [reader](../features/concept-reader.md) pane only (the graph keeps its own zoom) — the **content-scoped** replacement for browser page-zoom; `Ctrl/Cmd` `+` / `−` / `0` adjust the size from anywhere off the graph, per the [native-feel principle](../product/principles.md). Browser **page-zoom is suppressed** so the whole app never scales like a website: the zoom hotkeys and ctrl+wheel / `gesture` pinch are remapped or blocked in JS (WebView2, WKWebView), and on the Linux WebKitGTK webview — where trackpad pinch is a native zoom that bypasses JS — the webview's built-in pinch **`GtkGestureZoom` is disabled at the GTK layer** (its signal handlers destroyed), with the zoom level pinned to 1.0 as a fallback. The reader's **"Aa"** control offers the fuller set — text size, measure width, line spacing, font (sans / serif), and dyslexia-friendly reading aids — all persisted here; see [Concept Reader](../features/concept-reader.md).
- **Recent bundles** are no longer managed here — they moved to the top-left [Bundle Switcher](../features/bundle-switcher.md) (pin and remove there), closer to where you actually switch context. The [First Run](first-run.md) re-entry flow surfaces them on launch.
- **Scan tuning.** The **max depth** the [autodetect](../features/folder-autodetect.md) scan descends is user-configurable and drives [detection](../architecture/bundle-detection.md). The **ignore-list** of skipped directories (`.git`, `node_modules`, `target`, `dist`, `build`, `.venv`, and hidden dirs) is a fixed sensible default for now; making it editable is a [later](../product/scope-and-non-goals.md) refinement.
- **Reduce motion.** Override the OS reduce-motion setting honored in [Accessibility](accessibility.md).
- **Check for updates.** An **opt-in** button (the app's sole network path) that checks the latest GitHub release via the [updater](../architecture/build-and-release.md) only when clicked. If a newer version exists it offers, in one more click, to **install & restart** (AppImage / Windows) — or, for a **`.deb`** install (which the OS package manager owns and the updater can't self-replace), the same in-app "version X available" hint plus a **Download** button to the releases page. Desktop only; the dev/web build reports it as unavailable.
- **Reset to defaults.** Restore every preference above to its shipped default.

# Persistence

- Preferences persist locally via Tauri's store plugin (see [IPC & Security](../architecture/ipc-and-security.md) and [Tauri 2](../reference/tauri-2.md)) — a small on-disk file, nothing leaves the machine.
- There is no account or cloud sync; this is intentional, following the [local-first principle](../product/principles.md).

# Out of scope for v1

User-configurable **keybindings** are a post-v1 idea, not in v1 (see [Scope & Non-Goals](../product/scope-and-non-goals.md)); v1 ships sensible defaults.
