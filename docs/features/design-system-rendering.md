---
type: Feature
title: Design-System Rendering
description: Render an ODSF bundle's design artifacts — token swatches/specimens/scales, design status, and live HTML example previews — natively in the reader.
tags: [feature, odsf, design-system, tokens, reader]
timestamp: 2026-06-30T19:00:00Z
---

# What it does

An [ODSF](../reference/okf-spec-summary.md) bundle (the Open Design System Format — a *profile* of OKF for packaging a design system) carries design artifacts a plain markdown reader would show only as raw frontmatter and dead links: machine-readable **design tokens**, companion **HTML/CSS example assets**, and design-oriented **status**. The viewer renders these natively in the [Concept Reader](concept-reader.md), so opening an ODSF bundle *shows* the design system — swatches, type specimens, scales, and (with [`read_asset`](../architecture/ipc-and-security.md)) the live rendered example — rather than describing it.

This is **feature-detected, never a mode**: ODSF adds nothing OKF mandates, so the viewer reads each concept and renders whatever design artifacts it declares. A plain OKF concept declares none and renders exactly as before. No setting, no bundle-level switch.

# Token visualizations

When a concept carries a `tokens` map (preserved into `extra` by the [indentation-aware parser](../architecture/okf-parsing.md)), the reader renders it as a visualization chosen from the concept's `type`:

- **`Color`** → a grid of **swatches** (the chip, the token name, the value); click any swatch to copy its value.
- **`Typography`** → **specimens**: each role rendered at its own size / weight / line-height.
- **`Spacing`** → a **scale** of proportional bars.
- **`Shape`** → **radius** sample boxes; **`Elevation`** → **shadow** sample boxes.
- **`Motion`** → a duration/easing **table**.
- Anything else with tokens (a **`Component`**) → a **token table**: each token, its raw value, and what it resolves to, with a color dot for color values.

## Token references

A token value may reference another with design.md's `{group.name}` syntax (a component's `background: "{colors.bgColor-success-emphasis}"`). The viewer builds a **bundle-wide token index** from every concept's foundation tokens and resolves references against it, so a component shows the concrete value (and color dot) it will actually render. The **same resolution runs in the body prose**: a `{group.name}` written in inline code is annotated with the value it resolves to (and gets a swatch when that value is a color), so a doc that *mentions* a token still shows it. An unresolved reference is left verbatim, tolerated like a [broken link](../architecture/okf-parsing.md).

# Color values in the body

Beyond the dedicated token visualizations, the [reader's markdown body](concept-reader.md) enhances the bundle's own content in place: any inline code that is exactly a color (`#1f883d`, `rgb(...)`, `hsl(...)`) is prefixed with a small swatch, so a hand-written `# Roles` table or a value mentioned in prose *shows* its color. This reads the document as authored — no synthesized overview — and just renders its content as richly as possible. It is bundle-agnostic (any OKF bundle benefits) and the chip color is strictly validated before being inlined.

# Status & platform labels

Beside the type badge, the reader surfaces two ODSF frontmatter fields when present: **`status`** (`stable` / `experimental` / `deprecated`, colored only to flag the exception so a stable system stays quiet) and **`applies_to`** (the platforms/surfaces a concept governs).

# Live example previews

A concept's companion **example assets** — `*.example.html` (canonical usage) and the `*.do.html` / `*.dont.html` of a do/don't pair — render as **live previews** between the header and the body: the actual HTML, rendered, with a **Preview / Code** toggle and a Do/Don't label. Assets are listed in the `examples` frontmatter and also discovered from `.html` links in the body (so a `# Examples` link is a live affordance, not a broken one — clicking it jumps to the rendered preview). Each is read via [`read_asset`](../architecture/ipc-and-security.md), and the stylesheets it links (`styles/tokens.css`, `styles/components.css`) are **inlined** so it renders truthfully to the system's tokens. The preview is a **sandboxed, script-free** iframe (the asset is static HTML/CSS by spec, so no JavaScript runs), sized to its content; a missing asset is skipped, not surfaced as an error.

A linked **stylesheet** (`.css`) has no rendered form, so it is shown as a **code block** instead of an iframe — a foundation that links `styles/tokens.css`, or a component that links `styles/components.css`, displays its source inline.

# What it deliberately is not

- **Not an editor.** The viewer renders a design system; it does not author or modify tokens or assets (the [read-only principle](../product/principles.md)).
- **Not a component runtime.** Example assets are vanilla HTML/CSS the viewer renders as-is; there is no React/Vue/web-components execution, matching ODSF's own non-goals.
- **Not ODSF-exclusive.** The same machinery renders tokens/examples on any OKF bundle that happens to carry them; ODSF is just the profile that standardizes the shape.

See the [ODSF spec](https://github.com/saschb2b/Open-Design-System-Format) for the format these artifacts follow.
