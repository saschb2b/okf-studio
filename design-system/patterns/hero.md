---
type: Pattern
title: Hero
description: The above-the-fold composition: eyebrow, display headline, sub, download CTAs, and a glowing product tile.
tags: [patterns, hero, landing]
status: stable
timestamp: 2026-07-01T16:31:45Z
examples:
  - /patterns/hero.example.html
---

# When to use
The top of the marketing/download page. One per page.

# Composition
| Slot | Component | Notes |
|------|-----------|-------|
| Eyebrow | `.eyebrow` (mono, uppercase) | One short line, e.g. "OKF Viewer · v0.2". |
| Headline | [Typography](/foundations/typography.md) `text.display` | Tight tracking/leading; the one bold claim. |
| Sub | body `text.lg`, `colors.text-muted`, capped at `size.measure` | One sentence of value. |
| Actions | [Button](/components/button.md) primary + secondary | Download + GitHub. |
| Art | product tile with [`glow.brand`](/foundations/elevation.md) | The app icon / screenshot, blurred brand bloom behind. |

# Example
- [hero.example.html](/patterns/hero.example.html)

# Do & Don't
- **Do** lead with the download action.
- **Don't** place more than two CTAs above the fold.
