# API code generation

- [GraphQL Code Generator (client preset)](graphql-codegen.md) - The client preset is the official recommended path.
- [Hey API (REST / OpenAPI)](hey-api.md) - Hey API generates a framework-agnostic SDK (typed functions over a configurable `fetch`/`axios`/`next` client), and a plugin layer composes on top.
- [openapi-typescript + openapi-fetch + openapi-react-query](openapi-fetch.md) - Codegen produces only types; runtime safety comes from inference.
- [Orval (REST / OpenAPI)](orval.md) - Orval still defaults to generating named hooks, but it is now configurable: you can suppress hooks (`useQuery: false`) and emit `queryOptions` instead, choose the HTTP layer via `httpClient`...
- [API codegen setup (full teachable reference)](setup.md) - Self-contained setup for the api-codegen tools, so this skill teaches the whole workflow without any other skill installed.
