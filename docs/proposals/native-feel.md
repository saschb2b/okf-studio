---
type: Proposal
title: Native Desktop Feel
description: Disable webview page-zoom and scope zoom to content, and suppress web defaults (chrome text selection, default menus, link-styled rows, browser scrollbars).
status: proposed
tags: [proposal, native, desktop, interaction, ux]
timestamp: 2026-06-28T17:00:00Z
---

# The ask

`Ctrl/Cmd` +/-/0 and `Ctrl/Cmd`+wheel currently zoom the **whole app** like a web page, reflowing the three-pane shell — webapp behavior. This is a desktop app and must feel native: interactions, components, visuals, scrollbars, context menus, modifier keys, drag, window chrome should follow OS conventions. Everything, from components down to interaction and visuals, should feel native, not like a website.

# Problem

The app inherits the system webview's web defaults and suppresses none of them. Confirmed in the code: **no** `user-select` rules, **no** `contextmenu` handler, **no** page-zoom guard, **no** `data-tauri-drag-region`, and default browser scrollbars/cursors throughout. The zoom issue is doubly wrong because the [graph](../features/graph-view.md) already implements its own cursor-anchored canvas zoom — so a `Ctrl`+wheel over the graph can fight two zoom systems at once. The native answer to "I need bigger text" is **not** browser page-zoom; it is respecting the OS text-size setting plus an in-app, content-scoped text-size control.

# Recommendation (prioritized)

**P0 — Kill page-zoom, scope zoom to content.**
- A document-level guard `preventDefault`s `(ctrl||meta)+(+,-,=,0)` and `ctrl`+wheel/pinch. Attach `wheel` as non-passive **capture**, acting only when `ctrlKey`, so normal scroll stays passive. (On Linux/WebKitGTK — the primary target — there is *no* native flag, so JS interception is the floor; reinforce on Windows with `zoom_hotkeys_enabled(false)`.)
- **Remap, don't just swallow** — preserve the a11y intent: route those keys/gestures to the graph's canvas zoom (over the graph) or a reader text-size control (elsewhere). Let the canvas handler own canvas events so the two don't double-fire.

**P1 — Suppress web chrome affordances.**
- Global `user-select: none` (+ `-webkit-`) on chrome; opt back **in** with `user-select: text` on the [reader](../features/concept-reader.md) body, code blocks, and selectable values.
- `contextmenu` `preventDefault` on chrome; keep a copy / select-all menu on the reader. A real native context/menu-bar is the upgrade path and the **only** new capability (`menu`) — call it out explicitly; everything else needs no new [permission](../architecture/ipc-and-security.md).

**P2 — Native visuals.**
- Theme-token scrollbars with `scrollbar-gutter: stable` on panes/panels (no layout shift when a scrollbar appears).
- De-link relation rows (currently styled as blue web hyperlinks) into native hover rows; reserve link styling for true external `resource:` links (which already open in the OS browser).
- Cursor discipline per surface (`default` on chrome, `text` on selectable text, `grab` on the canvas — generalize what the graph already does).

**P3 — Text size as a first-class setting.**
- A reader text-size control in [Settings](../ux/settings.md), persisted via the store, applied as a reader-scoped scale — patterned on the existing `reduceMotion` → `:root` attribute mechanism. This is the native replacement for the page-zoom that was removed.

# Risks & alignment

- **Offline / read-only / scoped** ([principles](../product/principles.md)): all of P0–P3 are pure webview + CSS + the existing store — no network, no filesystem, no new capability except the optional `menu` for native menus.
- **Accessibility (the real risk)**: blanket-suppressing `Ctrl+=` would *remove* a zoom affordance for low-vision users — so the remap to content text-size / graph zoom is **mandatory**, not optional; respect OS text scaling; preserve focus rings and `reduceMotion`.
- **Cross-platform**: don't rely on the Windows-only flag — Linux needs the JS floor; verify the non-passive `wheel` listener doesn't regress scroll momentum on WebKitGTK.
- **Token discipline** ([theming](../ux/theming.md)): scrollbar colors, cursors, hover states from `var(--…)`, no literals.

# Definition of done (later)

- `Ctrl/Cmd` +/-/0 and `Ctrl/Cmd`+wheel never change app/window scale on Windows, Linux, and macOS (verified on WebKitGTK); trackpad pinch over the graph zooms the canvas, not the page.
- Those combos are **remapped** to graph zoom / reader text-size (affordance preserved).
- Dragging across the toolbar/sidebar/badges selects no text; the reader body and code blocks stay selectable/copyable.
- No default browser context menu on chrome; the reader offers at least copy / select-all.
- Theme-matched scrollbars with stable gutters; relation rows read as native list rows; external `resource:` links still open in the OS browser.
- A persisted reader text-size setting survives restart (mirrors `reduceMotion`).
- No new capability beyond the optional, documented `menu`; CSP unchanged; app still works offline.
- [Keyboard Shortcuts](../ux/keyboard-shortcuts.md) and [Theming](../ux/theming.md) updated to reflect the behavior.
