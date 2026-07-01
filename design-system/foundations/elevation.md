---
type: Elevation
title: Elevation
description: Dark-mode shadows plus a signature brand glow for the hero and primary CTA.
tags: [foundations, elevation, shadow, tokens]
status: stable
timestamp: 2026-07-01T16:29:01Z
tokens:
  shadow:
    sm: "0 1px 2px rgba(0,0,0,0.5)"
    md: "0 8px 30px rgba(0,0,0,0.45)"
    lg: "0 24px 70px rgba(0,0,0,0.55)"
  glow:
    brand: "0 0 80px rgba(91,140,255,0.25)"
    brand-strong: "0 0 120px rgba(122,107,255,0.35)"
---

# Tokens
Shadows are pure black at low alpha (they read on dark). The **glow** tokens are the brand's light, a soft blue/violet bloom behind the hero art and under the primary CTA on hover.

# Do & Don't
- **Do** use `glow.brand` once, as a focal bloom.
- **Don't** stack glows on every card.
