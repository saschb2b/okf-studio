---
type: Reference
title: Keyboard Shortcuts
description: The default keybindings; every primary action is reachable without a mouse.
tags: [ux, keyboard, accessibility]
timestamp: 2026-06-29T16:00:00Z
---

# Defaults

`Cmd` on macOS, `Ctrl` on Windows/Ubuntu. These realize the [keyboard-friendly principle](../product/principles.md).

| Keys | Action |
|------|--------|
| `Ctrl/Cmd + O` | Open folder ([First Run](first-run.md)) |
| `Ctrl/Cmd + P` | Open the [Bundle Switcher](../features/bundle-switcher.md) — switch bundle, reopen a recent, or open a folder |
| `Ctrl/Cmd + K` or `/` | Open the global search [launcher](../features/command-palette.md) — jump to a concept, full-text search, or run a command |
| `Esc` | Close the launcher / dialog / deselect |
| `↑` `↓` | Move through results / the sidebar |
| `Enter` | Open the highlighted concept |
| `←` `→` (Alt) | Back / forward in [navigation history](../features/navigation.md) |
| `Ctrl/Cmd + 1` `2` `3` | Layout: graph-only / split / reader-only |
| `\` | Cycle the [layout mode](browsing-layout.md) |
| `+` `-` | Zoom the [graph](../features/graph-view.md) in / out |
| `F` | Fit graph to view |
| `Ctrl/Cmd + +` `-` `0` | Reader text size: bigger / smaller / reset (content zoom, not page zoom) |
| `[` `]` | Collapse / expand the sidebar and reader |
| `L` | Toggle the `log.md` view |
| `R` | Re-scan the folder |
| `Ctrl/Cmd + ,` | [Settings](settings.md) (theme, reader text size, scan) |
| `?` | Show the keyboard-shortcuts overlay |

# Notes

- Full keyboard operability is an [accessibility](accessibility.md) commitment, not just a convenience.
- Press `?` for an in-app overlay listing every shortcut, grouped by area (also reachable from the [command palette](../features/command-palette.md)).
- A later release may make these user-configurable; v1 ships sensible defaults (see [Scope & Non-Goals](../product/scope-and-non-goals.md)).
