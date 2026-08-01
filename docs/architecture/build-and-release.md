---
type: Architecture Decision
title: Build and Release
description: How the app is versioned, packaged per OS and as an Android APK, released, and updated with one disclosed launch check and user-initiated installs.
tags: [architecture, decision, build, release, packaging, android]
generated: { by: claude/unrecorded, at: 2026-08-01T09:12:00+02:00 }
---

# Decision

The app ships as native installers per platform, built by `tauri build` on a per-OS CI matrix, plus one Android APK for tablets. No OS code signing for v1 (users see an "unverified publisher" prompt). The user always starts an update install, through Tauri's signed updater on desktop and by installing a new APK on Android.

The one automatic network call the shipped binary makes is a single quiet release check shortly after launch. It feeds the update badge. [Settings](../ux/settings.md) discloses it. The check carries no identity or telemetry, and an off switch restores strictly on-demand checking.

# Packaging

`tauri build` produces the platform installers from one codebase (see [Tech Stack](tech-stack.md) and [Tauri 2.0](../reference/tauri-2.md)):

- **Windows:** `.msi` and/or NSIS `.exe`.
- **Ubuntu:** `.deb` and AppImage.
- **Android:** one universal `.apk`.

Each is a [self-contained, portable](../product/principles.md) artifact that uses the system webview. There is no bundled runtime the user must manage.

## Android

The Android build exists so a bundle on a tablet can be opened, read, questioned, and changed, from the same codebase. `tauri android build --apk` cross-compiles the Rust core for the four Android ABIs and packs them into one universal APK, so nobody has to know their own CPU to pick a download. The Gradle project lives in `src-tauri/gen/android`. It is generated once by `tauri android init` and then committed, because the signing config and the manifest are edited by hand from there on; the parts each build rewrites stay git-ignored.

Three boundaries the desktop build does not have:

- **The plugins differ.** `tauri-plugin-updater`, `tauri-plugin-process`, `tauri-plugin-window-state`, and `tauri-plugin-single-instance` are compiled out on Android in `Cargo.toml`, so the permissions naming them cannot sit in the default capability file. They live in `capabilities/desktop.json`, scoped with `"platforms"`. A permission for a plugin that is not in the build fails the build rather than being ignored, which is the behavior worth having.
- **Choosing a folder works differently.** Android's own picker returns a `content://` URI, which `std::fs` cannot open, and adopting the Storage Access Framework would mean rewriting every read and write in the app against a URI abstraction while leaving the OKF core and the file watcher unable to see the files. So the app asks for `MANAGE_EXTERNAL_STORAGE` instead, which makes shared storage an ordinary path tree, and ships its own folder browser to replace the missing picker (`src-tauri/src/mobile_storage.rs`, `FolderBrowser.tsx`). The user turns the permission on once, on a system screen the app can open but cannot decide for them. The cost is worth stating: it is a broad permission, and Google Play requires a declared justification for it. This build is sideloaded.
- **ACP agents cannot run.** A catalog or custom agent is a binary that Studio starts as a child process. Android does not execute binaries from app storage, so that path is closed and nothing can reopen it from here. The [agent panel](../features/agent-panel.md) still works over HTTP, since an endpoint profile talks to an OpenAI-compatible URL with no process involved. On a tablet the choice of agent is therefore an API key or a reachable endpoint, not a locally installed CLI.
- **Git operations are unavailable.** The [Git integration](git-integration.md) runs the `git` binary, and Android has none. The repository panel reports itself unavailable, which is the same state it already shows for a bundle outside a repository. A pure-Rust Git implementation would lift this; nothing else in the design has to change for it.

The shell adapts rather than being ported. Android is one full-screen activity with system-drawn bars, so the frontend drops the caption buttons, the window-drag region, the resize handles, and the rounded frame, and grows the icon controls to a 44px touch target. One flag decides it (`isAndroidShell` in `src/shared/platform/platform.ts`), set from the webview's user-agent so no plugin, permission, or async boot hop is needed.

Clearing the system bars is the one piece the frontend cannot do. Android 15 and later draw every app edge to edge with no opt-out, and a WebView is never told: `env(safe-area-inset-*)` reports 0 inside the page even under `viewport-fit=cover`, which put the top bar under the status bar clock and the status bar under the gesture pill. `MainActivity.kt` pads the content view with the real window insets instead, the on-screen keyboard included, so a focused field is never left behind the keyboard. The strips this leaves take the app's chrome color from `values/colors.xml` and its `values-night` pair, which track `--bg-chrome` in `src/styles.css`.

# CI and release workflows

Pull-request CI includes a dedicated Ubuntu 24.04 agent-sandbox job. It installs the distribution Bubblewrap package and the native Tauri build dependencies. It allows unprivileged user namespaces where the image's AppArmor gate would deny them. It then requires the restricted-host fixture to execute through the trusted backend.

The 24.04 image is a floor, not a preference. The compiled policy passes `--disable-userns`, which Bubblewrap gained in 0.8, while 22.04 ships 0.6.1. The fixture checks the empty-root mount policy against real kernel namespaces. It does not treat the cross-platform argument-builder tests as Linux enforcement proof.

Two GitHub Actions workflows (`.github/workflows/`):

- `ci.yml`: on every push to `main` and every pull request, runs the fast checks. Those cover the whole frontend: ESLint, the `tsc` typecheck, the Vitest [suite](testing.md), and a production `vite build`. They also cover the Rust core, with `cargo clippy -D warnings` and `cargo test` on `okf-core`. The `okf-core` crate is pure Rust, with no WebKitGTK and no built frontend, so this stays quick. The release build handles the full `src-tauri` compile and exercises it on each OS.
- `release.yml`: when a maintainer publishes a GitHub Release, builds the installers on a runner matrix. Each runner packages its artifacts natively, because there is no reliable cross-compilation path. The job calls the official `tauri-apps/tauri-action`, which runs `tauri build` (frontend through the config's `beforeBuildCommand`, then bundling) and uploads the artifacts to the triggering release. The matrix splits by how each artifact links its libraries:
  - **`.deb` on the oldest supported Ubuntu (22.04)**: it links against the *system* WebKitGTK/glib. An older base therefore keeps it installable on 22.04 and every newer release.
  - **AppImage on the current Ubuntu LTS**: it *bundles* glib/Mesa, so it needs a modern base. An AppImage built on 22.04 fails on newer hosts. It hits a glib symbol mismatch with the host's GVfs modules, then `EGL_BAD_PARAMETER` when WebKit's bundled GL stack can't init. Building on the current LTS makes the bundled libraries match modern systems.
  - **Windows on `windows-latest`**: `.msi` + NSIS `.exe`.

  The matrix restricts each Linux runner to its one bundle target (`--bundles deb` / `--bundles appimage`), so a runner never emits the other's (broken) artifact.

  The same workflow carries a separate **Android** job. It is not a matrix row, because `tauri-action` bundles desktop targets only: the job sets up JDK 21 and a pinned NDK, runs `tauri android build --apk`, renames the APK after the release tag, and uploads it with the `gh` CLI. Android is the one target that does cross-compile reliably, so it builds on the same Ubuntu runner as everything else.

# Code signing

Studio assumes no code signing for v1. Users may see an OS "unverified publisher" prompt on first launch. Signing certificates (Windows Authenticode, and notarization where applicable) are a post-v1 hardening step, not a launch blocker.

Android is the exception, because there an unsigned release APK cannot be installed at all. The released APK is signed with a shared debug key committed at `src-tauri/gen/android/debug.keystore`. Its password is public, so the signature identifies nobody. What it buys is that every release carries the *same* signature, and Android refuses an update whose signature changed. A real key drops in through a git-ignored `keystore.properties` beside `gradlew`, with no Gradle edit. Make that switch before any store listing rather than after: changing the key forces every installed user to uninstall first, losing their app data. Sideloading still asks the user to allow installs from the browser or file manager, which is the "unverified publisher" prompt in its Android form.

# Versioning

Two version numbers stay deliberately distinct:

- **Application version**: semver (`MAJOR.MINOR.PATCH`) on the OKF Studio app itself, shown in the about/settings surface.
- `okf_version`: the version of the OKF format a bundle declares in its root `index.md` (see [OKF Spec Summary](../reference/okf-spec-summary.md)). The app reads and displays this quietly, in the [status bar](../ux/browsing-layout.md). It is a property of the data, never of the app. A new app release does not change a bundle's `okf_version`, and vice versa. A bundle that is also an [ODSF](../features/design-system-rendering.md) design system declares an `odsf_version` in the same root frontmatter. The core reads it alongside `okf_version` and the app shows both. That is equally a property of the data.

## One source of truth, one writer, one gate

The application version cannot live in a single file. Cargo, npm, the marketing site, and the design system each need it in their own format, and they share no manifest. It lives in nine places. A maintainer bumped three releases in a row by hand across all of them, with nothing checking they agreed.

A disagreement is quiet. The installer filename, the updater manifest, and the download page can each claim a different number. The first symptom is a user offered an update that the updater then refuses to apply.

- `package.json` is the source of truth. The Tauri config no longer repeats it. Its `version` field is the path `../package.json`, which Tauri resolves at build time. That is one fewer literal, and `check:version` rejects a plain number reappearing in that field.
- One writer: `pnpm version:set <version>` bumps every place, including the two `Cargo.lock` entries. Nobody edits a file by hand at release time.
- One gate: `pnpm check:version` runs in [CI](testing.md) on every push and pull request. The `scripts/check-version.mjs` file holds a single table of the places and their patterns. Both the check and the writer read that table, so they always cover the same places. A pattern that stops matching is a failure, not a silent pass. The gate also reports a version literal in an undeclared file as a new place to declare. It scans the manifests, the site, the design system, the benchmarks, and the workflows.
- A bump needs release notes. The gate also requires a matching `**Release**: <version>` entry in the bundle's `log.md`. Nobody can then tag a version with nothing recorded about what it contains.

Not covered: the undeclared-literal scan skips `src/` and `crates/`. The app reads its own version from the build rather than a literal, and both trees carry unrelated third-party version strings. The scan also skips Markdown outside the two declared design-system files, since prose cites past releases and should.

# Updates

The user starts every update install, through Tauri's updater plugin. Checking has two paths. Both hit the same stable endpoint, GitHub's `releases/latest/download/latest.json`, which always serves the newest release's updater manifest. `tauri-action` generates and uploads that manifest through `includeUpdaterJson`.

- a quiet launch check, once per launch and in the main window only. It runs only while the on-by-default "New release badge" setting is on. Its one output is the badge on the Settings icon. Failures and offline launches show nothing, and pop-out windows and web or dev builds never check.
- the explicit **"Check for updates"** action in [Settings](../ux/settings.md).

The quiet check is the deliberate, narrow exception to the offline-by-default stance (see [Design Principles](../product/principles.md)). It reads a version file with no identity attached. It exists because releases went unnoticed while discovery required remembering to ask. Turning the badge setting off removes the automatic call entirely.

- Signing is mandatory. The updater verifies a minisign signature on each artifact, and nobody can turn that off. The public key lives in `tauri.conf.json`. The private key and password are CI secrets (`TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`). This is separate from OS code-signing, which Studio still does not do.
- Update vehicles: the AppImage (Linux) and NSIS (Windows) self-install in place. A `.deb` install cannot self-replace, because the OS package manager owns it. A small `can_self_update` command detects that case by checking for the AppImage runtime. Studio then shows the same in-app "version X available" hint plus a Download link to the releases page, instead of a failing in-app install. So `.deb` users still find out about updates. They install by downloading the new package.

Silent and automatic installs remain out of scope: bytes only ever download and apply on an explicit user action. The automatic part stops at "a newer version exists", rendered as a quiet badge.

# Install and uninstall

Installers target a per-user install where the platform allows. The user then needs no admin rights and no reboot. An existing OKF Viewer installation upgrades in place because Studio retains the application identifier, app-data location, updater repository, and store name. The [migration notes](../product/migration-notes.md) list every compatibility name and retained data surface.

Uninstalling removes the app binaries. App data and cache data can remain for a later reinstall, including preferences, recent bundles, agent profiles, managed runtimes, thread pointers, and restore checkpoints. API-key-backed Studio Agent profiles keep their keys in the operating-system credential store. The keys stay until the profile removes them, or until the user removes them through the operating system. Studio writes no telemetry or license state.

# Offline build, no phone-home

The [local-first / offline principle](../product/principles.md) extends to the build. The shipped binary sends no telemetry and makes no license call. Its one automatic network path is the quiet launch release check under Updates. That check reads a public static version file, carries no identity, and one setting turns it off. The user starts everything else that touches the network.

An air-gapped install stays fully functional. The failed launch check is silent, and turning the badge setting off stops every outbound call.
