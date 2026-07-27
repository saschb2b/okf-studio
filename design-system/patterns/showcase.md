---
type: Pattern
title: Showcase section
description: "A product story: a two-column copy header over one full-width piece of evidence, sized so the screenshot inside it can actually be read."
tags: [patterns, showcase, landing]
status: stable
generated: { by: claude/unrecorded, at: 2026-07-25T00:00:00Z }
examples:
  - /patterns/showcase.example.html
---

# When to use
The deep-dive sections of a landing page: one section per story, after the summary grid and before the [download band](/patterns/download.md). Three at most. A fourth story means the page is trying to be the documentation.

# Composition
| Slot | Component | Notes |
|------|-----------|-------|
| Eyebrow | `.eyebrow` (mono, uppercase, `colors.text-dim`) | Spans the head, above both columns, so the claim and the body start on the same line. |
| Head | two columns, aligned on their tops | `text.h1` claim on the left, capped at `size.headline`; body `text.lg` in `colors.text-muted` and one detail link on the right. Collapses to one column below 860px. |
| Media | one full-container figure, `radius.xl`, `border` hairline | The evidence: a screenshot at 16:9, `object-fit: cover` from the top, or a diagram panel of the same shape. |

Stories stack at a `space.80` rhythm, all with the same head-over-media shape, so the eye learns the pattern once.

# The media has to be legible
This pattern used to be an alternating half-and-half panel: copy on one side, a screenshot cover-cropped into the other. In a 1120px container that gave the screenshot a 550px column, a 30 percent scale on a 1760px capture. Every label in the app rendered at three or four pixels. The panel looked composed and proved nothing, because a reader could not read one word of the product it was meant to be showing.

Full width doubles the scale, and cropping to a consistent 16:9 from the top keeps the app's chrome and first panel in view while equalizing the height of every story's media. The screenshot stays zoomable through the page's spotlight for anything finer.

If a story has no screenshot yet, give it a diagram panel at the same width and aspect. Never stretch a small capture to fill the frame, and never let a placeholder imply a surface that does not ship.

# Example
- [showcase.example.html](/patterns/showcase.example.html)

# Do & Don't
- **Do** keep one story per section: one eyebrow, one claim, one piece of evidence.
- **Do** name the product surface the media shows, in the copy and in the `alt` text.
- **Do** keep the media's aspect ratio identical across stories so the stack has a rhythm.
- **Don't** put a full-app screenshot in a column narrower than about 800px; below that it stops being evidence.
- **Don't** alternate the media from side to side for variety; variety in the layout costs legibility in the media.
