---
type: Reference
title: Tauri 2.0
description: Key facts about Tauri 2.0 — architecture, plugins, the permissions model, and per-platform prerequisites — for building OKF Studio.
resource: https://tauri.app/
tags: [reference, tauri, rust, external]
timestamp: 2026-07-17T10:39:43Z
---

# Summary

Tauri is a framework for building small, fast, secure desktop (and mobile) apps with a **Rust backend** and a frontend rendered in the **operating system's native webview** (WebView2 on Windows, WebKitGTK on Linux, WKWebView on macOS) — so no Chromium is bundled. This is a dated snapshot for implementers; verify against the live docs (`resource`).

# What we use

- **Core model:** Rust "core" process + webview "frontend." They communicate over **commands** (frontend → Rust, request/response) and **events** (Rust → frontend, streaming). This is our [IPC surface](../architecture/ipc-and-security.md).
- **Plugins (official):**
  - `tauri-plugin-dialog` — native file/folder pickers ([First Run](../ux/first-run.md)).
  - `tauri-plugin-store` — small persisted key/value (recent folders, settings).
  - `tauri-plugin-notification` — opt-in local desktop notification permission and delivery for private background-thread state.
  - File watching via the Rust `notify` crate (or an fs-watch plugin), surfaced as events for [Live Reload](../features/live-reload.md).
- **Capabilities & permissions (v2):** access is denied by default; a `capabilities/` config grants specific permissions scoped to windows. Studio grants the webview store, opener, updater, notification, and window capabilities, but no dialog, filesystem, or general network capability. Typed Rust commands own filesystem, fetch, and agent operations behind the [IPC boundary](../architecture/ipc-and-security.md).

# Project shape

```
okf-studio/
  src/            # frontend (web app)
  src-tauri/      # Rust core: Cargo.toml, tauri.conf.json, capabilities/, src/
  docs/           # this OKF bundle (also the built-in sample)
```

# Tooling & commands

- Scaffold: `pnpm create tauri-app` (choose the v2 template + React + TypeScript).
- Dev: `pnpm tauri dev` (hot-reloads frontend, rebuilds Rust on change).
- Build installers: `pnpm tauri build` → Windows `.msi`/`.exe`, Linux `.deb`/AppImage.

# Per-platform prerequisites

- **All:** a recent stable **Rust** toolchain + Node.js.
- **Ubuntu/Linux:** `webkit2gtk` (4.1) dev libs, `build-essential`, `libssl-dev`, `librsvg2-dev`, and related GTK packages.
- **Windows:** **WebView2 runtime** (preinstalled on Win 11) and the **MSVC** C++ build tools.

# Citations

[1] [Tauri](https://tauri.app/)
[2] [Tauri v2 documentation](https://v2.tauri.app/)
