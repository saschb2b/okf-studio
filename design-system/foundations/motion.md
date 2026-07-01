---
type: Motion
title: Motion
description: Short, confident transitions with one shared easing curve.
tags: [foundations, motion, tokens]
status: stable
timestamp: 2026-07-01T16:29:01Z
tokens:
  duration:
    fast: "120ms"
    base: "180ms"
    slow: "320ms"
  ease:
    standard: "cubic-bezier(0.2, 0.6, 0.2, 1)"
---

# Tokens
Interactive feedback (hover, focus) uses `duration.fast`; entrances use `duration.base`. One curve, `ease.standard`, everywhere. All motion must be gated behind `prefers-reduced-motion`.

# Do & Don't
- **Do** transition transform/opacity/box-shadow.
- **Don't** animate layout-affecting properties on scroll.
