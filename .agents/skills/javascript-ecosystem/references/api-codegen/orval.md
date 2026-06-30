---
type: Library Notes
title: "Orval (REST / OpenAPI)"
description: "Orval still defaults to generating named hooks, but it is now configurable: you can suppress hooks (`useQuery: false`) and emit `queryOptions` instead, choose the HTTP layer via `httpClient`..."
tags: [javascript, api-codegen]
timestamp: 2026-06-04T00:00:00Z
---
# Orval (REST / OpenAPI)

**Verified 2026-06-04.** Check the installed `orval` version first; re-verify if newer than below.

**Current stable**: v8 (8.15). **LLM default bias**: Orval 6.x, and the assumption that Orval *only* emits named hooks like `useGetPets` / `useCreatePet`, one per operation, with no escape hatch.

## The shift
Orval still defaults to generating named hooks, but it is now configurable: you can suppress hooks (`useQuery: false`) and emit `queryOptions` instead, choose the HTTP layer via `httpClient` independently of the query layer, and toggle `useQuery`/`useInfiniteQuery`/`useMutation`/`useSuspenseQuery`. So unlike Hey API or openapi-fetch (agnostic-first), Orval is hooks-first but options-capable. LLMs are not wrong that it emits `useGetPets`, just incomplete.

## Stop / Start
| Stop (LLM default) | Start (current Orval) |
| --- | --- |
| Assuming Orval can only emit `useGetPets` named hooks | Opt into the options pattern via the `query` config and `queryOptions` |
| `useQuery: true` everywhere | `useQuery: false` to suppress the hook and consume `queryOptions`/`queryKey` directly |
| Coupling the client to the query output | `httpClient: 'fetch'` (or axios) chosen separately from `client: 'react-query'` |
| One giant generated file | `mode: 'tags-split'` so hooks, schemas, and zod land in separate modules |
| A separate validation tool | Orval's `zod` output |

## Gotchas
- Default behavior is unchanged (named hooks); the options shift is opt-in.
- v8 carried breaking changes versus v7 (mock config moved to a `generators` array; query keys now include the HTTP verb for non-GET ops). Re-read config when upgrading.
- For React Query v5, ensure the output targets v5 (suspense and infinite signatures differ from v4).
- The query-block flag is `useInfinite` (not `useInfiniteQuery`); `mock: true` now emits both MSW and Faker; v8 is ESM-only (Node 22.18+).

## Companion
Setup for the alternatives is inlined in [setup.md](./setup.md). The standalone **codegen-api** skill is an optional deeper dive on choosing between Orval, Hey API, and openapi-fetch.

## Sources
- https://orval.dev/reference/configuration/output
- https://github.com/orval-labs/orval/releases
