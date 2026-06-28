---
type: Library Notes
title: "Hey API (REST / OpenAPI)"
description: "Hey API generates a framework-agnostic SDK (typed functions over a configurable `fetch`/`axios`/`next` client), and a plugin layer composes on top."
tags: [javascript, api-codegen]
timestamp: 2026-06-04T00:00:00Z
---
# Hey API (REST / OpenAPI)

**Verified 2026-06-04.** Check the installed `@hey-api/openapi-ts` version first; re-verify if newer than below.

**Current stable**: 0.98 (still 0.x, production-grade). **LLM default bias**: the old `openapi-typescript-codegen` and early Hey API that emitted monolithic service classes (`PetService.getPetById()`), or the assumption that you import generated named hooks.

## The shift
Hey API generates a framework-agnostic SDK (typed functions over a configurable `fetch`/`axios`/`next` client), and a plugin layer composes on top. The `@tanstack/react-query` plugin emits **options factories** (`getPetByIdOptions(...)`), not React hooks, so you stay on TanStack's own `useQuery` and spread the options in.

## Stop / Start
| Stop (LLM default) | Start (current Hey API) |
| --- | --- |
| Importing a generated hook like `useGetPetByIdQuery` | `useQuery({ ...getPetByIdOptions({ path: { petId } }) })` |
| Service-class methods (`PetService.getPetById`) | Tree-shakeable SDK functions or options factories |
| Hand-writing query keys | Read `queryKey` off the options object (or `getPetByIdQueryKey(...)`) |
| Custom mutation wiring | `useMutation({ ...addPetMutation() })` then `.mutate({ body })` |
| A second tool for runtime validation | The first-party `zod` plugin |
| Locking the codegen to one HTTP lib | Select the client (`@hey-api/client-fetch`, `-axios`, `-next`) separately |

## Gotchas
- Still 0.x; minor bumps can carry breaking config changes. Pin the version (`-E`).
- A client plugin (`@hey-api/client-fetch`/`-axios`/`-next`) is required; there is no default client since v0.51 (legacy clients removed in v0.87). Configure it at runtime via `client.setConfig(...)`, not in the codegen config.
- Config is a `plugins: [...]` array; older top-level flags (`services`, `schemas`, `client`) are legacy. The SDK emits flat tree-shakeable functions, not a `DefaultService` class.
- Runtime validation is wired through the SDK `validator` option backed by the `zod` plugin, not by importing schemas by hand.

## Companion
Full setup and usage are inlined in [setup.md](./setup.md). The standalone **codegen-api** skill is an optional deeper dive on the same material. Server-cache notes in [../data/tanstack-query.md](../data/tanstack-query.md).

## Sources
- https://heyapi.dev/openapi-ts/plugins/tanstack-query
- https://github.com/hey-api/openapi-ts
