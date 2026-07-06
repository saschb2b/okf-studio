---
type: Pattern
title: Hero
description: "The above-the-fold composition: a rounded, tinted canvas bundling the nav, eyebrow, display headline, sub, download CTAs, and the product shot grounded at its foot."
tags: [patterns, hero, landing, canvas]
status: stable
timestamp: 2026-07-06T14:00:00Z
examples:
  - /patterns/hero.example.html
---

# When to use
The top of the marketing/download page. One per page.

# Composition
| Slot | Component | Notes |
|------|-----------|-------|
| Canvas | rounded container, `radius.xl`, `colors.surface` | Bundles everything below into one object (see The canvas). |
| Nav | [Nav](/components/nav.md) pill, sticky | Floats just above the canvas at rest and stays while scrolling, keeping the Download action reachable. |
| Eyebrow | `.eyebrow` (mono, uppercase) | One short line, e.g. "OKF Viewer · v0.2". |
| Headline | [Typography](/foundations/typography.md) `text.display` | Tight tracking/leading; the one bold claim. An authored break owns the line split; no width cap on top of it. |
| Sub | body `text.lg`, `colors.text-muted`, capped at `size.measure` | One sentence of value. |
| Actions | [Button](/components/button.md) primary + secondary | Download + GitHub. |
| Art | product screenshot, bordered, `shadow.lg` | Grounded flush against the canvas foot, top corners `radius.lg`, no glow (the canvas supplies the atmosphere). |

# The canvas
The headline and product shot share one rounded surface (Gestalt common region), with the [nav pill](/components/nav.md) floating just above it, so the opening act reads as a single composition instead of three stacked strips. The canvas is inset from the viewport (`space.16`, `space.8` on narrow screens) with a `border` hairline and `radius.xl`; its background layers two radial brand tints (color-mix of `colors.secondary` and `colors.primary` into transparency) over `colors.surface`, and a faint node-dot grid fades toward the foot so the screenshot sits on quiet ground. Decoration is clipped to the canvas; nothing floats over the page. The nav cannot live inside the canvas: the clipping (`overflow: hidden`) would break its sticky positioning. The [download band](/patterns/download.md) mirrors the shape at the page foot, so the page opens and closes on the same contained surface.

# Example
- [hero.example.html](/patterns/hero.example.html)

# Do & Don't
- **Do** lead with the download action.
- **Do** keep the nav pill sticky; on narrow screens collapse the anchor links and keep only the brand and the primary action.
- **Don't** place more than two CTAs above the fold.
- **Don't** float the product shot on a glow; ground it on the canvas edge.
