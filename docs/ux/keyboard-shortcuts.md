---
type: Reference
title: Keyboard Shortcuts
description: The default keybindings. Every primary action is reachable without a mouse.
tags: [ux, keyboard, accessibility]
generated: { by: claude/unrecorded, at: 2026-07-28T02:10:00+02:00 }
---

# Defaults

`Cmd` on macOS, `Ctrl` on Windows/Ubuntu. These realize the [keyboard-friendly principle](../product/principles.md).

| Keys | Action |
|------|--------|
| `Ctrl/Cmd + O` | Open folder ([First Run](first-run.md)) |
| `Ctrl/Cmd + Shift + O` | Open from URL: fetch a [remote bundle](../features/bundle-switcher.md) |
| `Ctrl/Cmd + P` | Open the [Bundle Switcher](../features/bundle-switcher.md): switch bundle, reopen a recent, or open a folder |
| `Ctrl/Cmd + K` or `/` | Open the global search [launcher](../features/command-palette.md): jump to a concept, full-text search, or run a command |
| `Ctrl/Cmd + Shift + A` | Toggle the [Agent Panel](../features/agent-panel.md) |
| `Ctrl/Cmd + Shift + G` | Toggle [Integrated Git](git-workflow.md) and move focus between its active tab and status-bar opener |
| `Ctrl/Cmd + PageUp` / `Ctrl/Cmd + PageDown` | Previous / next live Agent thread while a thread switcher item is focused |
| `Shift + PageUp` / `Shift + PageDown` | Previous / next prompt, while the Agent transcript has focus. Differs from the thread pair above only by modifier, so the overlay groups them together |
| `Shift + Home` / `Home` / `End` | Latest prompt / transcript top / transcript bottom, while the Agent transcript has focus |
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
| `Alt + ↑` | Drill up one level in the treemap / sunburst / circle-packing [views](../features/viz-views.md) |
| `+` `-` | Zoom the [graph](../features/graph-view.md) in / out |
| `F` | Fit graph to view |
| `Ctrl/Cmd + +` `-` `0` | Reader text size: bigger / smaller / reset (content zoom, not page zoom) |
| `[` `]` | Collapse / expand the sidebar and reader |
| `S` | Start [speed reading](../features/speed-reading.md) the active concept (focus player) |
| `Space` | Play / pause the speed reader (inside the player) |
| `←` `→` | Back / forward one word (inside the speed reader) |
| `↑` `↓` | Back / forward one sentence (inside the speed reader) |
| `+` `-` | Faster / slower pace (inside the speed reader) |
| `Space` or `Enter` | Continue past a code block, table, equation, or diagram the player stopped at |
| `O` | Toggle [Bundle Home](../features/bundle-home.md) |
| `T` | Toggle the [lineage](../proposals/lineage-and-traversal.md) panel: trace the active concept |
| `L` | Toggle the `log.md` view |
| `R` | Re-scan the folder |
| `Ctrl/Cmd + ,` | [Settings](settings.md) (theme, reader text size, scan) |
| `Ctrl/Cmd + Enter` | Commit the current staged or tracked scope while the [Git](git-workflow.md) message field is focused |
| `?` | Show the keyboard-shortcuts overlay |

# Notes

- Full keyboard operability is an [accessibility](accessibility.md) commitment rather than a convenience.
- Press `?` for an in-app overlay listing every shortcut, grouped by area (also reachable from the [command palette](../features/command-palette.md)). The overlay has a **filter**, because forty bindings is more than a reader scans. Typing an action or a key narrows the sheet to what matches. Groups that match nothing drop out rather than leaving empty headings.
- **The overlay mirrors this table, and the mirror needs upkeep.** It had drifted. `Ctrl/Cmd + Shift + G`, the agent-thread bindings, and `Ctrl/Cmd + Enter` were live in the app and missing from the sheet. The modified-click row showed only half its pair. A shortcut changes in three places: the handler (`keys.ts` or the owning component), this table, and `ShortcutsHelp.tsx`.
- **Modifier labels follow the platform.** `⌘ ⇧ ⌥` on macOS, `Ctrl Shift Alt` elsewhere, because that is what the key prints. A cap shows the character on the physical key, so the zoom-out binding reads `-`, not the typographer's `−`.
- The overlay shows pointer actions such as `click` as words, not as key caps.
- A later release may make these user-configurable. v1 ships the defaults above (see [Scope and Non-Goals](../product/scope-and-non-goals.md)).
