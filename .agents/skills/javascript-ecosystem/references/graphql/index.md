# GraphQL clients

- [Apollo Client (React)](apollo-client.md) - v4 splits React out of the core, so hooks import from `@apollo/client/react` and the core is framework-agnostic.
- [graphql-request](graphql-request.md) - graphql-request remains the minimal, fetch-based, dependency-light client for scripts and simple apps (no cache, no React integration).
- [urql](urql.md) - urql stays a lightweight, exchange-based client: behavior is composed from middleware-like exchanges, with document caching by default and opt-in normalized caching via `@urql/exchange-graphcache`.
