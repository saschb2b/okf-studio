---
type: Library Notes
title: "Nuxt"
description: "Nuxt 4 is a stability release that promotes the new `app/` source directory as the default `srcDir` and the stricter data layer that was behind `compatibilityVersion: 4` in Nuxt 3."
tags: [javascript, meta-frameworks]
timestamp: 2026-06-04T00:00:00Z
---
# Nuxt

**Verified 2026-06-04.** Check the installed `nuxt` version first; re-verify if newer than below.

**Current stable**: 4.x (4.0 shipped Jul 2025). **LLM default bias**: Nuxt 3, with `pages/`, `components/`, `composables/` flat at the project root, and Nitro 2.

## The shift
Nuxt 4 is a stability release that promotes the new `app/` source directory as the default `srcDir` and the stricter data layer that was behind `compatibilityVersion: 4` in Nuxt 3. The larger engine change (Nitro 3 with h3 v2 and Web-standard naming) is deferred to Nuxt 5.

## Stop / Start
| Stop (LLM default) | Start (current Nuxt) |
| --- | --- |
| `pages/`, `components/`, `layouts/` at project root | The same directories under `app/` (default `srcDir`) |
| Assuming loose `useAsyncData`/`useFetch` key dedup | The Nuxt 4 data layer, where same-key calls share one reactive ref |
| Targeting Nuxt 3 as current | Nuxt 4 as npm `latest`; Nuxt 3 maintenance ends Jul 31 2026 |
| Claiming Nitro 3 for Nuxt 4 | Nuxt 4 still ships Nitro 2; Nitro 3 lands in Nuxt 5 |

## Gotchas
- The Nuxt 3 to 4 upgrade is low-friction if `compatibilityVersion: 4` was already enabled.
- Do not promise h3 v2 status codes (`status`/`statusText`) in Nuxt 4; that is a Nuxt 5 / Nitro 3 change.

## Agent skills
Nuxt ships an official MCP server (nuxt.com/mcp) and the Nuxt Agent, plus `llms.txt`. Prefer the official MCP for agent context.

## Sources
- https://nuxt.com/blog/v4
- https://endoflife.date/nuxt
