---
type: Reference
title: IPC & Security
description: The Tauri command/event surface between Rust and the frontend, and the read-only, scoped capability model.
tags: [architecture, tauri, security, ipc]
timestamp: 2026-07-04T18:00:00Z
---

# Command & event surface

The frontend never touches the filesystem directly; it calls a small set of [Rust](tech-stack.md) commands and listens for events. It is a thin client over this surface — see [Frontend Architecture](frontend-architecture.md) for how it consumes these commands and events.

| Command | Purpose |
|---------|---------|
| `pick_folder()` | Open the native folder dialog; return the chosen path (becomes the scope). |
| `scan_bundles(folder)` | Run [bundle detection](bundle-detection.md); return the list of roots with confidence. |
| `read_bundle(root)` | [Parse](okf-parsing.md) a root into a full [`Bundle`](data-model.md). |
| `fetch_remote_bundle(source)` | Fetch a [remote bundle](../features/bundle-switcher.md) (a GitHub repo tarball or a direct archive URL) into a local cache dir and return its path; the frontend then scans it like any folder. The single **user-initiated** network path besides the updater. Blocking I/O runs off the UI thread. |
| `read_asset(root, rel)` | Read one companion asset's text (an ODSF `*.example.html` preview or a `styles/*.css` it links) for the design-system renderer; returns `null` when absent or not permitted. |
| `read_asset_data_url(root, rel)` | Read a *local* bundle image as a `data:` URL so the reader inlines it without a network fetch; returns `null` when absent, not an image, or escaping the root. |
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
- **Asset reads are doubly contained.** `read_asset` (text) and `read_asset_data_url` (images) both resolve the requested path against the bundle root, canonicalize it (collapsing `..` and symlinks), and refuse anything that lands outside the root or whose extension is not on a small allowlist (text: `.html`/`.css`/`.svg`; images: `.png`/`.jpg`/`.gif`/`.webp`/`.avif`/`.svg`/…) — never `.md` (concepts are read via `read_bundle`) or arbitrary files. So even a hand-crafted bundle linking `../../etc/passwd` from an example reads as a clean miss, not a leak.
- **Images render offline.** A body image is rendered by **inlining a local bundle file** as a `data:` URL via `read_asset_data_url` — never by fetching a URL. A **remote** image is *not* auto-loaded (that would be an automatic network call); it degrades to an "open in browser" affordance, like a `resource` link. The render step also strips the original `<img src>` (to `data-mdsrc`) so the webview never even attempts a fetch.
- **Network: user-initiated only.** The app makes no automatic network calls and sends no telemetry. There are exactly two network paths, **both triggered by an explicit click**: the updater (Settings → "Check for updates"), which contacts the GitHub release endpoint and verifies a signature before installing ([Build & Release](build-and-release.md)); and **remote-bundle fetch** (`fetch_remote_bundle`, the [Open-from-URL](../features/bundle-switcher.md) flow), which downloads a GitHub repo tarball or a direct archive into a local cache and then reads it offline like any folder. The fetch is guarded in the Rust core: **https-only**, connect/read **timeouts**, a **download size cap** (128 MB), and archive extraction that **refuses any entry escaping the destination** (no zip-slip / `../` traversal). It deliberately supports only GitHub tarballs and archive URLs — no git clone (see [Scope & Non-Goals](../product/scope-and-non-goals.md)). `resource` URLs and remote images are still handed to the OS browser, never fetched in-app.
- **Least privilege in `capabilities/`.** The Tauri capabilities config enables exactly the permissions needed — `fs` (read), `dialog`, `store`, `opener`, the opt-in `updater` + `process` (restart-after-update), and the **window** controls for the [custom title bar](../ux/browsing-layout.md) (start-dragging, start-resize-dragging, minimize, toggle-maximize, close, is-maximized) — nothing more (see [Tauri 2.0](../reference/tauri-2.md)).
- **Heavy work in Rust.** Parsing untrusted markdown happens in the core; the webview only renders sanitized output, reducing the attack surface of opening an unknown bundle.
- **Example previews are sandboxed and script-free.** An ODSF [example asset](../features/design-system-rendering.md) renders in a `sandbox`ed iframe with **no** `allow-scripts`, so even a bundle whose example HTML carries a `<script>` runs no JavaScript; `allow-same-origin` is granted only so the app can size the frame to its content. The app CSP allows the frame (`frame-src 'self' blob: data:`) while its inline styles stay under the existing `style-src 'unsafe-inline'`.
