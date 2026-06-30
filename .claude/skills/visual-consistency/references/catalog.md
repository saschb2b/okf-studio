---
type: Smell Catalog
title: "Visual Consistency Catalog"
description: "Every smell with its objective detection signal, fix, exception, severity, and autonomy."
tags: [css, ui, layout, visual-consistency]
timestamp: 2026-06-17T00:00:00Z
---
# Visual Consistency Catalog

Every smell with its objective detection signal, fix, exception, severity, and autonomy. Read it before a scan. The flagship fixes have copy-pasteable code in [recipes.md](./recipes.md).

**Severity.** Glaring (jumps out, or an objective failure, fix now), Untidy (a real consistency drag, should fix), Nitpick (minor or situational, optional).

**Autonomy.** Safe (objective, reversible, snaps to a scale or value the design already set, fix freely) or Judgment (introduces a value or direction the design has not set, surface first). Safe maps to `autopilot` in-bounds work, Judgment to surface-first.

Scan order: for a grid, list, table, or card template, run family 0 first, then spacing and alignment, then the rest.

---

## 0. Card grids and repeated items (the flagship)

Recipes: [equal-height grids](./recipes.md#equal-height-card-grids), [subgrid internals](./recipes.md#subgrid-aligns-card-internals), [trailing icons](./recipes.md#align-trailing-icons-and-values), [label and value columns](./recipes.md#align-label-and-value-rows).

| name | detection signal | fix | exception | severity | autonomy |
| --- | --- | --- | --- | --- | --- |
| `card-row-unequal-height` | Cards in one grid or flex row render at different heights; the card is not a flex or grid column, so its footer floats. | Row stretches to the tallest by default; make the card `display: flex; flex-direction: column; height: 100%` and pin the footer with `margin-top: auto`. `grid-auto-rows: 1fr` for a uniform whole-grid matrix. | Deliberate masonry or staggered layouts. | Untidy | Safe |
| `card-internals-misaligned` | Sibling cards share a template but their title, body, meta, and footer rows start at different Y, so nothing scans across the row. | Declare the row tracks on the grid, then `grid-template-rows: subgrid; grid-row: span N` on each card so the tallest title sizes the title row for all. Fall back to `min-height` per section behind `@supports`. | Single-column lists (no horizontal siblings to align). | Untidy | Safe |
| `ragged-trailing-element` | A trailing icon, badge, timestamp, price, or control lands at a different X on each row because the leading text varies in length. | Two-column grid `1fr auto` (or `margin-inline-start: auto` in a flex row) pins the trailing element to a fixed column; `grid-template-columns: subgrid` aligns it across heterogeneous rows. Add `min-width: 0` to the text child and `flex-shrink: 0` to the trailing element. | An icon that modifies one link inline (keep it adjacent to the words). | Untidy | Safe |
| `label-value-not-columnar` | Label and value pairs (definition lists, detail panels, settings rows) where values start at a different X because labels vary in length, so there is no value column. | Grid the list, `grid-template-columns: max-content 1fr`, so the label column hugs the longest term and every value aligns. | A single pair, or labels long enough to need their own row. | Untidy | Safe |
| `mixed-media-aspect-ratio` | Card media render at varying intrinsic ratios, so the media row is ragged before text even differs. | Lock the media box with `aspect-ratio` and crop with `object-fit: cover`. | User media where cropping is destructive (use `contain`). | Untidy | Safe |
| `runaway-variable-text` | One card's title or body is far longer, blowing out the row (or, with subgrid, inflating the shared track). | Cap the teaser with `-webkit-line-clamp` (and the future `line-clamp`); single-line `text-overflow: ellipsis`. | Load-bearing content (prices, names, errors); clamp teasers only, and never without an affordance. | Untidy | Safe |
| `auto-fill-vs-auto-fit-orphans` | A responsive grid leaves one or two stretched cards alone on the last row, or collapses tracks unexpectedly. | Choose `auto-fill` (keep empty tracks, cards keep their width) vs `auto-fit` (collapse tracks, survivors stretch) deliberately for the look you want. | Either is correct; only flag an evidently unintended result. | Nitpick | Judgment |

Sources: [Modern CSS, Equal height elements](https://moderncss.dev/equal-height-elements-flexbox-vs-grid/), [MDN, CSS grid layout](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_grid_layout), [MDN, Subgrid](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_grid_layout/Subgrid), [web.dev, CSS subgrid](https://web.dev/articles/css-subgrid), [MDN, aspect-ratio](https://developer.mozilla.org/en-US/docs/Web/CSS/aspect-ratio), [MDN, line-clamp](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/line-clamp), [MDN, Aligning items in a flex container](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_flexible_box_layout/Aligning_items_in_a_flex_container).

Browser support (2026): subgrid is Baseline (Chrome and Edge 117, Firefox 71, Safari 16); guard with `@supports not (grid-template-rows: subgrid)`. `aspect-ratio`, `tabular-nums`, flex auto-margins, and the `min-width: 0` truncation fix are universal. The unprefixed `line-clamp` is not yet shipped; keep the `-webkit-` form. Native masonry (`grid-lanes`) is not Baseline; do not ship it without a fallback.

---

## A. Spacing and rhythm

Recipe: [spacing scale and rhythm](./recipes.md#spacing-scale-and-rhythm).

| name | detection signal | fix | exception | severity | autonomy |
| --- | --- | --- | --- | --- | --- |
| `off-grid-spacing-value` | `margin`, `padding`, `gap`, or offset not on the base scale (not divisible by 4, or by 8). Literals like `13px`, `7px`, `15px`, `22px`, decimal px like `24.4px`. | Snap to the nearest scale step (0, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64) or its token. | `1px` hairlines, optical nudges, intrinsic asset sizes. | Untidy | Safe |
| `raw-spacing-literal` | An on-grid px literal in a codebase that already has spacing tokens (`var(--space-*)`, `theme.spacing()`, Tailwind steps). | Replace the literal with its token. | No token layer exists yet (early prototype). | Nitpick | Safe |
| `arbitrary-spacing-spread` | Many distinct one-off spacing values, several closer than ~25% to each other, so steps are indistinguishable noise. | Constrain to the scale; collapse near-duplicates onto one step. | A documented fine-grained scale. | Untidy | Safe |
| `outer-padding-less-than-inner` | A container's `padding` is smaller than the `gap` or margin between its children, so children crowd the edge. | Make outer padding greater than or equal to inner spacing. | Full-bleed media inside a padded card. | Untidy | Safe |
| `mismatched-container-padding` | Two same-type containers padded differently (`16px` vs `24px`), or asymmetric padding with no layout cause. | One symmetric padding token per container category. | Optical correction, RTL mirroring, one-edge bleed. | Nitpick | Safe (symmetry), Judgment (which value wins) |
| `margin-and-gap-mixed` | A flex or grid container sets both `gap` and child margins for the same separation job, double-spacing and fragile. | One source of truth: `gap` on the parent; drop the child margins. | A genuine one-off offset around a single element. | Untidy | Safe |
| `proximity-ignores-grouping` | Equal vertical gaps between items that belong to different groups; no extra space at group boundaries. | More space between groups than within them. Related elements close, unrelated far. | Flat uniform lists with no grouping. | Untidy | Judgment (where the groups are is semantic) |
| `inconsistent-units` | The same role uses different units with no rationale (`px` here and `rem` there for spacing or font size, `em` mixed in). | One rule per role: `rem` for font size and layout spacing so it respects user zoom, `px` for borders and hairlines, `em` only when it should scale with its own font size. | A justified mix (rem spacing with a `px` border) is correct, not a smell. | Nitpick | Safe |

Sources: [Material 3, Spacing](https://m3.material.io/foundations/layout/understanding-layout/spacing), [Atlassian, Spacing](https://atlassian.design/foundations/spacing), [Shopify Polaris, Spacing](https://polaris.shopify.com/design/space), [Anthony Hobday, Safe rules](https://anthonyhobday.com/sideprojects/saferules/), [Refactoring UI, Spacing notes](https://jacobshannon.com/blog/books/refactoring-ui/layout-and-spacing/), [Every Layout, The Stack](https://every-layout.dev/layouts/stack/), [LogRocket, gap vs margin](https://blog.logrocket.com/css-gap-vs-margin/), [Josh Comeau, Pixels and accessibility](https://www.joshwcomeau.com/css/surprising-truth-about-pixels-and-accessibility/).

---

## B. Alignment and grid

| name | detection signal | fix | exception | severity | autonomy |
| --- | --- | --- | --- | --- | --- |
| `no-common-edge` | Siblings that should align have different left or right offsets; ad-hoc `margin-left` instead of a shared container edge or grid column. | Align to one edge via shared padding or a grid column; remove per-element offsets. Everything should align with something else. | Intentional nested indentation, tree views. | Untidy | Safe |
| `icon-text-vertical-misalignment` | An icon-plus-text row lacks `align-items: center`; an inline icon sits on the text baseline looking low; `margin-top` hacks compensate. | `inline-flex; align-items: center; gap` for a row. For an inline icon, size it `1em` and `vertical-align: -0.125em`. Remove the compensating margins. | Icon top-aligned to the first line of multi-line text. | Untidy | Safe |
| `centered-long-text` | `text-align: center` on text that wraps to three or more lines, so each line starts at a different x. | Left-align long-form text; center only short headings and one or two line taglines. | Single-line headings, short CTAs. | Untidy | Safe |
| `off-baseline-grid` | Component heights or line-heights not multiples of 4; positions not on the grid. | Round heights and line-heights to multiples of 4. | `1px` borders, optical nudges. | Nitpick | Safe |
| `mathematical-not-optical-centering` | An asymmetric glyph (play triangle, caret) centered with pure `margin: auto`, no optical offset. | Nudge a few px with `transform: translateX` so it looks centered. | Symmetric shapes, centered text. | Nitpick | Safe |
| `mixed-alignment-siblings` | Adjacent siblings of the same role use different `text-align`, or repeated rows zigzag. | One alignment edge (usually `start`) for the set. | Hero blocks, empty states. | Untidy | Safe (toward the majority), Judgment (no majority) |
| `non-standard-grid` | A layout implies an odd column count (5, 7, 9, 11) or off gutters, not the system grid (12 column, or Carbon 16, or Material). | Use the system's columns and gutters. | Bespoke editorial or marketing layouts. | Untidy | Judgment (column count is a design call) |
| `inconsistent-content-width` | Content containers at different `max-width`s across sections or pages (one full-bleed, the next at 1200px, the next at 800px) with no reason, so the content edge jumps. | One content-width token or a shared container component; vary the measure by intent (prose narrower than a dashboard), not by accident. | Deliberate full-bleed media or hero bands. | Untidy | Safe (snap to the dominant), Judgment (no dominant) |

Sources: [Anthony Hobday, Safe rules](https://anthonyhobday.com/sideprojects/saferules/), [CSS-Tricks, Aligning icons to text](https://css-tricks.com/tips-aligning-icons-text/), [NN/g, Zigzag layout](https://www.nngroup.com/articles/zigzag-page-layout/), [IBM Carbon, 2x grid](https://carbondesignsystem.com/elements/2x-grid/overview/), [MDN, Aligning items in a flex container](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_flexible_box_layout/Aligning_items_in_a_flex_container).

---

## C. Repeated-element consistency

| name | detection signal | fix | exception | severity | autonomy |
| --- | --- | --- | --- | --- | --- |
| `inconsistent-button-size` | Same-role buttons differ in computed height, padding, radius, or font size (`8px 16px` vs `10px 14px`, radius 6 vs 8). | Drive all same-role buttons from one token set; remove per-instance overrides. Horizontal padding around twice the vertical. | Documented size or emphasis variants, icon-only buttons. | Untidy | Safe (snap to the role's dominant value) |
| `inconsistent-control-height` | Inputs, selects, and buttons in one row at different heights (a 36px input next to a 48px button). | One height token for the whole row; align input and button heights. | Textareas, deliberate density modes. | Untidy | Safe |
| `inconsistent-border-radius` | Multiple distinct `border-radius` for one element class with no system (cards 6, buttons 10, inputs 4). | One radius scale (for example 4, 8, 12, 16, 28, full); same component, same radius. | A pill (`9999px`) or circle (`50%`) sentinel; an applied expressive shape. | Untidy | Safe |
| `nested-radius-wrong` | An inner element's radius equals the outer radius despite padding between them. | Inner radius equals outer minus the gap between their edges. | Negligible padding, inner already square. | Nitpick | Safe |
| `ad-hoc-shadows` | Many distinct one-off `box-shadow`s; no small elevation scale; blur unrelated to offset. | Define an elevation set (around five levels); blur about twice the y-offset; opacity lower as it rises. Higher in stacking order means strictly higher elevation. | One deliberate brand hero shadow; focus rings are not elevation. | Untidy | Safe |
| `mismatched-icon-size` | Icon sizes off the set (16, 20, 24, 32); an icon optically mismatched to adjacent text (a 24px icon by a 12px label); decimal sizes. | One icon-size token; match icon size to the text line-height; snap edges to whole px. | Decorative or hero icons, logos. | Nitpick | Safe |
| `inconsistent-icon-style` | Icons mix stroke widths, or filled and outline, within one set. | One icon family and stroke weight per UI. | Intentional dual-tone or status icons. | Nitpick | Judgment (which family) |
| `inconsistent-interaction-states` | Same-role controls differ in their hover, focus, or active treatment (some have a hover state, some none), or transition durations and easings are ad-hoc (`150ms` here, `237ms` there). | Apply one state treatment per role; tokenize motion (a small set of durations and easings) and reference it, the same argument as the spacing scale. Respect `prefers-reduced-motion`. | A deliberately distinct primary-action motion, documented. | Nitpick | Safe (timing), Judgment (adding a state where none existed) |

Sources: [EightShapes, Size in design systems](https://medium.com/eightshapes-llc/size-in-design-systems-64f234aec519), [Material 3, Motion](https://m3.material.io/styles/motion/overview), [Material 3, Shape scale](https://m3.material.io/styles/shape/corner-radius-scale), [Material 3, Elevation tokens](https://m3.material.io/styles/elevation/tokens), [Shopify Polaris, Shadow tokens](https://polaris.shopify.com/design/depth/shadow-tokens), [IBM Carbon, Icons](https://carbondesignsystem.com/elements/icons/library/), [Anthony Hobday, Safe rules](https://anthonyhobday.com/sideprojects/saferules/).

---

## D. Typography

| name | detection signal | fix | exception | severity | autonomy |
| --- | --- | --- | --- | --- | --- |
| `off-scale-font-size` | `font-size` not on the type scale (literals like `13px`, `15px`, `17px`, `19px`). | Snap to the nearest type token. A modular scale (base times a fixed ratio such as 1.25). | Fluid `clamp()` with on-scale bounds, one documented hero size. | Untidy | Safe |
| `too-many-font-sizes` | More than six to eight distinct sizes in one view, including near-duplicates (15 next to 16). | Collapse onto a fixed type scale; merge near-duplicates. | Data-dense dashboards, editorial pages. | Untidy | Safe |
| `line-height-not-paired` | `font-size` set alone, or one global line-height for all sizes; large headings at 1.5, body under 1.4. | Use the full type token (size, line-height, weight). Line-height inverse to size: body around 1.5, large headings around 1.1. | Single-line labels and buttons. | Untidy | Safe |
| `body-text-too-small` | Body or paragraph `font-size` under 16px. | Body at 16px or more. | Captions, footnotes, dense tables. | Untidy | Judgment (bumping size can reflow layout) |
| `emphasis-by-size-only` | Primary and secondary text differ only in size, one weight and one color. | Use weight and color for hierarchy; de-emphasize secondary with a lighter text role. | True heading levels. | Nitpick | Judgment (color and weight choice) |
| `line-length-unbounded` | A prose container has no `max-width`, or renders lines past about 75 characters. | `max-inline-size` around 66ch (45 to 75 range), in `ch` or `em` so it scales. | Code, tables, data, single-line labels. | Untidy | Safe |
| `awkward-heading-wrap` | A heading wraps leaving one orphan word on the last line, or body wraps raggedly, so the block looks lumpy. | `text-wrap: balance` on short headings evens the lines; `text-wrap: pretty` on body avoids a single short last line. | Single-line headings; very long blocks (balance caps at a few lines). | Untidy | Safe |
| `arbitrary-letter-spacing` | Positive tracking on large headings, or ad-hoc `letter-spacing` on body text. | Tracking inverse to size: slightly tighter on large headings, slightly looser on small uppercase labels, otherwise zero. | A documented brand tracking; small all-caps labels. | Nitpick | Safe |
| `too-many-typefaces` | Three or more `font-family` stacks, excluding a mono for code. | Two typefaces at most. | A third mono for code or tabular data. | Untidy | Judgment (which to drop) |

Sources: [Anthony Hobday, Safe rules](https://anthonyhobday.com/sideprojects/saferules/), [web.dev, Typography](https://web.dev/learn/design/typography), [Material 3, Type scale tokens](https://m3.material.io/styles/typography/type-scale-tokens), [Smashing, Line length](https://www.smashingmagazine.com/2014/09/balancing-line-length-font-size-responsive-web-design/), [MDN, text-wrap](https://developer.mozilla.org/en-US/docs/Web/CSS/text-wrap).

---

## E. Tables and lists

| name | detection signal | fix | exception | severity | autonomy |
| --- | --- | --- | --- | --- | --- |
| `numeric-column-not-right-aligned` | A numeric cell is left or center aligned, or one numeric column mixes alignment down its rows. | Right-align numeric cells and their header. | Identifier numbers (IDs, ports, zips, years as categories). | Untidy | Safe |
| `no-tabular-numerals` | A numeric column in a proportional font lacks `font-variant-numeric: tabular-nums`, so digits do not register vertically. | Add `font-variant-numeric: lining-nums tabular-nums`. | Body prose with incidental numbers, already-mono fonts. | Nitpick | Safe |
| `text-column-not-start-aligned` | A text column is center or right aligned. | Left or `start`-align text columns. | RTL locales. | Untidy | Safe |
| `header-alignment-mismatch` | A `<th>` alignment differs from its column's cells (left header over right-aligned numbers). | Propagate column alignment to the header; never center headers. | None typical. | Untidy | Safe |
| `inconsistent-decimal-precision` | One numeric column mixes decimal counts (`12.5`, `12.50`, `12`). | Fixed precision per column via `Intl.NumberFormat` or `toFixed`. | Integer-only columns. | Untidy | Judgment (the precision is semantic) |
| `uneven-row-heights` | Rows in one `<tbody>` at different heights from ad-hoc per-row padding or line-height. | Set row height and padding once on a class; remove overrides. | Expandable detail rows, intentional density modes. | Untidy | Safe |
| `inconsistent-list-density` | List, table, or menu items in one container at different vertical padding. | One density token for the whole container. | An intentionally taller section-header row. | Untidy | Safe |

Sources: [IBM Carbon, Data table](https://carbondesignsystem.com/components/data-table/usage/), [Shopify Polaris, Data table](https://polaris.shopify.com/components/tables/data-table), [MDN, font-variant-numeric](https://developer.mozilla.org/en-US/docs/Web/CSS/font-variant-numeric).

---

## F. Borders and dividers

| name | detection signal | fix | exception | severity | autonomy |
| --- | --- | --- | --- | --- | --- |
| `border-overuse` | High density of borders purely for separation; nested bordered boxes. | Separate with whitespace, a subtle background, or shadow; reserve borders for where contrast is needed. | Inputs and controls that need an affordance, one intentional divider. | Untidy | Judgment (changes the separation language) |
| `redundant-adjacent-divide` | A border, a background change, and an `<hr>` stacked within a few px do the same separation job. | Keep one hard divide; remove the redundant one. | Deliberate decorative framing. | Nitpick | Safe |
| `inconsistent-divider` | Dividers at varying widths or colors for the same job (`1px #eee` vs `2px #ccc`). | One divider token (weight and color). | Intentional emphasis hierarchy. | Nitpick | Safe (snap to the dominant) |
| `border-and-shadow-mixed` | The same separation is a border on some siblings and a shadow on others. | One separation technique for the set. | Distinct documented surface roles. | Nitpick | Judgment |

Sources: [Refactoring UI](https://www.refactoringui.com/), [Anthony Hobday, Safe rules](https://anthonyhobday.com/sideprojects/saferules/).

---

## G. Responsive, overflow, and long content

| name | detection signal | fix | exception | severity | autonomy |
| --- | --- | --- | --- | --- | --- |
| `fixed-width-overflows` | A `width: NNNpx` greater than 320 with no `max-width: 100%` or responsive override; the element is wider than a 320px viewport. | `max-width: 100%` or fluid units; let content reflow. | Tables, maps, diagrams, code (two-dimensional, exempt). | Glaring | Safe |
| `no-reflow-at-320` | At 320 CSS px the page scrolls horizontally (`scrollWidth` greater than `clientWidth`). WCAG 1.4.10. | Fluid, flex, or grid that wraps to one column down to 320 by 256. | Genuinely two-dimensional parts only. | Glaring | Safe (mechanical), Judgment (layout restructure) |
| `long-string-overflow` | A container of dynamic strings (URL, token, email) has no `overflow-wrap`, so a long token spills or scrolls. | `overflow-wrap: break-word`, `<wbr>`, or `min-inline-size: min-content`. | Code or IDs where a mid-break corrupts copy (use a scroll region). | Glaring | Safe |
| `text-clipped-by-fixed-size` | A fixed `height` plus `overflow: hidden` around text whose content exceeds the box, with no scroll, ellipsis, or title. | Prefer `min-height`; let content size; or `overflow: auto`. | Intentional decorative crop of non-informational content. | Glaring | Safe |
| `ellipsis-without-affordance` | `text-overflow: ellipsis` with no `title`, tooltip, or expand to reach the full text. | Add a full-text `title` or tooltip, or make it expandable. | The full value is shown elsewhere on the page. | Glaring | Safe |
| `flex-text-no-min-width` | A flex or grid child with `nowrap` and ellipsis but no `min-width: 0`, so the item blows past its track and pushes siblings (the usual cause of ragged trailing icons). | `min-width: 0` on the item, or `minmax(0, 1fr)` on the track. | Items meant to size to content. | Glaring | Safe |
| `device-pixel-breakpoints` | `@media` hardcoded to device widths (375, 768, 1024, 1440) with no content rationale, or overlapping sets. | Content-driven breakpoints in relative units, one mobile-first `min-width` ladder. | A deliberate, documented known-device constraint. | Nitpick | Judgment |
| `text-spacing-not-overridable` | Fixed-height text boxes or hard-locked `line-height` and `letter-spacing` (often `!important`) that clip when a user overrides spacing (WCAG 1.4.12 AA, line-height 1.5, paragraph 2, letter 0.12em, word 0.16em). | Avoid fixed heights on text; do not hard-lock the spacing properties; let the box grow with the text. | Scripts where a spacing property does not apply. | Untidy | Safe |

Sources: [WCAG 2.2, Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html), [WCAG 2.2, Text spacing](https://www.w3.org/WAI/WCAG22/Understanding/text-spacing.html), [web.dev, Overflow](https://web.dev/learn/css/overflow), [MDN, overflow-wrap](https://developer.mozilla.org/en-US/docs/Web/CSS/overflow-wrap), [MDN, text-overflow](https://developer.mozilla.org/en-US/docs/Web/CSS/text-overflow), [CSS-Tricks, Flexbox and truncated text](https://css-tricks.com/flexbox-truncated-text/).

---

## H. Layout stability

| name | detection signal | fix | exception | severity | autonomy |
| --- | --- | --- | --- | --- | --- |
| `media-without-dimensions` | An `<img>` or `<video>` missing `width` and `height` and with no CSS `aspect-ratio`; the element jumps when it loads. | Set `width` and `height` attributes or `aspect-ratio`; pair with `img { height: auto }`. | Out-of-flow absolutely positioned media. | Glaring | Safe |
| `unreserved-dynamic-content` | An iframe, embed, ad, or injected block above the fold with no `min-height` or `aspect-ratio` placeholder. | Reserve space with a placeholder sized to the expected content. | A shift within 500ms of user input. | Untidy | Safe |
| `skeleton-size-mismatch` | A skeleton, spinner, or empty state with different dimensions from the loaded content; a list growing from zero height. | Size placeholders to the final dimensions (`min-height`, fixed rows, `aspect-ratio`). | The final size is genuinely unknowable and below the fold. | Untidy | Safe |
| `layout-animating-properties` | A `transition` or keyframe animates `top`, `left`, `width`, `height`, or `margin`. | Animate `transform` and `opacity` instead. | Within 500ms of input, an out-of-flow element. | Nitpick | Safe |

Sources: [web.dev, Optimize CLS](https://web.dev/articles/optimize-cls), [MDN, aspect-ratio](https://developer.mozilla.org/en-US/docs/Web/CSS/aspect-ratio).

---

## I. Touch targets and focus

| name | detection signal | fix | exception | severity | autonomy |
| --- | --- | --- | --- | --- | --- |
| `touch-target-too-small` | An interactive hit area under 24 by 24 CSS px with adjacent targets not spaced apart (WCAG 2.5.8 AA); on mobile, under 44pt (iOS) or 48dp (Android); an icon button sized only to its glyph. | At least 24 by 24, or pad the hit region to 44pt or 48dp with at least 8dp between targets. | Inline text links, an equivalent control elsewhere, user-agent defaults. | Glaring | Safe (add padding) |
| `adjacent-targets-too-close` | The gap between clickables is under 8dp (icon rows at `gap: 0` or `4px`). | At least an 8dp spacing token. | A segmented control where each segment is already at least 48dp. | Untidy | Safe |
| `missing-focus-indicator` | `outline: none` or `0` on an interactive element with no `:focus-visible` replacement (WCAG 2.4.7 AA). | `:focus-visible { outline: 2px solid; outline-offset: 2px }`; never strip without a replacement. | Non-focusable elements, the user-agent default left intact. | Glaring | Safe |
| `inconsistent-focus-ring` | Focus rings vary in width or color across components (some 1px, some 3px, some none). | One focus token applied uniformly (for example 2px). | A custom focus meeting WCAG 2.4.13, applied consistently. | Untidy | Safe |
| `focus-obscured-by-sticky` | A sticky or fixed header or footer with no `scroll-margin` or `scroll-padding`, so the focused item scrolls under the bar (WCAG 2.4.11 AA). | `scroll-margin-top` or `scroll-padding-top` equal to the bar height. | A user-dismissible overlay revealing the focus. | Glaring | Safe |
| `focus-ring-clipped-by-overflow` | A focusable element sits inside `overflow: hidden` and its outline or ring is clipped at the container edge. | Add `outline-offset` room, allow `overflow: visible` at the focusable edge, or inset the ring. | Scroll containers where the ring stays in view. | Nitpick | Safe |

Sources: [WCAG 2.2, Target size minimum](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html), [WCAG 2.2, Focus visible](https://www.w3.org/WAI/WCAG22/Understanding/focus-visible.html), [WCAG 2.2, Focus not obscured](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html), [Material 3, Accessibility](https://m3.material.io/foundations/designing/structure), [Sara Soueidan, Focus indicators](https://www.sarasoueidan.com/blog/focus-indicators/).

---

## J. Color and contrast (boundary marker only)

| name | detection signal | fix | severity | autonomy |
| --- | --- | --- | --- | --- |
| `text-contrast-below-threshold` | Text against its background under 4.5 to 1 (normal) or 3 to 1 (large), or a UI border under 3 to 1 (WCAG 1.4.3 and 1.4.11). | Adjust the colors to meet the ratio. | Glaring | Defer to `theme-colors` |

This is objective and worth detecting, but the fix is a color decision. Detect it here, hand the fix to `theme-colors`. If that skill is not installed, report the failing ratio and the elements, and propose rather than silently recoloring. Source: [WCAG 2.2, Contrast minimum](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html).

---

## Triage shortcut

Highest-ROI Safe findings, easy to detect and fix without a design call: `card-row-unequal-height`, `card-internals-misaligned`, `ragged-trailing-element`, `label-value-not-columnar`, `off-grid-spacing-value`, `raw-spacing-literal`, `margin-and-gap-mixed`, `no-common-edge`, `icon-text-vertical-misalignment`, `inconsistent-button-size`, `inconsistent-border-radius`, `numeric-column-not-right-aligned`, `flex-text-no-min-width`, `awkward-heading-wrap`, `text-spacing-not-overridable`, `media-without-dimensions`, `missing-focus-indicator`, `inconsistent-focus-ring`, `touch-target-too-small`.

Verify against the dominant in-file value before snapping: `arbitrary-spacing-spread`, `inconsistent-units`, `inconsistent-content-width`, `mixed-alignment-siblings`, `ad-hoc-shadows`, `off-scale-font-size`, `too-many-font-sizes`, `inconsistent-divider`.

Surface first (Judgment): `proximity-ignores-grouping`, `non-standard-grid`, `inconsistent-interaction-states` (when adding a state), `border-overuse`, `inconsistent-icon-style`, `inconsistent-decimal-precision`, `body-text-too-small`, `emphasis-by-size-only`, `too-many-typefaces`, breakpoint strategy, and all of color and contrast.
