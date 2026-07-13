---
type: Reference
title: IPC & Security
description: The Tauri command/event surface between Rust and the frontend, and the read-only, scoped capability model.
tags: [architecture, tauri, security, ipc]
timestamp: 2026-07-13T00:00:00Z
---

# Command & event surface

The frontend never touches the filesystem directly; it calls a small set of [Rust](tech-stack.md) commands and listens for events. It is a thin client over this surface — see [Frontend Architecture](frontend-architecture.md) for how it consumes these commands and events.

| Command | Purpose |
|---------|---------|
| `pick_folder()` | Open the native folder dialog; return the chosen path (becomes the scope). |
| `pick_agent_text_sources(limit)` | Open the native PDF, text, Markdown, HTML, CSV, and JSON picker; read or extract bounded content in Rust; and return filename- and media-type-labelled sources without absolute paths. PDF parsing runs in a separate bounded helper process. |
| `pick_agent_source_folder(limit)` | Open the native folder picker; discover supported files through a bounded, non-symlink traversal; and return individually removable sources with relative-path provenance. |
| `pick_agent_image_sources(limit)` | Open the native PNG, JPEG, and WebP picker; verify signatures and bounded bytes in Rust; and return image sources without absolute paths. |
| `fetch_agent_source_url(url)` | Fetch one explicit public HTTPS text, Markdown, HTML, CSV, or JSON source through bounded Rust mediation; return its final URL, media type, content, and original-response digest. |
| `export_agent_transcript(suggested_name, markdown)` | Open a native save dialog for the current in-memory Agent thread and write at most 2 MiB of Markdown. Cancellation returns no path; success returns only the saved filename. |
| `list_agent_sessions(connection_id, bundle_root)` | Ask a capability-compatible ACP agent for sessions, retain at most 50 whose reported working directory exactly matches the canonical active bundle root, and return bounded titles and timestamps. |
| `load_agent_session(connection_id, bundle_root, session_id)` | Load only a session ID returned by the filtered list on the same connection, reattach the scoped OKF MCP server, and return a bounded plain-text replay. |
| `scan_bundles(folder)` | Run [bundle detection](bundle-detection.md); return the list of roots with confidence. |
| `read_bundle(root)` | [Parse](okf-parsing.md) a root into a full [`Bundle`](data-model.md). |
| `fetch_remote_bundle(source)` | Fetch a [remote bundle](../features/bundle-switcher.md) (a GitHub repo tarball or a direct archive URL) into a local cache dir and return its path; the frontend then scans it like any folder. Blocking I/O runs off the UI thread. |
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

ACP reads, explicit context links, staged writes, reported diffs, checkpoints, and recovery records pass through Rust-owned root and path checks. The case-insensitive policy always denies Git metadata, common credential and secret paths, private-key formats, and packaged agent instructions. A thread edit grant cannot override it, and any invalid path rejects its whole proposed diff batch.

- **Read-only filesystem.** Only read/stat/watch operations are permitted on the chosen folder; no write/delete capability is granted there. Pointing the app at a folder cannot modify it. The store plugin's small writes (recent bundles, [settings](../ux/settings.md)) go to the app's own config directory, never into the scanned bundle scope.
- **Transcript export is an explicit destination write.** The webview supplies bounded Markdown and a safe basename only after the user chooses **Export**. Rust owns the native save dialog and the write, enforces a `.md` extension, and returns no absolute path. This grant applies to that one file selection; it does not grant bundle write access or persistent filesystem scope.
- **Scoped to the chosen folder.** Filesystem capability is constrained to the user-selected directory subtree (the dialog grants the scope). Nothing outside it is reachable. Reopening a recent bundle re-grants its stored folder scope — the [Bundle Switcher](../features/bundle-switcher.md) never reaches a path the user did not originally pick.
- **Asset reads are doubly contained.** `read_asset` (text) and `read_asset_data_url` (images) both resolve the requested path against the bundle root, canonicalize it (collapsing `..` and symlinks), and refuse anything that lands outside the root or whose extension is not on a small allowlist (text: `.html`/`.css`/`.svg`; images: `.png`/`.jpg`/`.gif`/`.webp`/`.avif`/`.svg`/…) — never `.md` (concepts are read via `read_bundle`) or arbitrary files. So even a hand-crafted bundle linking `../../etc/passwd` from an example reads as a clean miss, not a leak.
- **Images — and all embedded media — render offline.** A body image is rendered by **inlining a local bundle file** as a `data:` URL via `read_asset_data_url` — never by fetching a URL. A **remote** image is *not* auto-loaded (that would be an automatic network call); it degrades to an "open in browser" affordance, like a `resource` link. The render step strips every fetching attribute up front — `<img src>` (to `data-mdsrc`) and `srcset`, and `src`/`srcset`/`poster` on embedded `<video>`/`<audio>`/`<source>`/`<track>`, which have no offline resolver and render inert — so the webview never even attempts a fetch, whether the media came from markdown syntax or [embedded raw HTML](../features/concept-reader.md). Embedded HTML's inline styles are also contained: out-of-flow positioning is dropped so bundle content cannot overlay the app's UI.
- **Network: user-initiated only.** The app makes no automatic network calls and sends no telemetry. Update checks, agent installation and remote-agent activity, remote-bundle fetches, and URL source attachment each require an explicit user action. `fetch_remote_bundle` uses HTTPS, timeouts, a 128 MB download cap, and archive extraction that refuses entries outside the destination. `fetch_agent_source_url` disables environment proxies, requires HTTPS on the initial URL and up to three redirects, and rejects any literal or DNS-resolved private or special-use address. It accepts only an explicit supported text media type and at most 256 KiB of decompressed response data. The final URL and response digest travel with the source. URL attachment does not fetch remote PDFs, images, scripts, links, or page assets. `resource` URLs and remote reader images remain external-browser affordances, never implicit in-app fetches.
- **Least privilege in `capabilities/`.** The Tauri capabilities config enables exactly the permissions needed — `fs` (read), `dialog`, `store`, `opener`, the opt-in `updater` + `process` (restart-after-update), the **window** controls for the [custom title bar](../ux/browsing-layout.md) (start-dragging, start-resize-dragging, minimize, toggle-maximize, close, is-maximized), and `webview:allow-create-webview-window` so a reader tab can [undock into its own window](../proposals/multi-view.md) — nothing more (see [Tauri 2.0](../reference/tauri-2.md)). The capability covers the `main` window and the `pop-*` pop-out windows alike: a pop-out runs the same app with the same (read-only) surface, no extra grants.
- **Heavy work in Rust.** Parsing untrusted markdown happens in the core; the webview only renders sanitized output, reducing the attack surface of opening an unknown bundle.
- **Example previews are sandboxed and script-free.** An ODSF [example asset](../features/design-system-rendering.md) renders in a `sandbox`ed iframe with **no** `allow-scripts`, so even a bundle whose example HTML carries a `<script>` runs no JavaScript; `allow-same-origin` is granted only so the app can size the frame to its content. The app CSP allows the frame (`frame-src 'self' blob: data:`) while its inline styles stay under the existing `style-src 'unsafe-inline'`.
