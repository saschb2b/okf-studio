---
type: Library Notes
title: "openapi-typescript + openapi-fetch + openapi-react-query"
description: "Codegen produces only types; runtime safety comes from inference."
tags: [javascript, api-codegen]
timestamp: 2026-06-04T00:00:00Z
---
# openapi-typescript + openapi-fetch + openapi-react-query

**Verified 2026-06-04.** Check the installed `openapi-typescript`, `openapi-fetch`, and `openapi-react-query` versions first; re-verify if newer than below.

**Current stable**: openapi-typescript 7.x; openapi-fetch 0.17; openapi-react-query 0.5. **LLM default bias**: openapi-typescript 5.x/6.x used types-only, then hand-written fetch calls or a separate hook codegen (e.g. `openapi-react-query-codegen` emitting `useFooServiceGetX`).

## The shift
Codegen produces only types; runtime safety comes from inference. `openapi-typescript` emits one `paths` type tree, `openapi-fetch`'s `createClient<paths>()` gives a typed `GET`/`POST` with near-zero runtime, and `openapi-react-query` wraps that into `$api.useQuery('get', '/path', ...)`. No per-operation hooks or service classes are generated at all.

## Stop / Start
| Stop (LLM default) | Start (current) |
| --- | --- |
| Generating named hooks or services per operation | `createClient<paths>()` + typed `client.GET('/pets/{id}', { params })` |
| A second tool to emit React Query hooks | `$api.useQuery('get', '/pets/{petId}', { params: { path: { petId } } })` |
| `axios` + manual generics | `openapi-fetch` (about 6 KB, near-zero runtime) inferring body, params, response |
| Hand-written query keys | `$api.useQuery`/`useMutation`/`useSuspenseQuery` derive keys from method, path, params |
| Regenerating on every endpoint tweak | Regenerate only the types file; runtime code never changes |

## Gotchas
- Three packages with independent semver; fetch and react-query are still 0.x, so pin and check changelogs.
- `openapi-react-query` is a thin wrapper and needs `@tanstack/react-query` v5 as a peer.
- For a richer generated SDK plus Zod, Hey API is the heavier-featured alternative; this stack is the no-generated-hooks path.
- The `<paths>` generic goes on `createFetchClient`, not on openapi-react-query's `createClient` (which takes the built fetch client). Results are `{ data, error }` and never throw on 4xx/5xx; narrow on which is present rather than using try/catch.

## Companion
Setup and the REST decision matrix are inlined in [setup.md](./setup.md). The standalone **codegen-api** skill is an optional deeper dive. Server-cache notes in [../data/tanstack-query.md](../data/tanstack-query.md).

## Sources
- https://openapi-ts.dev/openapi-react-query/
- https://openapi-ts.dev/openapi-fetch/
