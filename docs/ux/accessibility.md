---
type: Reference
title: Accessibility
description: The app's accessibility commitments: keyboard operability, focus, screen-reader semantics, contrast, and motion.
tags: [ux, accessibility, a11y]
generated: { by: claude/unrecorded, at: 2026-07-28T02:10:00+02:00 }
---

# Keyboard operability

Every primary action is reachable without a mouse, with documented [shortcuts](keyboard-shortcuts.md). This realizes the [keyboard-friendly principle](../product/principles.md): opening a folder, searching, filtering, moving through results, navigating history, and driving the graph all have keys.

# Focus

- Focus is always **visible** as an unmistakable focus ring, never as a color shift alone.
- Focus order follows the reading order of the [three panes](browsing-layout.md): sidebar, then graph, then reader. Tabbing moves between panes predictably. Within a pane it follows the visible layout.

The [Agent Panel](../features/agent-panel.md) reveals horizontally scrolled agent and thread items when they receive focus. Menus and attachment popovers focus their first useful action and return focus to their trigger on Escape. Closing the panel returns focus to its status-bar opener.

# Screen-reader semantics

The [force-directed graph](../features/graph-view.md) is inherently visual. Rather than fake a meaningful audio rendering of node positions, the app provides an **equivalent non-visual path to the same concepts and links**:

- The sidebar [index tree](../features/navigation.md) is a proper tree of every concept, fully keyboard- and screen-reader-navigable.
- The [reader](../features/concept-reader.md) exposes each concept's outgoing links and "cited by" backlinks as labeled lists. The relationships the graph draws as edges then read as text too.

Selecting a concept anywhere keeps all three panes in sync, so a screen-reader user reaches every concept and every link without the graph.

# Contrast

Both themes meet **WCAG AA** contrast for text, graph nodes, and edges. See [Theming](theming.md) for the deterministic type-color palette. Studio tunes that palette per theme, so adjacent type colors stay distinguishable.

# Motion

- The app honors the OS **"reduce motion"** setting. It damps the [graph](../features/graph-view.md) animation, so the layout snaps rather than springs. It also calms [live-reload](../features/live-reload.md) settling, so re-layouts don't lurch.
- The user can override the reduce-motion behavior in [Settings](settings.md).
- **Moving text always has a stop.** [Speed reading](../features/speed-reading.md) is the one surface that advances text on its own, and it follows [WCAG 2.2.2](https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html). Studio persists no pacing mode, so every session starts with a press. Pause is one key or one button away. With reduce motion on, the player opens paused and never animates between frames. Assistive technology never reaches the ticking frame, and reads the unchanged prose instead.

# Sizing

- Interactive targets are large enough to hit comfortably.
- The UI respects OS **text scaling**. Chrome and rendered bodies reflow rather than clip.

Agent Panel fixtures at 360px, 440px, and 560px keep visible button and input targets at least 28 pixels high. They also preserve the composer and avoid panel-level horizontal overflow. Long switcher labels truncate with their full accessible names intact.

# Overrides

The user can set accessibility preferences (theme and reduce-motion) explicitly in [Settings](settings.md) when the OS defaults are not what they want.
