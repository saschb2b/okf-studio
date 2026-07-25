---
type: Typography
title: Typography
description: Inter Variable for copy and JetBrains Mono for labels and code, on a restrained scale sized for reading rather than for impact.
tags: [foundations, typography, tokens]
status: stable
timestamp: 2026-07-25T00:00:00Z
tokens:
  font:
    sans: "'Inter Variable', Inter, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    mono: "'JetBrains Mono Variable', ui-monospace, 'SF Mono', Menlo, Consolas, monospace"
    weight-normal: "400"
    weight-medium: "500"
    weight-semibold: "600"
    weight-bold: "700"
    features-sans: "'cv05' 1, 'cv11' 1, 'ss03' 1"
  text:
    display: "clamp(2.25rem, 4.2vw, 3.25rem)"
    h1: "clamp(1.75rem, 2.6vw, 2.125rem)"
    h2: "1.5rem"
    h3: "1.125rem"
    lg: "1.125rem"
    base: "1rem"
    sm: "0.9375rem"
    xs: "0.8125rem"
  leading:
    tight: "1.1"
    snug: "1.25"
    normal: "1.6"
    relaxed: "1.7"
  tracking:
    tighter: "-0.028em"
    tight: "-0.015em"
    normal: "0"
    wide: "0.08em"
---

# Tokens
| Token | Value | Role |
|-------|-------|------|
| `font.sans` | Inter Variable, then the system stack | UI and marketing copy. |
| `font.mono` | JetBrains Mono Variable, then the system mono stack | Code, version strings, eyebrow labels. |
| `font.features-sans` | `cv05`, `cv11`, `ss03` | Inter's single-storey `g`, single-storey `l`, and curved `r`: a quieter, less geometric text color. |
| `text.display` | fluid 36 to 52px | Hero headline, once per page. |
| `text.h1` | fluid 28 to 34px | Page and section headings. |
| `text.h2` | 24px | Subsection headings. |
| `text.h3` | 18px | Card titles. |
| `text.lg` | 18px | Ledes and showcase body copy. |
| `text.base` | 16px | Body. |
| `text.sm` | 15px | Nav, footer, captions, inline detail links. |
| `text.xs` | 13px | Mono eyebrows and meta lines. |
| `tracking.wide` | 0.08em | Uppercase mono eyebrow labels. |

# Both typefaces are self-hosted
The stacks name real faces first, and the consuming site ships them: `@fontsource-variable/inter` and `@fontsource-variable/jetbrains-mono`, imported once by the page layout and served from the site's own origin. No third-party font request, and no layout that changes shape with the reader's operating system. The system stacks stay behind them as the fallback while a variable font loads (`font-display: swap`) and for anyone who blocks web fonts.

Set Inter with `font-optical-sizing: auto` and `font.features-sans` so headings and body share one text color, and give mono numerals in tables and meta lines `font-variant-numeric: tabular-nums` so digits align in a column.

# The scale is deliberately small
An earlier scale ran to a 72px display headline and a 44px section heading. At `size.container` a headline that large spans the full measure, wraps unpredictably, and reads as a poster rather than as a product page. Display now tops out near 52px, and a headline is capped at `size.headline`, roughly 28 characters per line, so its break is stable.

Size is not how importance is signalled here. Hierarchy comes from weight (`font.weight-semibold` against `font.weight-normal`), from `colors.text` against `colors.text-muted`, and from space. Reserve `text.display` for the one hero headline on the home page.

# Roles
Display uses `tracking.tighter` with `leading.tight`; headings use `tracking.tight` with `leading.snug`. Body uses `leading.normal`, and long-form paragraphs at `size.measure` may use `leading.relaxed`. Mono at `text.xs` with `tracking.wide`, uppercased, is the eyebrow label above a section; it sits in `colors.text-dim`, not in the accent, so the accent stays reserved for things a reader can click.

# Do & Don't
- **Do** reserve mono for labels, versions, and code.
- **Do** cap headline width in characters so the authored line break holds.
- **Don't** set long body copy in mono.
- **Don't** reach for a larger size when the real problem is weak weight or color contrast.
