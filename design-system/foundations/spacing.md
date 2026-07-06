---
type: Spacing
title: Spacing
description: A px-named spacing scale for padding, gaps, and section rhythm; generous by default.
tags: [foundations, spacing, tokens]
status: stable
timestamp: 2026-07-06T15:20:00Z
tokens:
  space:
    "4": "4px"
    "8": "8px"
    "12": "12px"
    "16": "16px"
    "20": "20px"
    "24": "24px"
    "32": "32px"
    "40": "40px"
    "48": "48px"
    "64": "64px"
    "80": "80px"
    "96": "96px"
    "128": "128px"
  size:
    container: "1120px"
    canvas: "1680px"
    measure: "42rem"
---

# Tokens
The scale is named by its pixel value (`space.16` = 16px). `size.container` caps page width; `size.canvas` caps the full-bleed contained surfaces (the hero canvas) so they don't stretch without limit on ultrawide displays while their content stays at `size.container`; `size.measure` caps prose line length for readability.

# Usage
Component padding uses `space.12`–`space.24`; section vertical rhythm uses `space.96`/`space.128`. Card and grid gaps use `space.16`/`space.24`.

# Do & Don't
- **Do** compose spacing from the scale.
- **Don't** hand-pick off-scale pixel values.
