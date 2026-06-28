---
type: Library Notes
title: "Astro"
description: "Astro 5 replaced legacy content collections with the Content Layer API (pluggable loaders for any source), merged `static` and `hybrid` into a single `static` default that goes dynamic per-route..."
tags: [javascript, meta-frameworks]
timestamp: 2026-06-04T00:00:00Z
---
# Astro

**Verified 2026-06-04.** Check the installed `astro` version first; re-verify if newer than below.

**Current stable**: 6.0 (Mar 2026); 5.0 shipped Dec 2024. **LLM default bias**: Astro 3 and 4. Legacy glob content collections, `output: 'hybrid'`, and no server islands or actions.

## The shift
Astro 5 replaced legacy content collections with the Content Layer API (pluggable loaders for any source), merged `static` and `hybrid` into a single `static` default that goes dynamic per-route when an adapter is added, and introduced Server Islands and Astro Actions. Astro 6 removes the legacy content API entirely and rebuilds the dev server on Vite's Environment API.

## Stop / Start
| Stop (LLM default) | Start (current Astro) |
| --- | --- |
| Legacy `defineCollection` without a loader | Content Layer API with an explicit `loader:` (`glob()`, `file()`, custom) |
| `output: 'hybrid'` | `output: 'static'` (default) plus an adapter; mark routes with `export const prerender = false` |
| Server-rendering a whole page for one dynamic widget | Server Islands (`server:defer`) |
| Custom API endpoints for form and mutation calls | Astro Actions (`astro:actions`) with validation |
| `import.meta.env` for typed or secret env | `astro:env` (typed, client/server-segmented schema) |

## Gotchas
- Astro 6 fully removes legacy content collections. Any unmigrated collection breaks the build.
- Astro 6 upgrades to Vite 7 and a new Zod major. Content schemas may need adjustment.
- Astro 6 drops Node 18 and 20. Target Node 22+.

## Agent skills
Astro ships an official Docs MCP server (`withastro/docs-mcp`), which replaced its `llms.txt`. Prefer the MCP for agent context.

## Sources
- https://astro.build/blog/astro-5/
- https://github.com/withastro/astro/releases
