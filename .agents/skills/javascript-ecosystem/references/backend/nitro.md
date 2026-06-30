---
type: Library Notes
title: "Nitro"
description: "Nitro is the deploy-anywhere server toolkit (the engine under Nuxt) that builds one app and ships it to Node, Bun, Deno, Cloudflare, Vercel, and Netlify."
tags: [javascript, backend]
timestamp: 2026-06-05T00:00:00Z
---
# Nitro

**Verified 2026-06-05.** Check the installed `nitropack` (or `nitro`) version first; re-verify if newer than below.

**Current stable**: Nitro 2.x (`nitropack`); Nitro 3 is in beta. **LLM default bias**: Nitro 2 with h3 v1, the `nitropack` package name, and `eventHandler`/`createError` APIs.

## The shift
Nitro is the deploy-anywhere server toolkit (the engine under Nuxt) that builds one app and ships it to Node, Bun, Deno, Cloudflare, Vercel, and Netlify. Nitro 3 rebases onto h3 v2, a rewrite around Web Standard primitives instead of h3 v1's Node-centric `H3Event` model, and slims dependencies.

## Stop / Start
| Stop (Nitro 2 / h3 v1) | Start (Nitro 3 / h3 v2) |
| --- | --- |
| The `nitropack` package and `nitropack/runtime/*` paths | The `nitro` package with `nitro/*` paths |
| `defineEventHandler` / `eventHandler` | `defineHandler` |
| `createError(...)` | Throw `HTTPError` |
| h3 v1 `H3Event` accessors as the only model | Web Standard request and response access |
| "Nitro is Nuxt-only" | A standalone, runtime-agnostic server toolkit |

## Gotchas
- Nitro 3 and h3 v2 are still beta as of June 2026. Use Nitro 2 in production; Nitro 3 is gated on h3 v2 stabilization and the Nuxt 5 timeline.
- On Node, h3 v2 runs web-standard handlers through a compatibility layer (`srvx`); verify behavior on your target runtime.
- h3 v2 advertises a back-compat layer, but the renames (`defineHandler`, `HTTPError`) are the forward path.
- In h3 v2 read the body via `event.req.json()`/`.text()`/`.formData()` and headers via `event.req.headers.get(name)`, not `readBody(event)`/`getHeader(...)`. A handler can be a plain function as well as `defineHandler`.

## Sources
- https://nitro.build/blog/v3-beta
- https://h3.dev/blog/v2-beta
