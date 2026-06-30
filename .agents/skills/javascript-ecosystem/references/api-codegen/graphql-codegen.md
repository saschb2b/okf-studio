---
type: Library Notes
title: "GraphQL Code Generator (client preset)"
description: "The client preset is the official recommended path."
tags: [javascript, api-codegen]
timestamp: 2026-06-04T00:00:00Z
---
# GraphQL Code Generator (client preset)

**Verified 2026-06-04.** Check the installed `@graphql-codegen/cli` and `@graphql-codegen/client-preset` versions first; re-verify if newer than below.

**Current stable**: cli 7.x with client-preset 6.x. **LLM default bias**: cli 2.x/3.x with per-operation hook plugins, `typescript-react-apollo` (emitting `useFilmsQuery`) or `typescript-react-query`, plus scattered `.graphql` files and `*.generated.ts` siblings.

## The shift
The client preset is the official recommended path. You write operations inline via a generated, typed `graphql()` function (a `TypedDocumentNode`), pass the document straight into your client's own `useQuery`, and use fragment masking so components declare their own data and receive opaque types until unmasked. The old hook-generator plugins are deprecated.

## Stop / Start
| Stop (LLM default) | Start (client preset) |
| --- | --- |
| `typescript-react-apollo` / `typescript-react-query` generated hooks | Client preset + `graphql()` document passed into your client's `useQuery` |
| Scattered `.graphql` files + `*.generated.ts` | Inline `graphql(\`...\`)` with one `gql/` output dir |
| Exposing full nested query types to every component | `fragmentMasking` with `getFragmentData` (the unmask function) |
| AST documents when pairing with TanStack Query | `documentMode: "string"` (`TypedDocumentString`) plus a tiny fetch wrapper |
| `gql` from your client lib for typing | The codegen-generated `graphql()` as the typing source |

## Gotchas
- `documentMode: "string"` is for TanStack and custom fetch only. With Apollo or urql it widens results to `any`; those want the default AST mode.
- Apollo's own docs caution against the client preset for Apollo apps. With Apollo, use `typescript-operations` + `TypedDocumentNode` and pass it into Apollo's `useQuery`. The client preset is the default for urql, TanStack, and graphql-request.
- The fragment unmask function is named `useFragment()` by default but is not a React hook and ignores the rules of hooks. Set `fragmentMasking: { unmaskFunctionName: 'getFragmentData' }` so ESLint's rules-of-hooks does not flag it.
- Exclude the generated dir from the `documents` glob (`'!src/gql/**/*'`), or codegen processes its own output and you hit circular dependencies. Import `graphql()` from the generated `./gql`, not from a client library. Persisted/trusted queries are a one-line `persistedDocuments: true`.
- For a zero-build alternative, gql.tada infers the same `TypedDocumentNode` with no codegen step.

## Companion
Full setup, the three-layer fragment-masking example, and the gql.tada path are inlined in [setup.md](./setup.md). The standalone **codegen-api** skill is an optional deeper dive on the same material.

## Sources
- https://the-guild.dev/graphql/codegen/plugins/presets/preset-client
- https://www.apollographql.com/docs/react/development-testing/graphql-codegen
