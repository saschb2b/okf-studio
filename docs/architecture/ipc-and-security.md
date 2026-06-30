---
type: Reference
title: IPC & Security
description: The Tauri command/event surface between Rust and the frontend, and the read-only, scoped capability model.
tags: [architecture, tauri, security, ipc]
timestamp: 2026-06-30T23:00:00Z
---

# Command & event surface

The frontend never touches the filesystem directly; it calls a small set of [Rust](tech-stack.md) commands and listens for events. It is a thin client over this surface — see [Frontend Architecture](frontend-architecture.md) for how it consumes these commands and events.

| Command | Purpose |
|---------|---------|
| `pick_folder()` | Open the native folder dialog; return the chosen path (becomes the scope). |
| `scan_bundles(folder)` | Run [bundle detection](bundle-detection.md); return the list of roots with confidence. |
| `read_bundle(root)` | [Parse](okf-parsing.md) a root into a full [`Bundle`](data-model.md). |
| `read_asset(root, rel)` | Read one companion asset's text (an ODSF `*.example.html` preview or a `styles/*.css` it links) for the design-system renderer; returns `null` when absent or not permitted. |
| `recent_bundles()` / `pin_bundle(root)` / `forget_bundle(root)` | Read/update the recent-**bundles** list for the [Bundle Switcher](../features/bundle-switcher.md); each entry stores the bundle root and the folder scope that granted access (via the store plugin). |
| `read_settings()` / `write_settings(s)` | Read/persist user [settings](../ux/settings.md) — theme, scan limits, reduce-motion (via the store plugin). |
| `start_watch(folder)` / `stop_watch()` | Begin/end [file watching](../features/live-reload.md). |

| Event | Payload |
|-------|---------|
| `bundle-changed` | The Concept ID(s) and bundle root affected by a filesystem change. |
| `scan-progress` | Progress for long scans, so [First Run](../ux/first-run.md) can show feedback. |

# Security model

Honors the [read-only and local-first principles](../product/principles.md) through Tauri 2.0's capability system:

- **Read-only filesystem.** Only read/stat/watch operations are permitted on the chosen folder; no write/delete capability is granted there. Pointing the app at a folder cannot modify it. The store plugin's small writes (recent bundles, [settings](../ux/settings.md)) go to the app's own config directory, never into the scanned bundle scope.
- **Scoped to the chosen folder.** Filesystem capability is constrained to the user-selected directory subtree (the dialog grants the scope). Nothing outside it is reachable. Reopening a recent bundle re-grants its stored folder scope — the [Bundle Switcher](../features/bundle-switcher.md) never reaches a path the user did not originally pick.
- **Asset reads are doubly contained.** `read_asset` resolves the requested path against the bundle root, canonicalizes it (collapsing `..` and symlinks), and refuses anything that lands outside the root or whose extension is not a permitted text type (`.html`, `.css`, `.svg`) — it never serves `.md` (concepts are read via `read_bundle`) or arbitrary files. So even a hand-crafted bundle linking `../../etc/passwd` from an example reads as a clean miss, not a leak.
- **Network: opt-in updates only.** The app makes no automatic network calls and sends no telemetry. The single network path is the **user-initiated** updater (Settings → "Check for updates"), which contacts the GitHub release endpoint only when clicked and verifies a signature before installing ([Build & Release](build-and-release.md)). `resource` URLs are handed to the OS browser, not fetched in-app.
- **Least privilege in `capabilities/`.** The Tauri capabilities config enables exactly the permissions needed — `fs` (read), `dialog`, `store`, `opener`, the opt-in `updater` + `process` (restart-after-update), and the **window** controls for the [custom title bar](../ux/browsing-layout.md) (start-dragging, start-resize-dragging, minimize, toggle-maximize, close, is-maximized) — nothing more (see [Tauri 2.0](../reference/tauri-2.md)).
- **Heavy work in Rust.** Parsing untrusted markdown happens in the core; the webview only renders sanitized output, reducing the attack surface of opening an unknown bundle.
- **Example previews are sandboxed and script-free.** An ODSF [example asset](../features/design-system-rendering.md) renders in a `sandbox`ed iframe with **no** `allow-scripts`, so even a bundle whose example HTML carries a `<script>` runs no JavaScript; `allow-same-origin` is granted only so the app can size the frame to its content. The app CSP allows the frame (`frame-src 'self' blob: data:`) while its inline styles stay under the existing `style-src 'unsafe-inline'`.
