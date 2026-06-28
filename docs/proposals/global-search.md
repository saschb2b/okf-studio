---
type: Proposal
title: Global Search Launcher
description: Move search out of the sidebar into an always-on header entry point with a hotkey-invoked fuzzy dialog, merging it with the command palette.
status: proposed
tags: [proposal, search, ux, navigation]
timestamp: 2026-06-28T17:00:00Z
---

# The ask

Search lives at the top of the left [sidebar](../ux/browsing-layout.md) today, so it scrolls away and disappears when the sidebar is collapsed (`[`) — exactly when a user deep in content most wants to jump. Move a search entry point into the **header** for always-on access, give it a global **hotkey**, and have it open a **dialog with autocomplete and fuzzy matching**. Prior art: the author's homepage search at `~/Documents/GitHub/homepage` (a `Ctrl/Cmd+K` Fuse.js palette).

# Problem

The app already has *two* "find a thing" surfaces with overlapping fuzzy logic: the [Command Palette](../features/command-palette.md) (`Ctrl/Cmd+K`, jump-to-concept + actions, matches id/title/type) and the in-sidebar [Search & Filter](../features/search-and-filter.md) (the only surface that searches **body text** and narrows the view in place). Adding a third dialog without resolving this teaches users to guess. There is also a latent bug: `/` focuses the sidebar search input even when the sidebar is collapsed, so it becomes a silent dead key.

# Recommendation — one launcher, not a third surface

- **Header entry point.** A persistent search affordance in the top bar (magnifying glass + a platform-correct hint: `⌘K` / `Ctrl K`) opens the launcher.
- **Keep `Ctrl/Cmd+K`; make `/` a synonym** that opens the same launcher (fixing the collapsed-sidebar dead key). Don't remap muscle memory.
- **Evolve the existing palette into the launcher** (it already has the ARIA combobox scaffolding) with **dynamic result groups**: *Recent* (zero-query default — recents, which the homepage lacks), *Concepts* (fuzzy id/title/type), *In text* (full-text over description + body, with a highlighted snippet), *Actions*. Title/prefix hits always outrank body hits.
- **Fuzzy + highlight via Fuse.js**, built **in-memory** from the parsed bundle — borrow the homepage's weighted-key config (title ≫ id/type ≫ body, `threshold ≈ 0.3`, `includeMatches`) but **never its `/api/search` data source**, which would violate the offline [principle](../product/principles.md).
- **Keep the sidebar filter** for its distinct job: live in-view narrowing (dimming the [graph](../features/graph-view.md), filtering the tree). Launcher = go-to; sidebar filter = narrow the view.

# Risks & alignment

- **Offline / fast** ([principles](../product/principles.md)): index in-memory, built once per bundle load (memoized), debounce body-text search; concept/action groups stay instant.
- **Vendor-neutral / tolerant**: groups derive from the bundle's real `type` values, never a hard-coded list; tolerate missing fields.
- **Keyboard / a11y**: reuse the palette's combobox roles; **rewrite the focus trap** to cycle real focusables once a header button/groups exist; add an `aria-live` result count; restore focus to the trigger on close; don't interrupt IME composition.

# Definition of done (later)

- Always-visible header search affordance with a platform-correct shortcut hint; click opens the launcher.
- `Ctrl/Cmd+K` and `/` both open it; `/` no longer focuses a hidden input.
- Fuzzy match over id/title/type/description/**body**, fully offline; grouped results (Recent/Concepts/In text/Actions) with highlighted matches and a snippet on text hits; zero-query shows recents + actions.
- Full keyboard operation; selecting a concept drives the shared selection so all three panes sync.
- [Keyboard Shortcuts](../ux/keyboard-shortcuts.md), [Command Palette](../features/command-palette.md), [Search & Filter](../features/search-and-filter.md), and [Browsing Layout](../ux/browsing-layout.md) updated to the merged model.

# Citations

[1] Prior art — homepage search palette (Fuse.js v7.1.0, `Ctrl/Cmd+K`, weighted keys, grouped results): `~/Documents/GitHub/homepage/components/SearchPalette.tsx`, `Header.tsx`.
