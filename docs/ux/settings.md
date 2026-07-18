---
type: Reference
title: Settings & Preferences
description: The local preferences surface for theme, reading, scan tuning, agent notifications, workspace memory, local routines, motion, updates, and reset.
tags: [ux, settings, preferences]
timestamp: 2026-07-18T20:30:00Z
---

# Opening Settings

Settings open from the **⚙ at the foot of the [Activity Bar](browsing-layout.md)** (the desktop convention — like VS Code's "Manage" gear at the bottom of its rail, not a gear floating in the title bar), with `Ctrl/Cmd + ,` (see [Keyboard Shortcuts](keyboard-shortcuts.md)), and from the [command palette](../features/command-palette.md). It is a small, local preferences surface — there is deliberately no account and no cloud sync, per the [local-first principle](../product/principles.md). The one place it touches the network is an **opt-in** "Check for updates" (below), which runs only when the user clicks it — never automatically.

# Preferences

- **Theme.** System / Light / Dark. Defaults to following the OS; see [Theming](theming.md).
- **Reading layer.** Scales the [reader](../features/concept-reader.md) pane only (the graph keeps its own zoom) — the **content-scoped** replacement for browser page-zoom; `Ctrl/Cmd` `+` / `−` / `0` adjust the size from anywhere off the graph, per the [native-feel principle](../product/principles.md). Browser **page-zoom is suppressed** so the whole app never scales like a website: the zoom hotkeys and ctrl+wheel / `gesture` pinch are remapped or blocked in JS (WebView2, WKWebView), and on the Linux WebKitGTK webview — where trackpad pinch is a native zoom that bypasses JS — the webview's built-in pinch **`GtkGestureZoom` is disabled at the GTK layer** (its signal handlers destroyed), with the zoom level pinned to 1.0 as a fallback. The reader's **"Aa"** control offers the fuller set — text size, measure width, line spacing, font (sans / serif), and dyslexia-friendly reading aids — all persisted here; see [Concept Reader](../features/concept-reader.md).
- **Recent bundles** are no longer managed here — they moved to the top-left [Bundle Switcher](../features/bundle-switcher.md) (pin and remove there), closer to where you actually switch context. The [First Run](first-run.md) re-entry flow surfaces them on launch.
- **Scan tuning.** The **max depth** the [autodetect](../features/folder-autodetect.md) scan descends is user-configurable and drives [detection](../architecture/bundle-detection.md). The **ignore-list** of skipped directories (`.git`, `node_modules`, `target`, `dist`, `build`, `.venv`, and hidden dirs) is a fixed sensible default for now; making it editable is a [later](../product/scope-and-non-goals.md) refinement.
- **OKF capability pack.** The `okf-foundation@1.2.0` card shows built-in provenance, Studio and schema compatibility, conflicts, templates, artifact schemas, required tools, pack digest, and activation state before the per-capability versions and resources. The catalog includes every generic-chat and named-task method, the shared writing contract, and the two read-only discovery tools. **Use Legacy 0.4.0** retains only `okf-core`; **Restore OKF Foundation** returns the curated methods. Either choice leaves profiles, sessions, checkpoints, settings, and grants unchanged. This is disclosure, not a claim that an external agent followed delivered guidance; see [Declarative OKF Capability Packs](../features/capability-packs.md).
- **Workspace memory.** For the active bundle, an inspectable list shows every bounded local preference and deterministic task record with origin, owner, current or stale validation, last use, retention, exact context effect, and deletion. Memory stores no conversation or knowledge bodies; see [Inspectable Workspace Memory](../features/workspace-memory.md).
- **Local routines.** For the active bundle, save a named manual or daily deterministic health rescan or source-fingerprint check. The form discloses the effective offline, agent-free, tool-free, non-staging scope before save. Each routine shows its schedule, timeout, catch-up policy, next run, exact scope, Run now, and Delete. Non-healthy, skipped, blocked, interrupted, and failed receipts appear in the local attention inbox; see [Local OKF Routines and Attention Inbox](../features/local-routines.md).
- **One-shot OKF MCP grant.** For the active bundle, **Use this bundle from another agent** creates a copyable standard MCP descriptor. The descriptor expires after 60 seconds, works once, exposes only Studio's bounded read-only OKF tools, and carries no bundle path. Creating or copying it does not connect or prompt an agent; see [Guarded External Entry Points](../features/external-entry-points.md).
- **Agent notifications.** Disabled by default. Enabling them explicitly requests operating-system notification permission. Studio then alerts only when an unfocused background thread completes, fails, or waits for permission, using a generic state plus a bounded thread title and agent name. Routine alerts carry only a generic attention state and bounded result count. Prompt, response, source, concept, finding, path, permission, and staged content are excluded. The operating system's focus and per-app settings remain authoritative.
- **Agent notification sound.** A separate preference, available only after notifications are enabled. Studio asks for sound when allowed; the operating system decides whether and how it plays.
- **Reduce motion.** Override the OS reduce-motion setting honored in [Accessibility](accessibility.md).
- **Check for updates.** An **opt-in** button (the app's sole network path) that checks the latest GitHub release via the [updater](../architecture/build-and-release.md) only when clicked. If a newer version exists it offers, in one more click, to **install & restart** (AppImage / Windows) — or, for a **`.deb`** install (which the OS package manager owns and the updater can't self-replace), the same in-app "version X available" hint plus a **Download** button to the releases page. Desktop only; the dev/web build reports it as unavailable.
- **Reset to defaults.** Restore every preference above to its shipped default, including turning agent notifications and their sound off.

# Persistence

- Preferences persist locally via Tauri's store plugin (see [IPC & Security](../architecture/ipc-and-security.md) and [Tauri 2](../reference/tauri-2.md)) — a small on-disk file, nothing leaves the machine.
- There is no account or cloud sync; this is intentional, following the [local-first principle](../product/principles.md).

# Out of scope for v1

User-configurable **keybindings** are a post-v1 idea, not in v1 (see [Scope & Non-Goals](../product/scope-and-non-goals.md)); v1 ships sensible defaults.
