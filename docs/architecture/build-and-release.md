---
type: Architecture Decision
title: Build & Release
description: How the app is built, packaged per OS, versioned, and shipped — offline, with no runtime phone-home.
tags: [architecture, decision, build, release, packaging]
timestamp: 2026-06-30T19:00:00Z
---

# Decision

The app ships as native installers per platform, built by `tauri build` on a per-OS CI matrix. No code signing and no auto-update are assumed for v1 — distribution is a manual download — and the build honors the offline principle by phoning home neither at build time nor at runtime.

# Packaging

`tauri build` produces the platform installers from one codebase (see [Tech Stack](tech-stack.md) and [Tauri 2.0](../reference/tauri-2.md)):

- **Windows:** `.msi` and/or NSIS `.exe`.
- **Ubuntu:** `.deb` and AppImage.

Each is a [self-contained, portable](../product/principles.md) artifact using the system webview — no bundled runtime the user must manage.

# CI and release workflows

Two GitHub Actions workflows (`.github/workflows/`):

- **`ci.yml`** — on every push to `main` and every pull request, runs the fast checks: the whole **frontend** (ESLint, `tsc` typecheck, the Vitest [suite](testing.md), and a production `vite build`) and the **Rust core** (`cargo clippy -D warnings` and `cargo test` on `okf-core`). `okf-core` is pure Rust — no WebKitGTK and no built frontend — so this stays quick. The full `src-tauri` compile is left to the release build, which exercises it on each OS.
- **`release.yml`** — when a GitHub **Release is published**, builds the installers on a **per-OS runner matrix** (an Ubuntu and a Windows runner), because the packaged artifacts are produced natively per platform; there is no reliable cross-compilation path. It uses the official `tauri-apps/tauri-action`, which runs `tauri build` (frontend via the config's `beforeBuildCommand`, then bundling) and **uploads the artifacts to the triggering release**. The Linux runner pins to an older Ubuntu so the `.deb`/AppImage stay widely compatible.

# Code signing

**No code signing is assumed for v1.** Users may see an OS "unverified publisher" prompt on first launch. Signing certificates (Windows Authenticode, and notarization where applicable) are a post-v1 hardening step, not a launch blocker.

# Versioning

Two version numbers stay deliberately distinct:

- **Application version** — semver (`MAJOR.MINOR.PATCH`) on the OKF Viewer app itself, set in the Tauri config and shown in the about/settings surface.
- **`okf_version`** — the version of the OKF **format** a bundle declares in its root `index.md` (see [OKF Spec Summary](../reference/okf-spec-summary.md)). The app reads and displays this; it is a property of the data, never of the app. A new app release does not change a bundle's `okf_version`, and vice versa.

# Updates

In v1, updates are a **manual download** of the new installer — consistent with the offline, no-account stance. **Auto-update** (Tauri's updater) is a deliberate post-v1 idea, recorded as out of scope for now (see [Scope & Non-Goals](../product/scope-and-non-goals.md)); adopting it later would mean introducing a network path, which must be weighed against the offline principle.

# Install & uninstall

Following platform install best practices: installers target a **per-user install where the platform allows**, avoiding admin elevation and reboots. **Uninstalling removes the app binaries**; the only user data is in the app's own config directory (recent bundles and [settings](../ux/settings.md) via the store plugin — see [IPC & Security](ipc-and-security.md)), which the user can keep or clear. Nothing is written system-wide and nothing phones home, so there is no residue to chase.

# Offline build, no phone-home

The [local-first / offline principle](../product/principles.md) extends to the build. The shipped binary declares **no network capability** ([IPC & Security](ipc-and-security.md)): no telemetry, no update check, no license call. There is nothing to disable for air-gapped use — the absence of a network path is the default, by construction.
