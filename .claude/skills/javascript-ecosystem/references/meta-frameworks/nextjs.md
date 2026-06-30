---
type: Library Notes
title: "Next.js"
description: "The App Router is the only modern path and Server Components are the default."
tags: [javascript, meta-frameworks]
timestamp: 2026-06-04T00:00:00Z
---
# Next.js

**Verified 2026-06-04.** Check the installed `next` version first; re-verify if newer than below.

**Current stable**: 16.2 (Mar 2026); 16.0 shipped Oct 2025. **LLM default bias**: Next 13 and 14. Pages Router treated as primary, webpack, and implicit caching of `fetch` and route segments.

## The shift
The App Router is the only modern path and Server Components are the default. Turbopack is the default bundler for dev and build. Implicit caching is gone. Caching is now explicit and opt-in via Cache Components (`"use cache"` plus Partial Prerendering). Request-time APIs are async.

## Stop / Start
| Stop (LLM default) | Start (Next 16) |
| --- | --- |
| Scaffolding in `pages/` | App Router (`app/`) with Server Components by default |
| Relying on implicit `fetch` / segment caching | Explicit `"use cache"` + `cacheLife`/`cacheTag` under `cacheComponents` |
| `experimental.ppr` flag | Cache Components (PPR folded in; standalone flag removed) |
| `middleware.ts` | `proxy.ts` (renamed, runs on Node runtime) |
| Sync `params`, `searchParams`, `cookies()`, `headers()` | `await` them, all async now |
| Webpack assumptions / `next lint` | Turbopack default; run ESLint or Biome directly |

## Gotchas
- Requires Node 20.9+ and React 19.2. Node 18 is dropped.
- `images.domains`, `serverRuntimeConfig`/`publicRuntimeConfig`, and AMP support are removed or deprecated.
- Parallel route slots now need an explicit `default.js` or the build fails.

## Companion
React paradigm notes in [../frameworks/react.md](../frameworks/react.md). API codegen setup in [../api-codegen/setup.md](../api-codegen/setup.md).

## Agent skills
Vercel publishes official Next.js agent skills: `npx skills add vercel-labs/next-skills` (`next-best-practices`, `next-cache-components`, `next-upgrade`), with docs at vercel.com/docs/agent-resources. Prefer them for Next.js work.

## Sources
- https://nextjs.org/blog/next-16
- https://nextjs.org/docs/app/guides/upgrading/version-16
