---
type: Library Notes
title: "shadcn/ui"
description: "The package and CLI were renamed `shadcn-ui` to `shadcn`."
tags: [javascript, ui]
timestamp: 2026-06-04T00:00:00Z
---
# shadcn/ui

**Verified 2026-06-04.** Not semver-versioned; correctness tracks the current CLI and conventions. Check whether the project is on React 19 and Tailwind v4 first.

**Current state**: CLI renamed from `shadcn-ui` to `shadcn`; new projects init on React 19 + Tailwind v4. **LLM default bias**: the Tailwind v3 / React 18 generation. HSL CSS variables, no `data-slot`, the old `npx shadcn-ui@latest` command, and `tailwind.config.js` theming.

## The shift
The package and CLI were renamed `shadcn-ui` to `shadcn`. New inits target Tailwind v4 + React 19, with components rewritten to use `@theme`, OKLCH colors, and a `data-slot` attribute on every primitive. The registry has matured into a real distribution platform (multi-file registries, validation, any public GitHub repo as a source, Radix and Base UI blocks).

## Stop / Start
| Stop (LLM default) | Start (current shadcn) |
| --- | --- |
| `npx shadcn-ui@latest init` / `add` | `npx shadcn@latest init` / `add` |
| HSL CSS variables (`--background: 0 0% 100%`) | OKLCH tokens emitted by the current init |
| Styling via component internals | Target the `data-slot` attributes on every primitive |
| Assuming React 18 / Tailwind v3 scaffolds | React 19 + Tailwind v4 for new inits |
| Treating it as copy-paste only | The registry system (`registry.json`, `shadcn build`, install from GitHub) |

## Gotchas
- The Tailwind v4 init injects `@import "shadcn/tailwind.css"` into global CSS. Do not reintroduce a config-file-only setup.
- There is no single version number to pin. Correctness is matching the current CLI plus Tailwind v4 / React 19 conventions.
- `shadcn eject` inlines the styles and drops the dependency when you want that.

## Companion
Tailwind v4 paradigm notes in [tailwind.md](./tailwind.md). React 19 notes in [../frameworks/react.md](../frameworks/react.md).

## Agent skills
shadcn/ui ships an official MCP server (ui.shadcn.com/docs/mcp, `pnpm dlx shadcn@latest mcp init`) so agents browse and install registry components. Prefer it over guessing component code.

## Sources
- https://ui.shadcn.com/docs/tailwind-v4
- https://ui.shadcn.com/docs/changelog
