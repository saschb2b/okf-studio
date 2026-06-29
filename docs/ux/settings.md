---
type: Reference
title: Settings & Preferences
description: The preferences surface — theme, reader text size, scan tuning, motion, and reset.
tags: [ux, settings, preferences]
timestamp: 2026-06-29T16:00:00Z
---

# Opening Settings

Settings open with `Ctrl/Cmd + ,` (see [Keyboard Shortcuts](keyboard-shortcuts.md)). It is a small, local preferences surface — there is deliberately no account and no cloud sync, per the [local-first principle](../product/principles.md).

# Preferences

- **Theme.** System / Light / Dark. Defaults to following the OS; see [Theming](theming.md).
- **Reading layer.** Scales the [reader](../features/concept-reader.md) pane only (the graph keeps its own zoom) — the **content-scoped** replacement for browser page-zoom; `Ctrl/Cmd` `+` / `−` / `0` adjust the size from anywhere off the graph, per the [native-feel principle](../product/principles.md). The reader's **"Aa"** control offers the fuller set — text size, measure width, line spacing, font (sans / serif), and dyslexia-friendly reading aids — all persisted here; see [Concept Reader](../features/concept-reader.md).
- **Recent bundles** are no longer managed here — they moved to the top-left [Bundle Switcher](../features/bundle-switcher.md) (pin and remove there), closer to where you actually switch context. The [First Run](first-run.md) re-entry flow surfaces them on launch.
- **Scan tuning.** The **max depth** the [autodetect](../features/folder-autodetect.md) scan descends is user-configurable and drives [detection](../architecture/bundle-detection.md). The **ignore-list** of skipped directories (`.git`, `node_modules`, `target`, `dist`, `build`, `.venv`, and hidden dirs) is a fixed sensible default for now; making it editable is a [later](../product/scope-and-non-goals.md) refinement.
- **Reduce motion.** Override the OS reduce-motion setting honored in [Accessibility](accessibility.md).
- **Reset to defaults.** Restore every preference above to its shipped default.

# Persistence

- Preferences persist locally via Tauri's store plugin (see [IPC & Security](../architecture/ipc-and-security.md) and [Tauri 2](../reference/tauri-2.md)) — a small on-disk file, nothing leaves the machine.
- There is no account or cloud sync; this is intentional, following the [local-first principle](../product/principles.md).

# Out of scope for v1

User-configurable **keybindings** are a post-v1 idea, not in v1 (see [Scope & Non-Goals](../product/scope-and-non-goals.md)); v1 ships sensible defaults.
