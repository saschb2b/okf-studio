---
type: Spacing
title: Spacing
description: A px-named spacing scale for padding, gaps, and section rhythm, plus the width caps that keep a line of text readable.
tags: [foundations, spacing, tokens]
status: stable
generated: { by: claude/unrecorded, at: 2026-07-25T00:00:00Z }
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
    measure: "40rem"
    headline: "24ch"
---

# Tokens
The scale is named by its pixel value (`space.16` = 16px).

| Token | Value | Role |
|-------|-------|------|
| `size.container` | 1120px | Page content width. |
| `size.canvas` | 1680px | Cap for full-bleed contained surfaces (the hero canvas), so they don't stretch without limit on ultrawide displays while their content stays at `size.container`. |
| `size.measure` | 40rem | Prose line length, roughly 70 characters. |
| `size.headline` | 24ch | Cap for a display or H1 line, so an authored break holds and a headline never spans the full container. The `ch` unit measures the digit zero, which is wider than the average letter, so this holds a line of roughly 28 characters. |

# Usage
Component padding uses `space.12` to `space.24`. Section vertical rhythm uses `space.80`, and `space.96` only where a section is the page's main act. Card and grid gaps use `space.16` and `space.24`.

# Rhythm is about relationships, not about size
Space earns its keep by grouping. A heading sits closer to the paragraph it introduces (`space.12`) than that paragraph sits to the next block (`space.24`), and a section's own padding (`space.80`) is larger again. When every gap is generous, nothing is grouped and the page reads as a list of unrelated slabs with holes between them: that is the failure the `space.96`/`space.128` default produced, and why the section rhythm came down.

# Do & Don't
- **Do** compose spacing from the scale.
- **Do** make the gap between two blocks smaller than the gap around the pair.
- **Don't** hand-pick off-scale pixel values.
- **Don't** treat a large section gap as a substitute for a section boundary; a hairline or a change of surface says it better.
