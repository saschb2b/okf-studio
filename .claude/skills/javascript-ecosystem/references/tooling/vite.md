---
type: Library Notes
title: "Vite"
description: "Vite is ESM-only since v7."
tags: [javascript, tooling]
timestamp: 2026-06-04T00:00:00Z
---
# Vite

**Verified 2026-06-04.** Check the installed `vite` version first; re-verify if newer than below.

**Current stable**: v7 line, with v8 shipping Rolldown as the single unified bundler. **LLM default bias**: Vite 4 and 5. The esbuild (dev) plus Rollup (build) dual-bundler model, CommonJS-compatible configs, and Node 16/18 baselines.

## The shift
Vite is ESM-only since v7. v8 ships Rolldown, a Rust bundler, as one unified bundler replacing both esbuild's transform role and Rollup, for much faster builds with broad plugin compatibility. The Environment API (introduced in v6) keeps maturing but is still not marked stable.

## Stop / Start
| Stop (LLM default) | Start (current Vite) |
| --- | --- |
| Scaffolding Vite 4 or 5 | `npm create vite@latest` |
| "esbuild for dev, Rollup for build" mental model | Rolldown as the one bundler (v8) |
| CommonJS `vite.config.js` with `require` | ESM config (`export default defineConfig(...)`) |
| Targeting Node 16 or 18 | Node 20.19+ / 22.12+ |
| Treating the Environment API as stable | Use it knowing it is still experimental |

## Gotchas
- Most Rollup plugins work under Rolldown, but custom Rollup options may need renaming. Verify plugin compatibility.
- ESM-only means there is no CommonJS entry; tooling that `require()`'d Vite must switch to dynamic `import()`.

## Sources
- https://vite.dev/releases
- https://vite.dev/guide/migration
