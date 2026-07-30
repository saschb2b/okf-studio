---
type: Feature
title: Design-System Rendering
description: Render an ODSF bundle's design artifacts — token swatches/specimens/scales, design status, and live HTML example previews — natively in the reader.
tags: [feature, odsf, design-system, tokens, reader]
generated: { by: claude/unrecorded, at: 2026-07-13T19:42:50Z }
---

# What it does

ODSF, the Open Design System Format, is a *profile* of OKF for packaging a design system. An [ODSF](../reference/okf-spec-summary.md) bundle carries design artifacts a plain markdown reader would show only as raw frontmatter and dead links. Those artifacts are machine-readable **design tokens**, companion **HTML/CSS example assets**, and design-oriented **status**. Studio renders them natively in the [Concept Reader](concept-reader.md). Opening an ODSF bundle then *shows* the design system rather than describing it: swatches, type specimens, scales, and (with [`read_asset`](../architecture/ipc-and-security.md)) the live rendered example.

This is **feature-detected, never a mode**: ODSF adds nothing OKF mandates, so Studio reads each concept and renders whatever design artifacts it declares. A plain OKF concept declares none and renders exactly as before. No setting, no bundle-level switch.

# Token visualizations

When a concept carries a `tokens` map (preserved into `extra` by the [indentation-aware parser](../architecture/okf-parsing.md)), the reader renders it as a visualization chosen from the concept's `type`:

- **`Color`** → a grid of **swatches** (the chip, the token name, the value). Click any swatch to copy its value.
- **`Typography`** → **specimens**: each role rendered at its own size / weight / line-height.
- **`Spacing`** → a **scale** of proportional bars.
- **`Shape`** → **radius** sample boxes.
- **`Elevation`** → **shadow** sample boxes.
- **`Motion`** → a duration/easing **table**.
- Anything else with tokens (a **`Component`**) → a **token table**: each token, its raw value, and what it resolves to, with a color dot for color values.

## Token references

A token value may reference another with design.md's `{group.name}` syntax (a component's `background: "{colors.bgColor-success-emphasis}"`). Studio builds a **bundle-wide token index** from every concept's foundation tokens and resolves references against it. A component then shows the concrete value (and color dot) it will actually render.

The **same resolution runs in the body prose**. The reader annotates a `{group.name}` written in inline code with the value it resolves to, and adds a swatch when that value is a color. So a doc that *mentions* a token still shows it. The reader leaves an unresolved reference verbatim and tolerates it like a [broken link](../architecture/okf-parsing.md).

# Color values in the body

Beyond the dedicated token visualizations, the [reader's markdown body](concept-reader.md) enhances the bundle's own content in place. The reader puts a small swatch in front of any color value. That covers inline code that is exactly a color (`#1f883d`, `rgb(...)`, `hsl(...)`), and a **hex color written in plain prose** (Primer's `borderColor-default (#d1d9e0) hairlines …`). So a hand-written `# Roles` table or a value mentioned mid-sentence *shows* its color. The reader validates the chip color strictly before it inlines it.

The body also renders **images**: a local diagram inlined and click-to-zoom, a remote one offered as a browser link. See [Concept Reader](concept-reader.md). This reads the document as authored, with no synthesized overview, and renders its content as richly as possible. It is bundle-agnostic, so any OKF bundle benefits.

# Status & platform labels

Beside the type badge, the reader surfaces two ODSF frontmatter fields when present. The **`status`** field is `stable`, `experimental`, or `deprecated`. The reader colors it only to flag the exception, so a stable system stays quiet. The **`applies_to`** field names the platforms and surfaces a concept governs.

# Live example previews

A concept's companion **example assets** render as **live previews** between the header and the body: the actual HTML, rendered, with a **Preview / Code** toggle and a Do/Don't label. Those assets are `*.example.html` (canonical usage) and the `*.do.html` / `*.dont.html` of a do/don't pair. The `examples` frontmatter lists them, and the reader also discovers them from `.html` links in the body. A `# Examples` link is then a live affordance rather than a broken one, and clicking it jumps to the rendered preview. Studio reads each asset via [`read_asset`](../architecture/ipc-and-security.md) and **inlines** the stylesheets it links (`styles/tokens.css`, `styles/components.css`), so it renders truthfully to the system's tokens. The preview is a **sandboxed, script-free** iframe sized to its content. The asset is static HTML/CSS by spec, so no JavaScript runs. The reader skips a missing asset rather than reporting an error.

A linked **stylesheet** (`.css`) has no rendered form, so the reader shows it as a **code block** instead of an iframe. A foundation that links `styles/tokens.css`, or a component that links `styles/components.css`, displays its source inline.

# What it deliberately is not

- **Not a direct editor.** The rendering surface never mutates tokens or assets. An agent thread may propose reviewed Markdown changes through the ordinary staged-write flow. It cannot alter a live preview, and it cannot bypass validation and Apply (see the [read-only principle](../product/principles.md)).
- **Not a component runtime.** Example assets are vanilla HTML/CSS Studio renders as-is. Nothing executes React, Vue, or web components, which matches ODSF's own non-goals.
- **Not ODSF-exclusive.** The same machinery renders tokens/examples on any OKF bundle that happens to carry them. ODSF is just the profile that standardizes the shape.

See the [ODSF spec](https://github.com/saschb2b/Open-Design-System-Format) for the format these artifacts follow.
