---
type: Playbook
title: "Visual Consistency Recipes"
description: "Copy-pasteable fixes for the flagship cases in [catalog.md](./catalog.md)."
tags: [css, ui, layout, visual-consistency]
timestamp: 2026-06-17T00:00:00Z
---
# Visual Consistency Recipes

Copy-pasteable fixes for the flagship cases in [catalog.md](./catalog.md). Each is the modern, broadly-supported form as of 2026, with the fallback where a feature is not yet universal. Translate the CSS to whatever the project uses (Tailwind, MUI `sx`, CSS modules); the framework cheat-sheet is at the end.

## Equal-height card grids

Grid and flex already stretch every card in a row to the tallest one (`align-items: stretch` is the default). The work is two parts: make the card fill its stretched cell, and make the card a column so its footer can pin to the bottom.

```css
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(16rem, 1fr));
  gap: 1.5rem;
  /* align-items: stretch is the default and already equalizes height per row */
}

.card {
  display: flex;
  flex-direction: column;
  height: 100%;          /* fill the stretched grid cell */
}

.card__body   { flex: 1 1 auto; }   /* absorbs the slack so the footer drops */
.card__footer { margin-top: auto; } /* pins the CTA to the bottom of every card */
```

For a uniform whole-grid matrix (every row the same height, not just per row), add `grid-auto-rows: 1fr` to `.grid`. Use it only when you want that rigid look; it inflates short rows to match the tallest one anywhere in the grid.

When uneven heights are the design (a masonry or staggered gallery), do not equalize. Native CSS masonry (`grid-lanes`) is not Baseline in 2026; use a JS masonry or CSS `columns` with a feature check.

## Subgrid aligns card internals

`margin-top: auto` only aligns the footer. To line up the title, body, and meta rows across every card in a row, declare the row tracks once on the grid and let each card inherit them with subgrid. The tallest title across the row then sizes the title row for all cards.

```css
.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(18rem, 1fr));
  grid-template-rows: auto auto 1fr auto auto; /* media, title, body, meta, cta */
  gap: 1.5rem;
}

.card {
  display: grid;
  grid-template-rows: subgrid; /* inherit the 5 parent row tracks */
  grid-row: span 5;            /* occupy all 5 */
  row-gap: 0.5rem;
}

/* each child lands on one shared row, so it aligns with the same row in every card */
.card__media { grid-row: 1; aspect-ratio: 16 / 9; object-fit: cover; width: 100%; }
.card__title { grid-row: 2; }
.card__body  { grid-row: 3; } /* the 1fr track absorbs extra height */
.card__meta  { grid-row: 4; }
.card__cta   { grid-row: 5; }

/* fallback for legacy engines without subgrid */
@supports not (grid-template-rows: subgrid) {
  .card { display: flex; flex-direction: column; }
  .card__body { flex: 1 1 auto; }
  .card__cta  { margin-top: auto; }
}
```

Subgrid is Baseline since 2023 (Chrome and Edge 117, Firefox 71, Safari 16). Keep the `@supports` fallback for legacy Chromium. Pair subgrid with a line-clamp on the title so one runaway title does not inflate the shared row for everyone.

## Align trailing icons and values

A trailing icon, badge, timestamp, or control lands at a ragged X because the leading text varies. Pin it. Two-child rows can use a flex auto-margin; rows that must form a true column across many rows want grid.

Flex, pin one trailing element to the row edge:

```css
.link-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.link-row .text {
  min-width: 0;            /* THE fix: lets the text shrink and ellipsize */
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.link-row .icon {
  margin-inline-start: auto; /* push to the edge, RTL-safe */
  flex-shrink: 0;            /* never squashed */
}
```

Grid, a fixed trailing column that lines up across every row:

```css
.link-row {
  display: grid;
  grid-template-columns: 1fr auto; /* text | icon */
  align-items: center;
  gap: 0.5rem;
}
```

When rows have different internal structure but must still share the icon column, make the parent own the columns and each row inherit them:

```css
.link-list { display: grid; grid-template-columns: 1fr auto; }
.link-row  { display: grid; grid-column: 1 / -1; grid-template-columns: subgrid; align-items: center; }
```

The `min-width: 0` gotcha: a flex or grid child defaults to `min-width: auto` and refuses to shrink below its content, so `text-overflow: ellipsis` silently does nothing and the long text shoves the icon out. Add `min-width: 0` to every flex ancestor of the text, and `flex-shrink: 0` to the icon.

Vertical alignment: in a flex or grid row, `align-items: center` handles it. For an icon inline inside running text, size it to the font and nudge it onto the baseline:

```css
.inline-icon { width: 1em; height: 1em; vertical-align: -0.125em; }
```

Inline next to the words versus a pinned column is a real choice. Keep the icon inline when it modifies one link's meaning (the open-in-new-tab cue belongs next to the text it describes); pin it to a column when it is a repeated affordance across many rows and scannability wins. Either way, make a decorative icon `aria-hidden="true"` and add a visually-hidden "(opens in new tab)" for screen readers.

## Spacing scale and rhythm

Constrain every spacing value to a scale and reference it as a token, never a free-form number. The 8-point grid (with 4-point steps for tight component interiors) is the common base: 0, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64. Snap `13px` to `12` or `16`, `7px` to `8`, `22px` to `24`.

```css
:root {
  --space-1: 0.25rem; /* 4  */
  --space-2: 0.5rem;  /* 8  */
  --space-3: 0.75rem; /* 12 */
  --space-4: 1rem;    /* 16, the most common content padding */
  --space-6: 1.5rem;  /* 24 */
  --space-8: 2rem;    /* 32 */
  --space-12: 3rem;   /* 48 */
}
.card { padding: var(--space-4); }
```

Prefer one `gap` on the parent over per-element margins. `gap` applies once, adds no trailing edge space, never margin-collapses, and removes the `:last-child` reset hacks. Where you do want vertical rhythm without `gap`, the Stack primitive (the lobotomized owl) spaces only between siblings:

```css
.stack > * + * { margin-block-start: var(--space-6); } /* never a trailing margin */
```

Make spacing reflect grouping: more space between groups than within them (a small step between a label and its value, a large step between sections). The ratio matters more than the absolute number.

```css
.field        { display: grid; gap: var(--space-1); }  /* label to input, within group */
.fieldset     { display: grid; gap: var(--space-4); }  /* field to field, related */
.form-section { display: grid; gap: var(--space-12); } /* section to section, separate */
```

Off-scale values that are correct: `1px` borders and hairlines, a 1 to 2px optical nudge, a true pill (`9999px`) or circle (`50%`), and `calc(var(--space-4) - 1px)` to keep visual padding constant when a border is added. Do not tokenize a one-off `1px` border.

## Cap variable text

```css
.clamp-2 {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;     /* future-proof, harmless today */
  overflow: hidden;  /* required, else the text is not actually clipped */
}
.truncate { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
```

Clamp teasers and descriptions, not load-bearing content (prices, names, errors), and pair a clamp with a `title` or expand affordance when the hidden text matters. The unprefixed `line-clamp` is not shipped yet in 2026; keep the `-webkit-` form.

## Consistent media boxes

```css
.media { aspect-ratio: 16 / 9; width: 100%; object-fit: cover; }
```

Locks every card's media to one ratio and crops rather than distorts. Use `object-fit: contain` when cropping would cut off something important.

## Align numbers in tables

```css
.num {
  text-align: right;
  font-variant-numeric: lining-nums tabular-nums; /* equal-width digits register vertically */
}
```

Right-align numeric cells and their header; left-align text columns; never center tabular data. Keep identifier numbers (IDs, ports, years as categories) left-aligned. Fix decimal precision per column with `Intl.NumberFormat`.

## Align label and value rows

Label and value pairs (definition lists, detail panels, settings) go ragged when the labels vary in length, because each value starts wherever its label ended. Grid the list so the label column hugs the longest term and every value lines up.

```css
dl {
  display: grid;
  grid-template-columns: max-content 1fr; /* label hugs longest term, value fills */
  gap: 0.25rem 1rem;
}
```

For values aligned to a right edge instead, use `1fr max-content` and `text-align: right` on `dd`. If each pair is wrapped in a `<div>`, add `display: contents` to that wrapper so the grid still sees `dt` and `dd`. Cap a very long label column with `minmax(0, max-content)`.

## Tame heading and text wrapping

Variable content also reads as ragged at the line level: a heading drops one orphan word onto its own line, or body text wraps lumpily. Let the browser balance it.

```css
h1, h2, h3 { text-wrap: balance; } /* even line lengths, no orphan word */
p, li      { text-wrap: pretty; }  /* avoid a single short last line */
```

`text-wrap: balance` is Baseline 2024 and applies to short blocks (a few lines); `pretty` targets longer prose and is newer. Both degrade to normal wrapping where unsupported, so they are safe to add. Keep a sensible `max-inline-size` on headings so they still break where intended.

## Consistent content width

Sections that each pick their own `max-width` make the content edge jump down the page. Define the measure once per content type and center it.

```css
:root { --content-prose: 72ch; --content-wide: 1200px; }
.prose     { max-inline-size: var(--content-prose); margin-inline: auto; }
.dashboard { max-inline-size: var(--content-wide);  margin-inline: auto; }
```

Vary width by intent (prose narrower than a data view), not by accident. One token per content type keeps the left and right edges stable from section to section.

## Tokenize motion

Interaction polish goes inconsistent the same way spacing does: one control transitions in `150ms`, another in `237ms`, a third not at all. Reference a small motion scale instead of ad-hoc numbers, and respect reduced-motion.

```css
:root {
  --motion-fast: 120ms;
  --motion-base: 200ms;
  --ease-standard: cubic-bezier(0.2, 0, 0, 1);
}
.button { transition: background-color var(--motion-base) var(--ease-standard); }

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { transition-duration: 0.01ms !important; animation-duration: 0.01ms !important; }
}
```

## Framework cheat-sheet

| Goal | Tailwind | MUI `sx` |
| --- | --- | --- |
| Equal height per row | `items-stretch` (default) + `h-full` on the card | `<Card sx={{ height: '100%' }}>` |
| Card column, pinned footer | `flex flex-col` + `mt-auto` on the footer | `display: 'flex', flexDirection: 'column'` + `marginTop: 'auto'` on `CardActions` |
| Subgrid internals | parent `grid grid-rows-[auto_auto_1fr_auto]`, card `grid grid-rows-subgrid row-span-4` | `display: 'grid', gridTemplateRows: 'subgrid', gridRow: 'span 4'` |
| Pin trailing icon | `flex items-center` + `ml-auto` on the icon | `display: 'flex', alignItems: 'center'` + `marginInlineStart: 'auto'` |
| Truncate flex text | `min-w-0 truncate` on the text | `minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'` |
| Clamp lines | `line-clamp-2` | `display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden'` |
| Media ratio | `aspect-video object-cover` | `aspectRatio: '16 / 9', objectFit: 'cover'` |
| Spacing token | scale steps `p-4 gap-2` | `theme.spacing(2)`, or `p: 2, gap: 1` |
| Tabular numbers | `tabular-nums text-right` | `fontVariantNumeric: 'tabular-nums', textAlign: 'right'` |
| Balance heading wrap | `text-balance` (heading), `text-pretty` (body) | `textWrap: 'balance'`, `textWrap: 'pretty'` |
| Label/value column | `grid grid-cols-[max-content_1fr]` on the `dl` | `display: 'grid', gridTemplateColumns: 'max-content 1fr'` |
