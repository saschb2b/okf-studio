---
type: Library Notes
title: "API codegen setup (full teachable reference)"
description: "Self-contained setup for the api-codegen tools, so this skill teaches the whole workflow without any other skill installed."
tags: [javascript, api-codegen]
timestamp: 2026-06-05T00:00:00Z
---
# API codegen setup (full teachable reference)

Self-contained setup for the api-codegen tools, so this skill teaches the whole workflow without any other skill installed. The standalone **codegen-api** skill is an optional deeper dive on the same material.

## Hey API (REST to TanStack Query)

```ts
// openapi-ts.config.ts
import { defineConfig } from "@hey-api/openapi-ts";

export default defineConfig({
  input: "./openapi.yaml",
  output: "src/client",
  plugins: [
    "@hey-api/client-fetch", // a client is REQUIRED since v0.51 (fetch/axios/next/...)
    "@hey-api/typescript",
    "@hey-api/sdk",
    "@tanstack/react-query",
    "zod",
  ],
});
```

Pin an exact version (`npm i -D -E @hey-api/openapi-ts`); the package is pre-1.0. Add `"codegen:api": "openapi-ts"` to `package.json`. Configure the client at runtime on the generated instance, not in the codegen config:

```ts
import { client } from "./client/client.gen";
client.setConfig({ baseUrl: "https://api.example.com", auth: () => token });
```

The TanStack plugin emits options factories, not hooks. Spread them into TanStack's own hooks:

```tsx
// Query: suffix Options; the key comes off the same factory
const { data } = useQuery({ ...getPetByIdOptions({ path: { petId } }), staleTime: 5000 });
const { queryKey } = getPetByIdOptions({ path: { petId } });

// Mutation: suffix Mutation
const addPet = useMutation({ ...addPetMutation() });
addPet.mutate({ body: { name: "Kitty" } });
```

Suffixes are `Options`, `QueryKey`, `InfiniteOptions`, `Mutation` (each has `.name`/`.case` overrides). Runtime validation is wired through the SDK plugin's `validator` option (`validator: true` / `'zod'` / `{ request: 'zod' }`), backed by the `zod` plugin, not by importing schemas by hand. The SDK emits tree-shakeable flat functions; the old `DefaultService` class output is gone.

## Orval (REST, hooks-first but options-capable)

```ts
// orval.config.ts
import { defineConfig } from "orval";

export default defineConfig({
  petstore: {
    input: "./petstore.yaml",
    output: {
      mode: "tags-split",
      target: "src/api/petstore.ts",
      schemas: "src/api/model",
      client: "react-query", // react-query | swr | vue-query | svelte-query | fetch | axios | zod | ...
      httpClient: "fetch",   // 'fetch' is the v8 default; 'axios' to use Axios (query clients only)
    },
  },
});
```

Orval generates one named hook per operation by default (`useShowPetById`). That is fine, but to use the options form configure `override.query` (suppress a hook with `useQuery: false`, then consume the generated `queryOptions`/`queryKey`):

```ts
output: {
  client: "react-query",
  override: {
    query: { useQuery: false, useSuspenseQuery: true, useInfinite: true, useInfiniteQueryParam: "cursor", shouldSplitQueryKey: true },
    mutator: { path: "./api/mutator/custom-instance.ts", name: "customInstance" },
  },
},
```

The flag is `useInfinite`, not `useInfiniteQuery`. Emit Zod with a separate output target set to `client: "zod"`. v8 notes: `httpClient` now defaults to `fetch`; mock config moved to a `generators` array (`mock: { generators: [{ type: "msw" }, { type: "faker" }] }`) and `mock: true` emits both MSW and Faker; non-GET query keys are namespaced by verb (`["POST", "/pets", body]`); Orval is ESM-only and needs Node 22.18+.

## openapi-typescript + openapi-fetch + openapi-react-query (REST, no generated hooks)

Generate types only, then infer everything at runtime. No per-operation hooks or service classes are generated.

```sh
# types only, no runtime emitted
npx openapi-typescript ./schema.yaml -o ./src/api/v1.d.ts
```

```ts
import createFetchClient from "openapi-fetch";
import createClient from "openapi-react-query";
import type { paths } from "./api/v1";

const fetchClient = createFetchClient<paths>({ baseUrl: "https://api.example.com/v1/" });
const $api = createClient(fetchClient); // wraps the fetch client, NOT <paths>

// Direct fetch: returns { data, error }, never throws on 4xx/5xx
const { data, error } = await fetchClient.GET("/pets/{petId}", { params: { path: { petId } } });

// As a hook (query key is [method, path, params])
const { data: pet } = $api.useQuery("get", "/pets/{petId}", { params: { path: { petId } } });
$api.useMutation("patch", "/pets").mutate({ body: { name: "Kitty" } });
```

Gotchas: the `<paths>` generic goes on `createFetchClient`, not on openapi-react-query's `createClient`. Results are a `{ data, error }` discriminated union, so narrow on which is present instead of using try/catch. `openapi-react-query` needs `@tanstack/react-query` v5 as a peer. The three packages version independently (fetch and react-query are still 0.x).

## graphql-codegen client preset (Apollo / urql)

```ts
// codegen.ts
import type { CodegenConfig } from "@graphql-codegen/cli";

const config: CodegenConfig = {
  schema: "https://api.example.com/graphql",
  documents: ["src/**/*.{ts,tsx}", "!src/gql/**/*"],
  ignoreNoDocuments: true,
  generates: {
    "./src/gql/": {
      preset: "client",
      config: { enumsAsTypes: true },
      presetConfig: { fragmentMasking: { unmaskFunctionName: "getFragmentData" } },
    },
  },
};
export default config;
```

For TanStack Query plus a custom fetch wrapper, add `config.documentMode: "string"` so the codegen emits `TypedDocumentString`.

> CRITICAL. `documentMode: "string"` paired with Apollo or urql types all results as `any`. Those clients want the AST default. Only use `"string"` with TanStack Query and a custom fetch wrapper. (Apollo also recommends `typescript-operations` + `typed-document-node` over this preset; see `graphql-codegen.md`.)

## gql.tada (zero-codegen, no build step)

```json
// tsconfig.json
{
  "compilerOptions": {
    "plugins": [{
      "name": "gql.tada/ts-plugin",
      "schema": "./schema.graphql",
      "tadaOutputLocation": "./src/graphql-env.d.ts"
    }]
  }
}
```

No codegen script; types update with TypeScript. On TypeScript 5.5+ the plugin bundles the LSP (`@0no-co/graphqlsp`); on older TS, install `@0no-co/graphqlsp` and name it in the plugin slot instead. The plugin powers editor diagnostics only, so inference still works at `tsc` time without it.

Create a schema-typed `graphql()` with `initGraphQLTada`, then read result and variable types:

```ts
import { initGraphQLTada } from "gql.tada";
import type { introspection } from "./graphql-env.d.ts";
export const graphql = initGraphQLTada<{ introspection: introspection }>();

import { ResultOf, VariablesOf } from "gql.tada";
const q = graphql(`query Pokemons($limit: Int!) { pokemons(limit: $limit) { id name } }`);
type Result = ResultOf<typeof q>;
```

Fragments pass their dependencies as the second array argument, colocate via `FragmentOf<typeof X>`, and unwrap with `readFragment()` (there is no `unmaskFragments`):

```ts
const PokemonFragment = graphql(`fragment Pokemon on Pokemon { id name ...Types }`, [TypesFragment]);
function Card(props: { data: FragmentOf<typeof PokemonFragment> }) {
  const p = readFragment(PokemonFragment, props.data);
}
```

CLI commands are hyphenated: `gql-tada generate-output`, `generate-schema`, `generate-persisted`, and `gql-tada turbo` for an ahead-of-time type cache (check it into the repo to speed up `tsc` on large schemas). Persisted queries use `graphql.persisted("ID", doc)` plus `gql-tada generate-persisted`.

## Fragment masking (component composition)

Each component declares its own data via a fragment. The prop type is `FragmentType<typeof XFragment>`, which is opaque: a parent cannot read fields it did not request. Only the owner unwraps it.

> The unwrap function is named `useFragment()` by default, but despite the `use` prefix it is NOT a React hook and does not follow the rules of hooks. Rename it to `getFragmentData()` via `unmaskFunctionName` (in the config above) so ESLint's rules-of-hooks does not raise false positives. The examples below use `getFragmentData()`.

```tsx
// Leaf
import { graphql, FragmentType, getFragmentData } from "../gql";

export const FilmCardFragment = graphql(`
  fragment FilmCard on Film { title releaseDate director }
`);

function FilmCard(props: { film: FragmentType<typeof FilmCardFragment> }) {
  const film = getFragmentData(FilmCardFragment, props.film);
  return <article><h3>{film.title}</h3><p>{film.director}</p></article>;
}
```

```tsx
// Mid-level
export const FilmListFragment = graphql(`
  fragment FilmList on FilmsConnection { totalCount films { id ...FilmCard } }
`);

function FilmList(props: { data: FragmentType<typeof FilmListFragment> }) {
  const conn = getFragmentData(FilmListFragment, props.data);
  return <ul>{conn.films?.map((f) => <li key={f?.id}><FilmCard film={f} /></li>)}</ul>;
}
```

```tsx
// Top-level
const AllFilmsQuery = graphql(`query AllFilms { allFilms { ...FilmList } }`);

function FilmsPage() {
  const { data, loading } = useQuery(AllFilmsQuery);
  if (loading) return <p>Loading...</p>;
  if (!data?.allFilms) return <p>No films</p>;
  return <FilmList data={data.allFilms} />;
}
```

| Layer | Fragment | Owns | Spreads |
| --- | --- | --- | --- |
| Page | `AllFilmsQuery` | nothing | `...FilmList` |
| List | `FilmListFragment` | `id`, `totalCount` | `...FilmCard` |
| Card | `FilmCardFragment` | `title`, `releaseDate`, `director` | nothing |

`FilmsPage` literally cannot read `film.title`; TypeScript enforces the boundary. Adding a field to `FilmCardFragment` updates only that component. In gql.tada the pattern is identical with `readFragment()` in place of `getFragmentData()`. Skip fragments for a single flat page that fetches and renders directly.

## More client-preset options

- **Exclude the generated dir from `documents`** (`"!src/gql/**/*"`), or codegen processes its own output and you hit circular dependencies. This is the most common client-preset setup bug.
- **Import the tag from the generated dir**: `import { graphql } from "./gql"`. Not from `graphql-tag` or a client library.
- **Persisted documents**: `presetConfig: { persistedDocuments: true }` emits a `persisted-documents.json` hash-to-document map for persisted or trusted queries; read a hash via `MyQuery["__meta__"]["hash"]`.
- **Testing masked data**: `makeFragmentData(data, FilmCardFragment)` builds a typed masked object so tests can pass fragment props without a real query.
- **Custom scalars**: `config: { scalars: { DateTime: "string" } }`; add `strictScalars: true` to fail the build on any unmapped scalar (default for unknowns is `unknown`).
- **`@defer`**: gate rendering on `isFragmentReady()` until the deferred fragment resolves.
- **Disable masking** entirely with `fragmentMasking: false` if a codebase does not want it.

## DX pitfalls

- **Stale ESLint types during `--watch`.** Codegen regeneration makes ESLint's TS program go stale, producing false `no-unsafe-*` errors. Switch ESLint to `parserOptions.projectService: true` (shares the editor language service) and turn off `@typescript-eslint/no-unsafe-{member-access,assignment,return,argument}`.
- **`graphql()` autocomplete.** The popular `graphql.vscode-graphql` extension does not autocomplete inside `graphql()` calls. Use the Apollo GraphQL extension (`apollographql.vscode-apollo`) with an `apollo.config.js` whose `tagName` is `graphql`; it works for any codegen setup.

## Avoid

`@graphql-codegen/typescript-react-apollo`, `@graphql-codegen/typescript-react-query`, and `openapi-typescript-codegen` hook generators. Deprecated or community-stale.

## Source

From [Typesafe API Code Generation for React in 2026](https://saschb2b.com/blog/typesafe-api-codegen-2026). The standalone **codegen-api** skill covers the same material if installed.
