---
type: Reference
title: Theming
description: Light/dark theming that follows the OS, the surface and state token layer behind it, and the deterministic palette that colors concepts by type.
tags: [ux, theme, color, accessibility]
timestamp: 2026-07-26T00:00:00Z
---

# Design tokens (one scale layer)

All visual values come from a single token layer defined once on `:root` (light and dark), and **every component references tokens — never a raw literal**. This keeps the UI consistent and makes a restyle a one-file change.

The color roles follow the shape [Zed](https://zed.dev) uses, because the problem is the same one: a dense tool window with many docked surfaces, where "which surface am I on" has to stay readable without a border around everything. Four groups, and a component picks from the group that matches its job.

## Surfaces

A fixed depth order, recessed to floating:

| Token | Where it goes |
|-------|---------------|
| `--bg-sunken` | The recessed canvas — the [graph](../features/graph-view.md) and hierarchy panes, code blocks, inset fields, slider tracks |
| `--bg` | The app frame and the tab strip |
| `--bg-chrome` | The window's furniture: title bar, status bar, activity bar |
| `--bg-elev` | Docked panes — sidebar, reader, panels |
| `--bg-overlay` | Only what floats free of the layout: dialogs, popovers, menus, tooltips, hover cards |

Two of these are newer than the rest. `--bg-overlay` exists so a dialog reads as a layer above the panel it covers rather than the same gray; in dark it is a step lighter than `--bg-elev`, and in light it stays white, because a popover that went lighter than white has nowhere to go — light separates a floating surface with shadow and a border instead of tone.

`--bg-chrome` separates the window's own furniture from the content it holds. Zed draws that line with tone; we drew it with a 1px border and nothing else. It moves **away from the content surface** — darker on light, lighter on dark — which is the same rule the state fills follow, and the reason it cannot simply be `--bg`: in light the frame color is already the right step away from white, but in dark it sits on the wrong side of the panes.

## Element states

| Token | Where it goes |
|-------|---------------|
| `--el-hover` / `--el-active` | Opaque. For a control that paints its own surface: buttons, chips, toggles |
| `--ghost-hover` / `--ghost-active` | Translucent. For anything drawn straight onto a pane: list rows, icon buttons, tabs, menu items |

Zed splits these the same way (`element.*` and `ghost_element.*`), and for the same reason: the translucent pair composites onto whatever is behind it, so a row hovers correctly on all five surfaces without knowing which one it sits on.

**State fills move toward the foreground in both themes — lighter on dark, darker on light.** Before this layer existed the app used `--bg-sunken` as its hover fill everywhere, which is right in light and backwards in dark: hover made a control *darker* than the pane it sat on, so it read as a hole punched in the surface rather than as a control lighting up. That was the single most visible defect in the dark theme, across 63 rules.

## Borders

`--border` is the structural edge (pane seams, control outlines). `--border-variant` is the quiet internal divider — the rule *between* sibling rows inside one surface, rather than the edge *of* a surface; one border weight doing both jobs makes a long list read as a stack of separate cards. `--border-strong` is the emphasized edge a control takes on hover, replacing the accent-colored hover border that made every pointer pass flash blue.

## Content

`--text` and `--text-dim`; the accent roles `--accent` (+ `--accent-contrast`, `--accent-hover`, `--accent-active`); and the status roles `--error` (with its own hover/active pair, since it is a fill on the danger button and the window close box), `--warn`, `--ok`. Each of accent, error, warn, and ok also has a translucent `-soft` tint for selected rows, callouts, and status chips — alpha rather than a mixed-in surface color, so one token works on every surface.

`--selection` binds text selection to the accent. Left to the browser this is a fixed platform blue — three different blues across Windows, WebKitGTK, and WKWebView — that ignores the theme and turns opaque over dark prose. `accent-color` and `caret-color` do the same for the controls the webview still draws itself.

## The rest of the scale

- **Spacing** (`--space-2 … --space-40`, named by px on a 2/4/8 rhythm) — paddings, margins, and gaps snap to it instead of magic numbers.
- **Type scale** (`--fs-xs 12 / --fs-sm 14 / --fs-md 16 / --fs-lg 20 / --fs-xl 28`) with paired line-height tokens — a bounded set, not a dozen ad-hoc sizes.
- **Radius** (`--radius-sm 6 / --radius 8 / --radius-lg 12`; `999px`/`50%` reserved for pills and dots).
- **Elevation** — one scale, three steps, each a tight contact shadow under a wider ambient one. `--shadow-sm` for a small raised tile (the segmented-control thumb), `--shadow` for popovers and menus, `--shadow-lg` only for modals. `--scrim` is the modal backdrop.
- **Focus** (see below) and **motion** — `--dur-fast` / `--dur` on one shared easing curve, `--ease: cubic-bezier(0.2, 0.6, 0.2, 1)`. A fast start that settles slowly is what makes a panel resize read as physical; CSS's default `ease` is symmetric, so it drifts at the start and stops abruptly. All of it is suppressed under `prefers-reduced-motion` (see [Accessibility](accessibility.md)).
- **Reading layer** — the [Concept Reader](../features/concept-reader.md) adds reader-scoped variables for its prose column: a character-based **measure**, **line-height**, **font** (the UI sans by default, an opt-in serif), and the context-**rail** width, all tunable via its "Aa" control and persisted in [settings](settings.md). Callouts and admonitions reuse the status roles via the `-soft` tints, adding no new color literals.

# Light & dark

- The app follows the OS color scheme by default, with a manual override in settings.
- Dark keeps the app's near-black identity — surfaces sit around 7–16% lightness rather than Zed's 18–26% — but the steps are spaced evenly enough that a pane edge is visible without leaning on `--border` for every seam.

**The light theme's accent and status colors are darker than their dark-theme counterparts**, and deliberately so: on a near-white surface they have to carry *text*, not just fill a shape. An accent light enough to look bright on dark is never dark enough to be read on white, so the two themes cannot share a value.

Every text-carrying role clears WCAG AA (4.5:1) on all five surfaces **and on the state fills stacked on them**. That last clause is new, and it is what a hand-check kept missing: the roles were verified against the resting surfaces only, and a hovered row is a surface too. Colored ink on a hovered row inside a dialog was the worst case, and it failed — `--accent` on `--ghost-active` over `--bg-overlay` came to 3.58 in dark. Fixing it moved the dark accent up and the light accent, error, and warn down.

`pnpm check:contrast` re-derives all 108 pairings per theme straight from the declarations in `src/styles.css` and fails on any below 4.5. Run it before changing a color role, and check both directions: a role has to be readable *as* ink and to take `--accent-contrast` at 4.5 when used as a *fill*. Inert controls are the one exception — WCAG 1.4.3 exempts them, and `--disabled-opacity` may take a role below the bar.

## The marketing site shares the brand roles

The [`design-system/`](../../design-system/) ODSF bundle is the [site's](../../site/) visual language, and it was derived from this theme. Six roles are declared to **track** it — `primary`, `primary-hover`, `focus`, `error`, `warning`, `success` map to `--accent`, `--accent-hover`, `--accent`, `--error`, `--warn`, `--ok` — so changing a color role here means changing the bundle in the same change. The accent is the product's one identity color; a visitor who reads the site and then opens the app should not meet two different blues.

The surfaces and text roles deliberately do **not** track: a marketing page is one scroll on a near-black canvas, this is a dense tool window with five stacked surfaces, and neither ramp fits the other's job. `pnpm check:ds` enforces the split, so a role can drift only by being moved into the bundle's "deliberately differ" table with a reason.

## Tokens that do not exist

`var(--nope)` with no fallback is invalid at computed-value time: the whole declaration is discarded and the property falls back to its initial or inherited value. It fails **completely silently** — no console warning, no build error, just a status color that renders as body text or a focus ring that never draws.

`pnpm check:tokens` looks for it, and `pnpm check:theme` runs it with the contrast gate. Its first run found 40: `--focus-ring` (9 uses), `--warning` (13), `--success` (10), `--text-muted` (4), and four one-off scale names. The theme has `--warn`, `--ok`, and `--text-dim`; the near-misses read as correct in review and had been discarded for months. Properties set from outside CSS — Base UI's positioner variables, Shiki's per-token variables, React inline styles — are recognized rather than flagged.

## Focus

One ring, declared once. A zero-specificity `:where()` rule in `styles.css` supplies it to every interactive element, so a component overrides it with any plain class selector but nothing has to restate it. `--focus-ring` is the color's role name (Zed calls it `border.focused`), and there are exactly two offsets: `--focus-offset` outset, and `--focus-offset-inset` for a control flush to its container's edge — a full-bleed list row, a menu item, a tab button, a caption button — where an outset ring is clipped by the container or collides with the neighbouring row. This replaced 86 hand-copied declarations that had drifted into four different offsets.

## Disabled

`--disabled-opacity`, one value, applied to the control rather than to its label: a disabled button has to take its icon and its border down with its text, on every surface. The rules it replaced had drifted to 0.45, 0.48, 0.56, 0.58, 0.6, and 0.7, one of them stacked on a `--text-dim` it had already applied.

# The type-color palette

Concept `type` drives node and badge color across the [graph](../features/graph-view.md), [reader](../features/concept-reader.md), [bundle switcher](../features/bundle-switcher.md), and [filters](../features/search-and-filter.md). Because `type` is open-ended (the [spec](../reference/okf-spec-summary.md) does not enumerate it), colors are assigned **deterministically from the type string** rather than from a fixed map:

- Sort the distinct types in a bundle; assign hues by the golden-angle sequence (`hue = 250° + i × 137.5° mod 360`) at a fixed **perceptual** lightness and chroma per theme.
- Determinism means the same type gets a stable color within a bundle and run to run, so the legend is learnable.
- The legend is the single source of truth and doubles as the [type filter](../features/search-and-filter.md).

**The colors are generated in OKLab, not HSL.** HSL's `L` is not a perceptual scale: `hsl(60 62% 64%)` and `hsl(240 62% 64%)` claim the same lightness, and the yellow is roughly three times as luminous as the blue. Ten types generated that way spanned 4.3:1 to 11.8:1 against the dark canvas — a few colors shouted and the rest turned to mud. Holding OKLab's `L` fixed instead collapses that spread to under 1.0 in both themes, so every type carries the same visual weight. `src/shared/theme.test.ts` asserts the spread, and that every type color still clears 3:1 as a mark (WCAG 1.4.11 — these are swatches, dots, and graph nodes, never text).

Colors are emitted as `#rrggbb` rather than as an `oklch()` string, and chroma is reduced (never lightness or hue) until each fits sRGB. The palette is handed to a 2D canvas, a WebGL buffer, and inline styles alike; the canvas paths depend on CSS Color 4 parsing that the oldest webview we ship on does not have, and clamping channels instead of mapping chroma would shift the hue and undo the point of an even angular sequence.

# Code, and diagrams

Two renderers in the reader ship palettes of their own, and both used to win over ours.

**Code blocks.** Shiki emits a background with its theme, and `.markdown pre.shiki` was letting it override `--bg-sunken`. That made a code block the one element in the app that contradicted the depth order, in both themes and in opposite directions: light painted `#fff` inside a `#ffffff` reader, so the recessed well collapsed to a bare 1px border, and dark painted `#24292e` — lighter than the reader pane itself, and a near-match for `--bg-overlay` — so a code block read as a popover floating above the prose. We take the token colors and not the background.

The syntax palette is then chosen on measurement against the surface it actually sits on. Dark is **One Dark Pro**, the Atom One palette Zed ships as its default: its median token contrast on `--bg-sunken` is 7.7:1 where github-dark's is 10.7, which is glare rather than legibility, and its blue/violet/salmon family is the one our accent and our generated type colors already live in. Light does *not* take Zed's One Light on the same evidence — One Light is built for a `#FAFAFA` editor, and on our darker well three of its scopes fall under 3:1, comments at 2.24. **github-light-default** measures best there.

Both themes get their comment scope lifted, and only that scope. Every syntax theme deliberately under-contrasts comments, and every one lands below the 4.5:1 that body text owes; comments in a spec bundle carry real explanation, so they move to 4.91 and 4.62 with the hue left alone. Re-tinting a whole theme to chase a threshold stops being a syntax palette and starts being a worse one.

**Mermaid diagrams** are built from the tokens via `theme: "base"` and `themeVariables`, rather than from Mermaid's stock `default`/`dark`, which were a third palette in the window belonging to no surface we have. Nodes take the recessed surface with the emphasized border the way an inset control does elsewhere, edges and their labels take the dim text role, and a subgraph takes the frame color so it groups without becoming a second card.

Mermaid bakes color into the SVG, so each diagram is rendered twice up front and CSS shows the copy matching `data-theme`. That needs the *other* theme's values while the first is live, which `getComputedStyle` cannot give: `readTokenPairs` (`shared/theme.ts`) flips `data-theme` on the root and restores it inside one synchronous block, so a style recalc is forced but no paint can happen. It takes only tokens that resolve to literal colors — a custom property is not substituted at computed-value time, so `--focus-ring` would arrive as the text `var(--accent)` and `--accent-soft` as an unevaluated `color-mix()`.

# Typography & code

- **Inter** for chrome and bodies, **JetBrains Mono** for inline code and fenced blocks with light syntax tinting, both shipped with the app as variable fonts rather than resolved from the host. A desktop app that inherits `system-ui` renders in Segoe UI on Windows, SF on macOS, and whatever fontconfig picks on Linux, so one window has three different sets of metrics and three different x-heights, and a weight like 650 either exists or silently rounds to bold. Bundling them costs about 113KB of latin subsets and makes the chrome identical on all three platforms. The system stacks stay behind them as the fallback.
- Inter is set with `font-optical-sizing: auto` and the `--ui-features` alternates (single-storey `g` and `l`, curved `r`), which read quieter at the 12px most of the chrome runs at.
- The reader's opt-in serif and its own measure/line-height controls are unaffected; they layer on top of this (see [Concept Reader](../features/concept-reader.md)).
- Markdown rendering styles (tables, blockquotes, headings) are consistent in both themes.

# Native chrome

The window runs **borderless** — native title-bar decorations are off and the [top bar](browsing-layout.md) is our own **custom title bar** (a drag region with minimize / maximize / close controls and edge resize handles), with **slightly rounded corners** (the window is transparent so the corners cut out softly; squared when maximized), so the frame is ours end to end. Smaller touches finish the native feel: scrollbars are themed to the token palette with `scrollbar-gutter: stable` (so layout doesn't shift when they appear) and a `--border-strong` thumb, since a thumb at structural-border weight is invisible against a dark pane, which is where a scrollbar matters most. Text selection is disabled on chrome but preserved on [reader](../features/concept-reader.md) prose, and the browser context menu and page-zoom — keyboard, ctrl+wheel, and trackpad/touch pinch (WebKit gesture events) — are suppressed. The **document itself never scrolls** — the app is a fixed shell whose panes scroll internally, enforced with `overflow: clip` on the root so neither wheel chaining past a pane's end nor programmatic `scrollIntoView` can shift the whole chrome (WebKitGTK's sub-pixel viewport rounding under fractional display scaling otherwise leaves the document scrollable by a hair). The text-size zoom this pairs with is content-scoped — see [Settings](settings.md).
