---
type: Reference
title: Settings & Preferences
description: The preferences surface — theme, recent folders, scan tuning, motion, and reset.
tags: [ux, settings, preferences]
timestamp: 2026-06-28T12:00:00Z
---

# Opening Settings

Settings open with `Ctrl/Cmd + ,` (see [Keyboard Shortcuts](keyboard-shortcuts.md)). It is a small, local preferences surface — there is deliberately no account and no cloud sync, per the [local-first principle](../product/principles.md).

# Preferences

- **Theme.** System / Light / Dark. Defaults to following the OS; see [Theming](theming.md).
- **Recent folders.** Manage the list of recently-opened folders surfaced at launch — pin the ones you return to, remove stale entries. Ties into the [Bundle Browser](../features/bundle-browser.md) and the [First Run](first-run.md) re-entry flow.
- **Scan tuning.** Control [detection](../architecture/bundle-detection.md): the **max depth** the [autodetect](../features/folder-autodetect.md) scan descends, and the **ignore-list** of directories skipped during the walk (`.git`, `node_modules`, `target`, `dist`).
- **Reduce motion.** Override the OS reduce-motion setting honored in [Accessibility](accessibility.md).
- **Reset to defaults.** Restore every preference above to its shipped default.

# Persistence

- Preferences persist locally via Tauri's store plugin (see [IPC & Security](../architecture/ipc-and-security.md) and [Tauri 2](../reference/tauri-2.md)) — a small on-disk file, nothing leaves the machine.
- There is no account or cloud sync; this is intentional, following the [local-first principle](../product/principles.md).

# Out of scope for v1

User-configurable **keybindings** are a post-v1 idea, not in v1 (see [Scope & Non-Goals](../product/scope-and-non-goals.md)); v1 ships sensible defaults.
