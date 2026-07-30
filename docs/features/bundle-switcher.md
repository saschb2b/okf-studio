---
type: Feature
title: Bundle Switcher
description: A top-left popover that names the open bundle and switches among sibling bundles in the folder and recently-opened bundles, or opens a new folder.
tags: [feature, navigation, bundles, switcher]
generated: { by: claude/unrecorded, at: 2026-07-16T23:30:00Z }
---

# What it does

The top-left of the [top bar](../ux/browsing-layout.md) names the **currently open bundle**. Click it and a popover opens for switching context. The targets are another bundle detected in the open folder, a recently-opened bundle, or a brand-new folder. The switcher consolidates two scattered surfaces, the old sidebar bundle list and the recent list buried in [Settings](../ux/settings.md). Switching context becomes an always-visible action, in the spirit of Zed's project switcher.

# Why "bundle", and the folder underneath

OKF's unit is the **bundle** ([glossary](../reference/glossary.md)), so the switcher's unit is the bundle. The trigger names a bundle and recents are bundles. In the common case (a folder holding exactly one bundle) the two collapse and the distinction is invisible.

The **folder** stays underneath as the [security scope](../architecture/ipc-and-security.md). Rust registers only a folder returned by the native picker, or a cache created by a completed remote fetch. One folder may hold several bundles ([Folder Autodetect](folder-autodetect.md)). Each recent bundle records the folder that locates its Rust-owned grant. Reopening works only while that independent grant remains valid. Making the folder an entity in its own right, one that groups the bundles it contains, is a deliberate [post-v1 direction](../product/scope-and-non-goals.md).

# The trigger

- A button at the **top-left of the top bar**, with a chevron pinned to its right edge. Its label is the active bundle's name: the root `index.md` first `# Heading`, or the directory name as a fallback.
- A smaller secondary line shows the **folder** the bundle lives in, since one folder can hold several bundles.
- The trigger is **fixed-width**, so switching bundles never reflows the chrome. Long names ellipsize. It leads with the **app's brand tile** (the icon's dark rounded tile with the blueto violet folder mark), the classic app-icon-in-the-titlebar-corner. The tile shows in both the loaded and the "Open a folder…" states. It is the one deliberate spot of brand color in an otherwise quiet chrome.
- With nothing open, the label reads **"Open a folder…"** and clicking goes straight to the OS picker (the [First Run](../ux/first-run.md) empty state).

# The popover

Top to bottom, keyboard-first (a Base UI Popover with a filter input):

- **Search field**: placeholder "Search bundles…". It fuzzy-filters the lists below while keeping the section headers as group labels. It differs from the [global launcher](command-palette.md). The launcher jumps *within* a bundle to concepts and actions, while this field only narrows the switcher's own lists.
- **Bundles in this folder**: the bundles [autodetected](folder-autodetect.md) in the currently open folder, the active one marked ✓. Each row carries the name and the relative path. A bundle at the folder's root shows the folder's own name, never a bare ".". A right column holds two **labeled** lines mirroring the pair on the left, "N concepts" over "M types". Earlier revisions showed per-`type` color dots here instead. The design dropped them as decoration. The [palette](../ux/theming.md) assigns hues per bundle, so the same color means different types across rows, and an unlabeled count next to unlabeled dots explained neither. A full name + path tooltip covers what truncation hides. The section shows whenever a folder is open, and a single-bundle folder shows one row.
- **Pinned** *(when any exist)*: bundles the user pinned, kept above recents so frequently-used contexts stay one click away. Pinning is a deliberate differentiator, since the IDEs surveyed order recents by recency only.
- **Recent bundles**: recently-opened bundles **not** already listed under the current folder, newest first. Each row shows the bundle name with its folder/path dimmed beneath. The right column carries "N concepts" over a **relative last-opened time** ("3d ago"), so freshness reads at a glance. Per-row **pin** and **remove** (✕) appear on hover.
- **Footer actions**, in two tiers separated by a hairline so opening and creating never read as one list. Opening an existing bundle: **Open folder…** (primary, the OS picker, `Ctrl/Cmd + O`) and **Open from URL…** (`Ctrl/Cmd + Shift + O`). The second opens the [remote-bundle dialog](#opening-from-a-url). Paste a GitHub URL (a repo, or a `tree`/`blob` subpath) or a direct archive link. Studio fetches it into a local cache, then opens it exactly like a picked folder. Starting a new one: **New bundle…**, the agent-free [Create Bundle](create-bundle.md) form, so an existing user starts fresh without leaving the switcher.

# Opening from a URL

Studio fetches a **remote bundle** once, and never streams it. Studio downloads the bundle into a local cache directory, then opens that directory exactly like a [picked folder](folder-autodetect.md): scan, read, [live-reload](live-reload.md), and recents all unchanged. This keeps the [read-only, local-first stance](../product/principles.md) intact. The only new thing is *how the folder got there*.

- **Scope, deliberately narrow.** Studio accepts a **GitHub** repo or a **direct archive** URL (`.tar.gz`/`.tgz`/`.tar`/`.zip`). It fetches the GitHub repo as a tarball through GitHub's own archive endpoint, with no git binary and no clone/pull/sync surface. A GitHub URL may name a `tree`/`blob` **subpath**, so you can open a bundle inside a repo subdirectory (this docs bundle is `…/okf-studio/tree/main/docs`). Cloning arbitrary git hosts is **out of scope**. That's a local `git clone` away, and libgit2 would drag in sync flows the viewer has no business owning. See [Scope and Non-Goals](../product/scope-and-non-goals.md).
- **The dialog** parses the URL **network-free as you type** and previews exactly what it will fetch: a `GitHub · owner/repo · ref · /subpath` chip, or an "unrecognized URL" note. Studio fetches nothing until you confirm with **Open**. Its idle hint states that no request goes out before that action, then distinguishes the downloaded local cache from the remote source. It carries a first-run **example** card (this docs bundle), so a new user with no local bundle can see Studio work in one step. The example **prefills** the field rather than auto-fetching, which keeps the "no network without a click" contract. See [First Run](../ux/first-run.md).
- **The open runs in two phases: fetch, then [scan](folder-autodetect.md) the cache. Studio switches nothing until the scan returns a result.** The scan drives one of three outcomes:
  - **No bundle.** A URL can download fine and still hold no bundle, because [detection](../architecture/bundle-detection.md) found no `index.md` with `okf_version` and no typed concept. It is a repo of plain files, or the wrong subpath. The dialog stays open with a **calm "No OKF bundle at that URL"** panel, distinct from a red fetch/network error, since the download *succeeded*. That panel names what Studio fetched and what a bundle is, and (when you gave no subpath) hints the bundle may live in a subfolder. The previous bundle stays put, and Studio never swaps it silently for nothing ([report, never refuse](../ux/empty-and-error-states.md)).
  - **One bundle.** Opens directly and the dialog closes.
  - **Several bundles**, from a URL pointing at a folder-of-bundles like `okf/bundles`. The dialog shows a **picker** instead of guessing which to open, one row per bundle with its name and `N concepts · M types`. Picking a row opens that bundle. Every row shares the one fetched copy, so switching between them later is instant. This is why a folder-of-bundles URL never merges into one giant view.
- **Fetch guards** live in the [Rust core](../architecture/ipc-and-security.md). They are https-only, request timeouts, a download size cap, and archive extraction that refuses any entry escaping the destination (no zip-slip or `../` traversal). This is one of Studio's explicit Rust-owned network paths. It runs **only** after **Open** or **Refresh from source**. Provider setup, agent installation, model use, source fetches, and updates have their own separate user actions and limits.
- **Remote recents** work like any other recent. A remote entry carries its origin URL (a 🌐 badge and the `owner/repo` origin as its sub-line) and a **Refresh from source** action that re-fetches the latest. That refresh is always an explicit click, never silent. Reopening a remote recent reuses the local cache instantly, and re-fetches only if the cache is gone.

# Behavior

- Selecting a bundle drives the single shared selection the rest of the app uses, and loads the bundle into the [Graph View](graph-view.md) and [Reader](concept-reader.md). Switching is instant because the [core](../architecture/performance.md) caches parsed bundles per root.
- Selecting a **recent** bundle asks Rust to use the independently remembered grant for its folder, re-detects if needed, and reopens the bundle. A forged or revoked frontend entry cannot create access. A **remote** recent whose cache is gone re-fetches from its origin first, and the completed fetch registers the replacement cache root.
- **Recents persist** (bundle root + folder locator + timestamp) via the [store plugin](../architecture/ipc-and-security.md), recency-ordered, with the current folder's bundles excluded. **Pin** keeps one above the recency churn. Removing the last inactive recent from a folder also revokes its Rust grant. Removing an entry for the open folder keeps that live access until you close the folder.
- A folder that no longer exists fails into the recoverable ["path is gone"](../ux/empty-and-error-states.md) prompt, offering to forget the stale entry rather than erroring.

# Empty states

The [report-never-refuse stance](../ux/empty-and-error-states.md) drives all four. With nothing open, the trigger reads "Open a folder…" and the popover shows only the footer plus any recents. A folder with **zero bundles** gets the inline "what an OKF bundle is" note with a [spec-summary](../reference/okf-spec-summary.md) link. With **no recents yet**, the section reads "Bundles you open will show up here." A **search with no matches** says "No matches" in each group. The onboarding copy appears only when there are genuinely no recents.

# Keyboard

- **`Ctrl/Cmd + P`** opens the switcher (mnemonic: pick a bundle). It does not collide with the [launcher](command-palette.md) (`Ctrl/Cmd + K` / `/`), **Open folder** (`Ctrl/Cmd + O`), or **Re-scan** (`R`). See [Keyboard Shortcuts](../ux/keyboard-shortcuts.md).
- Inside the popover: type to filter, `↑` / `↓` to move, `Enter` to switch, `Esc` to dismiss, the same contract as the launcher. Pressing `↓` from the search enters the list at its first row. Pressing `↑` from the first row returns to the search, so the loop never dead-ends.
