---
name: visual-consistency
description: Detect and fix visual and layout consistency defects in rendered UI, the systematic raggedness AI generators emit and seniors notice at a glance. Covers uneven card heights in a grid, sibling cards whose internal sections (title, body, footer) do not line up, trailing icons such as open-in-new-tab at ragged X positions, and arbitrary off-scale spacing, plus alignment, repeated elements (buttons, radius, shadow, icons), type scale, tables and numeric alignment, borders, overflow, layout shift, touch targets, and focus rings. Each smell carries an objective detection signal, a concrete CSS fix (subgrid, equal-height grids, spacing tokens, tabular-nums), an exception guard, a severity, and whether an agent may fix it freely or must surface a design call first. Use when reviewing or building any UI, when a card grid or list looks busy or ragged, when spacing feels arbitrary, or when asked to tidy or align a layout so it scans cleanly. Defers color to theme-colors and component code smells to react-stinky.
tags: [frontend, ui, css, review]
date: 2026-06-17
---

# Visual Consistency

A detector and fixer for the visual and layout consistency defects that show up in rendered UI: the systematic raggedness an AI generator emits and a senior notices at a glance. It finds where repeated elements that should line up do not, where spacing is arbitrary instead of systematic, and where variable-length content breaks a clean layout, explains the cost of each, and proposes a concrete CSS fix with a source. The full catalog with detection signals, fixes, exceptions, severity, and sources is in [catalog.md](./references/catalog.md); copy-pasteable recipes for the flagship cases are in [recipes.md](./references/recipes.md). Read the catalog before a scan.

It defers two neighboring concerns to sibling skills so it does not duplicate them: color literals and contrast to `theme-colors`, and component, hook, and TypeScript code smells to `react-stinky`. The accessibility line splits the same way: this skill owns the visual and sizing side (target size, focus-ring consistency, reflow, text spacing the user can override), `react-stinky` owns the semantic-markup side (roles, labels, keyboard handlers). Whether a screen should exist at all is `ask-ux`, upstream of everything here. If a sibling is not installed, note the finding in one line and move on.

## The four it was built for

These are the defects that prompted the skill. Each has a clean, modern fix; the rest of the catalog generalizes them.

1. **Uneven card heights in a grid.** Cards in a row render at different heights because text length differs, so the grid looks busy. Grid and flex already stretch a row to its tallest card; the work is making the card a flex or grid column so its own footer pins to the bottom. See [recipes.md](./references/recipes.md#equal-height-card-grids).
2. **Sibling cards whose sections do not line up.** Same template, but each card's title, body, and footer start at a different Y, so nothing scans across the row. The modern answer is CSS **subgrid**: declare the row tracks once on the grid and let each card inherit them, so the tallest title sets the title row for every card. See [recipes.md](./references/recipes.md#subgrid-aligns-card-internals).
3. **Trailing icons at ragged X positions.** A list of links with an open-in-new-tab icon places the icon at a different X on every row because link text varies. Pin it with a two-column grid (`1fr auto`), or `margin-inline-start: auto` in a flex row, and add `min-width: 0` so long text truncates instead of shoving the icon. See [recipes.md](./references/recipes.md#align-trailing-icons-and-values).
4. **Arbitrary, inconsistent spacing.** Spacing falls back to off-scale magic numbers (`13px`, `7px`, `22px`), or mixes `margin` and `gap`, or pads similar containers differently. Snap every value to a spacing scale (4 and 8 point) referenced as a token, and prefer one `gap` on the parent over per-element margins. See [recipes.md](./references/recipes.md#spacing-scale-and-rhythm).

## What it checks

Ten families, detailed with per-smell detection signals and sources in [catalog.md](./references/catalog.md):

- **Card grids and repeated items.** Equal height, internal-section alignment (subgrid), ragged trailing icons and values.
- **Spacing and rhythm.** Off-scale values, raw literals where a token exists, outer padding smaller than inner, spacing not reflecting grouping.
- **Alignment and grid.** Elements not sharing a common edge, off baseline grid, icon-to-text misalignment, centered long text, mixed alignment, label and value rows that do not form a column, content-container width that jumps between sections.
- **Repeated-element consistency.** Same-role buttons or inputs at different sizes, inconsistent border-radius, ad-hoc shadows instead of an elevation scale, mismatched icon sizes, inconsistent interaction states and untokenized motion.
- **Typography.** Off-scale font sizes, too many sizes, line-height not paired to size, line length past the readable measure, awkward heading wrapping (balance and pretty), inconsistent units for one role.
- **Tables and lists.** Numbers not right-aligned, no `tabular-nums`, header not matching its column, uneven row heights.
- **Borders and dividers.** Overuse of borders for separation, redundant adjacent divides, inconsistent divider weight.
- **Responsive, overflow, long content.** Fixed widths that overflow small screens, long strings with no `overflow-wrap`, text clipped by a fixed height, ellipsis with no full-text affordance, text spacing the user cannot override.
- **Layout stability.** Media with no dimensions or `aspect-ratio`, skeletons sized differently from the loaded content.
- **Touch targets and focus.** Hit area below the minimum, stripped focus outline with no replacement, inconsistent focus rings.

Color and contrast are detected only as a boundary marker and handed to `theme-colors`.

## Scope modes

Match the scope to the request, then run the workflow over it.

| Mode | Trigger | What to inspect |
| --- | --- | --- |
| Rendered screen | the app is runnable | Run it, look at the real screen and its loading, empty, long-content, and error states. The raggedness is visual; see it before you grep. |
| Component | one component or template named | Read the component and the styles that reach it; check every repeated child. |
| Folder or repo sweep | "tidy up the UI", "make it consistent" | Glob the style sources and components. Prioritize shared layout, card, list, table, and design-token files. |
| Snippet | a pasted component or stylesheet | Check only that surface. State what you assumed about anything off-screen. |

## Workflow per target

1. Prefer the rendered UI. If the app runs, look at the real screen, including its long-content and empty states, before reading code. If it does not, work from the markup and styles.
2. Walk each surface against the catalog families. For a grid, list, table, or card template, start with the flagship four.
3. Run the matching "Don't flag" guard before reporting. If it applies, suppress the finding.
4. Rate each finding on both axes (below).
5. Emit a finding with location, the cost, and a before-to-after fix. For Safe findings you may apply the fix, then re-render and confirm it holds at a narrow and a wide width; for Judgment findings, surface it.
6. End with a summary count. If nothing survives the guard, say it looks clean.

## Severity and autonomy

Rate every finding on two axes. Severity says how much it hurts; autonomy says who decides the fix.

**Severity.**
- **Glaring.** Jumps out on sight, or an objective failure (overflow, clipped text, a touch target below the minimum, a stripped focus ring). Fix now.
- **Untidy.** A real consistency drag a senior would notice, not a break. Should fix.
- **Nitpick.** Minor or situational. Optional, fix when batching.

**Autonomy.**
- **Safe.** Objective and reversible, and it snaps to a scale or value the design has already established (an off-grid margin to the nearest token, a same-role button to the dominant size, a numeric column to right-aligned). Fix it freely.
- **Judgment.** The fix introduces a value or direction the design has not set (which typeface to drop, where the group boundaries are, a new breakpoint strategy, anything color). Propose, do not silently ship.

The autonomy axis is the bridge to `autopilot`. **Safe maps to in-bounds work, Judgment maps to surface-first.** An autonomous run fixes Safe findings and records Judgment ones as proposals. Scope each commit to one family or one component, never a repo-wide spacing rewrite in a single diff. Let Nitpicks ride along while you are already in a file rather than earning their own commit. Verify visually: screenshot the screen before and after at a narrow and a wide width, since a layout fix can regress overflow or wrapping that a green build will not catch.

## Don't flag

The guard that keeps this from becoming a noisy linter. Honor it.

- Deliberate masonry or staggered layouts. Uneven heights are the design there, not a defect.
- Off-scale values that are correct: `1px` hairlines and borders, optical nudges to make an asymmetric glyph look centered, a true pill radius (`9999px`) or circle (`50%`), an intrinsic asset size.
- Clamping or truncation on teasers and descriptions is fine; do not clamp load-bearing content (prices, names, errors) without an affordance.
- Documented size and emphasis variants (small, medium, large, icon-only) are not inconsistency.
- One real problem, one finding. Prefer the smallest fix. Respect a consistent local convention over the catalog default.
- Defer color and contrast to `theme-colors`, and component or TypeScript code smells to `react-stinky`, rather than duplicating them.

## Output format

```
Visual Consistency report, <scope>

src/components/CardGrid.tsx
  [Glaring / Safe] card-internals-misaligned (card grids), the .card row
    Smell: each card lays out independently, so titles and CTAs land at different Y across the row.
    Cost: the row does not scan; the eye re-finds each section per card. Looks busy.
    Fix: declare the row tracks on the grid and opt each card into subgrid.
      .grid  { grid-template-rows: auto auto 1fr auto; }
      .card  { display: grid; grid-template-rows: subgrid; grid-row: span 4; }
    Source: MDN Subgrid (https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_grid_layout/Subgrid)

  [Untidy / Safe] off-grid-spacing (spacing and rhythm), line 22
    Smell: padding: 13px 7px is off the spacing scale.
    Cost: nothing aligns to the grid; spacing reads as arbitrary.
    Fix: snap to the scale token, padding: var(--space-3) var(--space-2) (12px 8px).
    Source: Material 3 spacing (https://m3.material.io/foundations/layout/understanding-layout/spacing)

Summary: 1 glaring, 1 untidy across 1 file. 2 Safe, 0 Judgment.
```

When the scope is clean, say so plainly: "Looks clean. No visual consistency defects found in `<scope>`."

## Source

The flagship fixes and the catalog are grounded in MDN, web.dev, and caniuse for CSS behavior and browser support (subgrid, `line-clamp`, container queries, `aspect-ratio`, `tabular-nums`), the major design systems for scales and tokens (Material 3, Shopify Polaris, IBM Carbon, Atlassian), Refactoring UI and Anthony Hobday's visual rules for the consistency principles, and WCAG 2.2 for the objective accessibility floors (target size, reflow, focus). Per-smell sources are in [catalog.md](./references/catalog.md).
