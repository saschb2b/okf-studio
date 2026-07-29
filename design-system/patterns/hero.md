---
type: Pattern
title: Hero
description: "The above-the-fold composition: a rounded, tinted canvas bundling the nav, eyebrow, display headline, sub, download CTAs, and the product shot grounded at its foot."
tags: [patterns, hero, landing, canvas]
status: stable
generated: { by: claude/unrecorded, at: 2026-07-25T00:00:00Z }
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
| Eyebrow | `.eyebrow` (mono, uppercase, `colors.text-dim`) | One short line, e.g. "OKF Studio · v0.9.1". |
| Headline | [Typography](/foundations/typography.md) `text.display`, `colors.text` | Tight tracking and leading; the one claim. Capped at `size.headline` so the authored break holds; solid text, never a gradient fill. |
| Sub | body `text.lg`, `colors.text-muted`, capped at `size.measure` | One sentence of value. |
| Actions | [Button](/components/button.md) `--primary --lg` + `--secondary` | The download, then one way to learn more. |
| Art | product screenshot, bordered, `shadow.lg` | Grounded flush against the canvas foot, top corners `radius.lg`, no glow (the canvas supplies the atmosphere). Shown through a **windowed crop** (roughly the top 60% of the capture), not full height: the fold teases the app and the spotlight zoom still shows everything. A CSS **scroll-driven pan** (`animation-timeline: view()`) walks the window down the capture as the page scrolls; browsers without support keep the static top crop, and reduced motion opts out. |

# The canvas
The headline and product shot share one rounded surface (Gestalt common region), with the [nav pill](/components/nav.md) floating just above it, so the opening act reads as a single composition instead of three stacked strips. The canvas is inset from the viewport (`space.16`, `space.8` on narrow screens) with a `border` hairline and `radius.xl`; its background layers two radial tints (color-mix of `colors.secondary` and `colors.primary` into transparency, at 8 percent and below) over `colors.surface`, and a faint node-dot grid fades toward the foot so the screenshot sits on quiet ground. Decoration is clipped to the canvas; nothing floats over the page. The nav cannot live inside the canvas: the clipping (`overflow: hidden`) would break its sticky positioning. The [download band](/patterns/download.md) mirrors the shape at the page foot, so the page opens and closes on the same contained surface.

# The headline is text
The second line of the headline used to be filled with `colors.gradient-brand` through `background-clip: text`. It is the most-copied device on the software landing pages of the last few years, it lowers contrast on the exact words meant to carry the claim, and it disappears entirely in forced-colors mode. The headline is now solid `colors.text` at a size that fits inside `size.headline`, and the accent stays on the button underneath it, which is the thing a reader is meant to press.

# Example
- [hero.example.html](/patterns/hero.example.html)

# Do & Don't
- **Do** lead with the download action, and give it `--lg`.
- **Do** keep the nav pill sticky; on narrow screens collapse the route links into the mobile menu and keep the brand and the primary action in the bar.
- **Do** state the platforms and the price in one quiet mono line under the actions, where a reader looks for the catch.
- **Don't** place more than two actions above the fold.
- **Don't** fill headline text with a gradient, and don't float the product shot on a glow; ground it on the canvas edge.
