---
type: Library Notes
title: "Headless UI primitives (Radix UI, Base UI, React Aria)"
description: "The headless and primitive layer (unstyled, accessible behavior you style yourself) is the structural winner in React UI; shadcn/ui is copy-in components built on it."
tags: [javascript, ui]
timestamp: 2026-06-05T00:00:00Z
---
# Headless UI primitives (Radix UI, Base UI, React Aria)

**Verified 2026-06-05.** Check which primitive library and version the project uses first; re-verify if newer than below.

**Current stable**: Radix UI via the unified `radix-ui` package; Base UI 1.x (`@base-ui/react`); React Aria (`react-aria-components`). **LLM default bias**: per-component `@radix-ui/react-*` installs, the old `@base-ui-components/react` name, and reaching for a fully-styled kit instead of the headless layer.

## The shift
The headless and primitive layer (unstyled, accessible behavior you style yourself) is the structural winner in React UI; shadcn/ui is copy-in components built on it. Three options dominate: Radix Primitives, Base UI (from the Radix, MUI, and Floating UI authors, now 1.0 stable), and React Aria (Adobe, accessibility-first).

## Stop / Start
| Stop (LLM default) | Start (current) |
| --- | --- |
| `npm i @radix-ui/react-dialog` + `import * as Dialog from "@radix-ui/react-dialog"` | The unified `radix-ui` package: `import { Dialog } from "radix-ui"` |
| `@base-ui-components/react` (old name) | `@base-ui/react` (renamed; v1.0 stable Feb 2026) |
| Confusing Radix Primitives with Radix Themes | Primitives are headless behavior; Themes is a styled library on top |
| Low-level `react-aria`/`react-stately` hooks for everything | `react-aria-components` (the high-level component API); drop to hooks only for full render control |
| Reaching for a fully-styled kit when you need control | A primitive (Radix or Base UI) plus your own styles, or shadcn-style copy-in |

## Gotchas
- The per-component `@radix-ui/react-*` packages still work, but the docs now steer you to the single `radix-ui` package to avoid version drift.
- Base UI part trees can differ from Radix (for example an extra `Popover.Positioner`); do not assume identical structures.
- shadcn/ui sits on top of these; some shadcn distributions now ship Base UI variants.

## Companion
shadcn/ui notes in [shadcn.md](./shadcn.md); MUI's own Base UI layer in [mui.md](./mui.md).

## Sources
- https://www.radix-ui.com/primitives/docs/overview/getting-started
- https://base-ui.com/react/overview/quick-start
- https://react-aria.adobe.com/
