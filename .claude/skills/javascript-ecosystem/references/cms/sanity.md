---
type: Library Notes
title: "Sanity"
description: "The Studio is config-as-code in a single `sanity.config.ts` (no more `sanity.json`/parts)."
tags: [javascript, cms]
timestamp: 2026-06-04T00:00:00Z
---
# Sanity

**Verified 2026-06-04.** Check the installed `sanity` version first; re-verify if newer than below.

**Current stable**: Studio v5 (5.30); v4 shipped Jul 2025, v5 Dec 2025. **LLM default bias**: Studio v2 (the `sanity.json`/`parts` system, React 16/17) and pre-TypeGen GROQ with hand-written, untyped result types.

## The shift
The Studio is config-as-code in a single `sanity.config.ts` (no more `sanity.json`/parts). Content lives in the hosted Content Lake and is queried with GROQ. Sanity TypeGen is now GA: it reads your schema and `groq`-tagged queries to emit a `sanity.types.ts` for end-to-end typed queries. v4 raised the baseline to Node 20+, and v5 rebased the Studio on React 19.2.

## Stop / Start
| Stop (Studio v2) | Start (current Sanity) |
| --- | --- |
| `sanity.json` + the `parts` system | A code-first `sanity.config.ts` with `defineConfig` and `plugins` |
| Hand-writing TS interfaces for GROQ results | `sanity typegen generate` to emit `sanity.types.ts` |
| Plain-string GROQ queries | The `groq` tagged template with uniquely named queries |
| `defineConfig` assuming React 18 | React 19.2+ as the Studio v5 peer |
| Node 18 for the CLI | Node 20.19+ (required since v4) |
| Loose schema object literals | `defineType` / `defineField` / `defineArrayMember` |

## Gotchas
- Three majors landed in about 13 months (v3 Nov 2022, v4 Jul 2025, v5 Dec 2025); schemas and plugins are largely source-compatible across the jumps.
- v5 changed TypeGen output casing; regenerate and fix imports after upgrading.
- TypeGen only types queries that use the `groq` tag and have unique names; inline plain-string queries stay silently untyped.
- `next-sanity` is the recommended bridge for Next.js front ends.

## Sources
- https://www.sanity.io/blog/sanity-studio-v5
- https://www.sanity.io/docs/apis-and-sdks/sanity-typegen
