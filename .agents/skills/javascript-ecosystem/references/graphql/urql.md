---
type: Library Notes
title: "urql"
description: "urql stays a lightweight, exchange-based client: behavior is composed from middleware-like exchanges, with document caching by default and opt-in normalized caching via `@urql/exchange-graphcache`."
tags: [javascript, graphql]
timestamp: 2026-06-04T00:00:00Z
---
# urql

**Verified 2026-06-04.** Check the installed `urql` / `@urql/core` versions first; re-verify if newer than below.

**Current stable**: urql 5.0 (`@urql/core` 5.x). **LLM default bias**: urql 1.x to 3.x. `useQuery` tuple results, manual exchange wiring with hand-called `share()`, and older Graphcache.

## The shift
urql stays a lightweight, exchange-based client: behavior is composed from middleware-like exchanges, with document caching by default and opt-in normalized caching via `@urql/exchange-graphcache`. v5 simplified custom-exchange authoring (`composeExchanges` handles `share()` internally), added `TypedDocumentNode` inference, and exported previously-missing SSR types. One package per framework (React, Vue, Svelte, Solid).

## Stop / Start
| Stop (older urql) | Start (urql 5) |
| --- | --- |
| Manually calling `share()` inside custom exchanges | Let `composeExchanges` handle sharing |
| Assuming normalized caching is built in | Add `@urql/exchange-graphcache` explicitly (default is document caching) |
| Hand-writing operation result types | `TypedDocumentNode` (graphql-codegen client preset is the canonical pairing) |
| Old Graphcache with IndexedDB serialization | Graphcache 9.x |
| Duplicating `@urql/core` / `wonka` in the dep tree | Deduplicate both on upgrade |

## Gotchas
- urql uses the `wonka` streaming library; version skew with `wonka` causes subtle bugs and bundle bloat.
- Framework bindings version independently of `@urql/core`; check each package, not just the `urql` meta-package.
- Maintenance moved to the community `urql-graphql` org; some docs still reference Formidable.

## Companion
GraphQL codegen notes in [../api-codegen/graphql-codegen.md](../api-codegen/graphql-codegen.md).

## Sources
- https://github.com/urql-graphql/urql
- https://github.com/urql-graphql/urql/blob/main/packages/core/CHANGELOG.md
