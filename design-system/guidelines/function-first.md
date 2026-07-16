---
type: Guideline
title: Function first, edge to edge
description: Docked tool surfaces run edge-to-edge behind a hairline; radius and padding are reserved for things that float.
tags: [guidelines, layout, density, zed]
status: stable
timestamp: 2026-07-16T21:45:00Z
---

# Rule
OKF Studio is a power tool. A surface that is **docked** — a composer at a panel's bottom, a shelf, a status strip, a header — runs edge-to-edge and is separated by a single 1px `colors.border` hairline. Do not float it in outer padding or wrap it in its own rounded, bordered box. Corner radius and enclosing borders are reserved for surfaces that **float**: popovers, menus, dialogs, and blocks that sit inside a scrolling document (a user message, a diff card).

# Why
This is Zed's design stance, and the reason its panels read as instruments instead of forms: the frame communicates structure (what is docked where), while boxes-within-boxes communicate nothing and cost width, height, and calm. Every wrapper around a docked surface adds two borders and two paddings between the user and the function. Intention goes to function first — beauty comes from alignment, rhythm, and restraint, not from enclosure.

# Do
- Dock the agent composer flush to the panel's edges; the top hairline is the whole separator, and the editor's background *is* the panel background.
- Show keyboard focus on an edge-to-edge editor by tinting its hairline (`colors.accent`), since there is no box for a focus ring to wrap.
- Keep inset padding *inside* the surface for its text and controls (align to the panel's gutter), and keep ancillary rows (chips, notices, errors) on that same gutter.
- Let resting states stay silent; spend color and weight on the exception (running, failed, staged).

# Don't
- Don't wrap a docked input in a rounded `border` + `radius.md` shell inside a padded panel — that is a web form, not a tool.
- Don't stack enclosures (a bordered box inside a padded region inside a bordered panel).
- Don't give a docked surface a different background from its panel just to mark its extent; the hairline already does.

# Applies to
The desktop app's agent composer is the worked case (`.agent-composer` in the app's `AgentConversation.css`); the same rule governs the status bar, the live-work shelf, and any future docked chrome, and the marketing site's product depictions must show the app this way.

# Citations
[1] [zed.dev](https://zed.dev) — the register this system builds from; see the agent panel's message editor.
[2] [Dark-first, never flat black](/guidelines/dark-first.md) — the companion surface rule: definition comes from near-black layering and hairlines, not enclosure.
