---
type: Library Notes
title: "Apollo Client (React)"
description: "v4 splits React out of the core, so hooks import from `@apollo/client/react` and the core is framework-agnostic."
tags: [javascript, graphql]
timestamp: 2026-06-04T00:00:00Z
---
# Apollo Client (React)

**Verified 2026-06-04.** Check the installed `@apollo/client` version first; re-verify if newer than below.

**Current stable**: 4.x (4.0 shipped Sep 2025). **LLM default bias**: Apollo Client 3.x. `useQuery` imported from top-level `@apollo/client`, `zen-observable`, the monolithic `ApolloError`, and `@client` local resolvers.

## The shift
v4 splits React out of the core, so hooks import from `@apollo/client/react` and the core is framework-agnostic. It swaps `zen-observable` for RxJS, ships ESM-first packaging for real tree-shaking, makes local state opt-in via a `LocalState` class, and overhauls the types (namespaced options/results, a unified `dataState` field, type-enforced required variables).

## Stop / Start
| Stop (Apollo Client 3) | Start (Apollo Client 4) |
| --- | --- |
| `import { useQuery } from '@apollo/client'` | Import hooks from `@apollo/client/react` (`gql` and core stay in `@apollo/client`) |
| Relying on `zen-observable` | RxJS observables (RxJS is now a required peer dependency) |
| Catching the monolithic `ApolloError` | Specific error classes (`CombinedGraphQLErrors`) with their type-guards |
| Generating hooks via `typescript-react-apollo` | Plain `TypedDocumentNode` passed to `useQuery`/`useMutation` |
| Assuming `@client` local resolvers are always bundled | Opt in via `LocalState`, or use reactive vars for simple state |
| Reading `loading`/`error`/`data` in isolation | Branch on the unified `dataState` value |

## Gotchas
- RxJS is a required peer dependency; installs break without it.
- Apollo explicitly recommends against graphql-codegen's `client` preset for Apollo apps; use `typescript-operations` + `typed-document-node` instead. This reverses the urql-popularized advice.
- Build targets moved to modern baselines (2023+ browsers, Node 20+). Run the official 3-to-4 codemod.

## Companion
GraphQL codegen notes in [../api-codegen/graphql-codegen.md](../api-codegen/graphql-codegen.md).

## Sources
- https://www.apollographql.com/blog/announcing-apollo-client-4-0
- https://github.com/apollographql/apollo-client/releases
