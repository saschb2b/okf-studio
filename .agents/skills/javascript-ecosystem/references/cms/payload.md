---
type: Library Notes
title: "Payload CMS"
description: "Payload 3 is a full rewrite that runs inside a Next.js App Router app rather than as a separate Express server."
tags: [javascript, cms]
timestamp: 2026-06-04T00:00:00Z
---
# Payload CMS

**Verified 2026-06-04.** Check the installed `payload` version first; re-verify if newer than below.

**Current stable**: 3.x (3.85). **LLM default bias**: Payload 2.x and 1.x. A standalone Express server with its own `server.ts` started via `payload.init()`, MongoDB-only, and a webpack-bundled admin on a separate Express app.

## The shift
Payload 3 is a full rewrite that runs inside a Next.js App Router app rather than as a separate Express server. You install it into an existing Next.js project, it serves the admin from `/admin`, and it ships React Server Components, native Postgres/SQLite (via Drizzle) alongside MongoDB, and serverless deployability. Config stays code-first and TypeScript-native.

## Stop / Start
| Stop (Payload 1.x/2.x) | Start (Payload 3) |
| --- | --- |
| A standalone Express server with `server.ts` + `payload.init()` | Install into a Next.js app; admin served from `/admin` |
| Webpack admin bundling | The Next.js App Router build with React Server Components |
| Assuming MongoDB/Mongoose is the only adapter | A DB adapter (`@payloadcms/db-mongodb`/`db-postgres`/`db-sqlite`) |
| Old `buildConfig` server-only assumptions | A v3 `payload.config.ts` wired via `withPayload` in `next.config` |
| `import payload` as a boot-time global singleton | `getPayload({ config })` inside route handlers and RSCs |
| Deploying the backend separately | Deploy as part of the Next.js app |

## Gotchas
- v2 to v3 is a migration, not a drop-in: the project moves under `app/(payload)`, and you need `withPayload` plus a configured DB adapter.
- Postgres/SQLite use Drizzle and require generated migrations; no schemaless Mongo flexibility there.
- Payload 4 is in beta (admin redesign); stay on 3.x for production.

## Companion
Next.js paradigm notes in [../meta-frameworks/nextjs.md](../meta-frameworks/nextjs.md).

## Sources
- https://payloadcms.com/docs/getting-started/what-is-payload
- https://github.com/payloadcms/payload/releases
