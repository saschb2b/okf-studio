---
type: Reference
title: Keyboard Shortcuts
description: The default keybindings; every primary action is reachable without a mouse.
tags: [ux, keyboard, accessibility]
timestamp: 2026-07-08T12:00:00Z
---

# Defaults

`Cmd` on macOS, `Ctrl` on Windows/Ubuntu. These realize the [keyboard-friendly principle](../product/principles.md).

| Keys | Action |
|------|--------|
| `Ctrl/Cmd + O` | Open folder ([First Run](first-run.md)) |
| `Ctrl/Cmd + Shift + O` | Open from URL — fetch a [remote bundle](../features/bundle-switcher.md) |
| `Ctrl/Cmd + P` | Open the [Bundle Switcher](../features/bundle-switcher.md) — switch bundle, reopen a recent, or open a folder |
| `Ctrl/Cmd + K` or `/` | Open the global search [launcher](../features/command-palette.md) — jump to a concept, full-text search, or run a command |
| `Esc` | Close the launcher / dialog / deselect |
| `↑` `↓` | Move through results / the sidebar |
| `Enter` | Open the highlighted concept |
| `←` `→` (Alt) | Back / forward in [navigation history](../features/navigation.md) (per tab) |
| `Ctrl/Cmd + T` | New reader [tab](../features/navigation.md) (empty; pick its concept anywhere) |
| `Ctrl/Cmd + W` | Close the active tab (the last tab never closes) |
| `Ctrl + Tab` / `Ctrl + Shift + Tab` | Next / previous tab |
| `Ctrl/Cmd + click` | Open a concept link in a new background tab (`+ Shift` to switch to it) |
| `Ctrl/Cmd + 1` `2` `3` | Layout: graph-only / split / reader-only |
| `\` | Cycle the [layout mode](browsing-layout.md) |
| `V` | Cycle the [visualization](../features/viz-views.md): graph / treemap / sunburst / circle packing |
| `+` `-` | Zoom the [graph](../features/graph-view.md) in / out |
| `F` | Fit graph to view |
| `Ctrl/Cmd + +` `-` `0` | Reader text size: bigger / smaller / reset (content zoom, not page zoom) |
| `[` `]` | Collapse / expand the sidebar and reader |
| `O` | Toggle the [bundle overview](../proposals/bundle-overview.md) landing |
| `T` | Toggle the [lineage](../proposals/lineage-and-traversal.md) panel — trace the active concept |
| `L` | Toggle the `log.md` view |
| `R` | Re-scan the folder |
| `Ctrl/Cmd + ,` | [Settings](settings.md) (theme, reader text size, scan) |
| `?` | Show the keyboard-shortcuts overlay |

# Notes

- Full keyboard operability is an [accessibility](accessibility.md) commitment, not just a convenience.
- Press `?` for an in-app overlay listing every shortcut, grouped by area (also reachable from the [command palette](../features/command-palette.md)).
- A later release may make these user-configurable; v1 ships sensible defaults (see [Scope & Non-Goals](../product/scope-and-non-goals.md)).
