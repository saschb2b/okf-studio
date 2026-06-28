---
type: Library Notes
title: "UnoCSS"
description: "UnoCSS is an atomic-CSS engine (instant, on-demand, preset-driven), not a fixed framework."
tags: [javascript, ui]
timestamp: 2026-06-04T00:00:00Z
---
# UnoCSS

**Verified 2026-06-04.** Check the installed `unocss` version and `uno.config.ts` presets first; re-verify if newer than below.

**Current stable**: 66.x (66.7, May 2026); a single rolling major across all packages. **LLM default bias**: the old `presetUno()` / `@unocss/preset-uno` paired with `@unocss/reset`, and framing UnoCSS as a Tailwind clone rather than an engine.

## The shift
UnoCSS is an atomic-CSS engine (instant, on-demand, preset-driven), not a fixed framework. Its Tailwind-compatible layer now tracks Tailwind v4 via `preset-wind4`. `preset-uno` was deprecated in 66.0 in favor of `presetWind3`, and `presetWind4` is the Tailwind-v4-aligned preset that bundles its own reset and emits a CSS-variable-driven theme.

## Stop / Start
| Stop (LLM default) | Start (current UnoCSS) |
| --- | --- |
| `presetUno()` / `@unocss/preset-uno` | `presetWind3()` (preset-uno deprecated in 66.0) or `presetWind4()` for Tailwind v4 |
| Importing `@unocss/reset` or normalize.css | preset-wind4's built-in, configurable reset |
| Assuming Tailwind v3 theme keys | wind4's restructured, CSS-variable-backed theme |
| Treating UnoCSS as just a Tailwind clone | Engine features (presets, attributify mode, shortcuts, pure-CSS icons) |
| A global always-on utility build | On-demand generation via the Vite plugin |

## Gotchas
- `preset-wind4` is opt-in, not yet the silent default in starters; confirm whether your scaffold wires `presetWind3` and migrate intentionally.
- wind4 changes theme key shapes, so configs written against wind3 or Tailwind v3 need adjustment.
- Dynamically constructed class names still need safelisting.

## Companion
Tailwind v4 paradigm notes in [tailwind.md](./tailwind.md).

## Sources
- https://unocss.dev/presets/wind4
- https://unocss.dev/presets/
