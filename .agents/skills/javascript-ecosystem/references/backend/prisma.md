---
type: Library Notes
title: "Prisma ORM"
description: "v7 removes the Rust query engine."
tags: [javascript, backend]
timestamp: 2026-06-05T00:00:00Z
---
# Prisma ORM

**Verified 2026-06-05.** Check the installed `prisma` and `@prisma/client` versions first; re-verify if newer than below.

**Current stable**: 7.x (7.8); the 7.0 line opened Nov 2025. **LLM default bias**: Prisma 4/5/6 with the `prisma-client-js` generator, the Rust query engine, the client generated into `node_modules`, `url` in the datasource, and the `$use()` middleware API.

## The shift
v7 removes the Rust query engine. The client is now a pure-TypeScript, ESM, Rust-free runtime (much smaller bundles, faster queries). It is also config-first and explicit: a driver adapter is required for every database, generated code lives in your source tree, and connection config moves to `prisma.config.ts`. Schema-first authoring (PSL plus `prisma generate`) is unchanged.

## Stop / Start
| Stop (Prisma 4 to 6) | Start (Prisma 7) |
| --- | --- |
| `generator client { provider = "prisma-client-js" }` | `provider = "prisma-client"` with a required `output = "./generated/prisma"` |
| `import { PrismaClient } from "@prisma/client"` | Import from the generated output path |
| `new PrismaClient()` with `url` in the datasource | A driver adapter passed to `new PrismaClient({ adapter })` |
| `url`/`directUrl` in `schema.prisma` | `prisma.config.ts` at the project root |
| CommonJS assumptions | ESM (`"type": "module"`, `moduleResolution: "bundler"`) |
| `prisma.$use()` middleware | Client Extensions (`$extends`) |

## Gotchas
- Driver adapters are required in v7, not preview. Pass exactly one of `adapter` (direct connection) or `accelerateUrl` (Accelerate); forgetting both yields the "engine type 'client' requires either 'adapter' or 'accelerateUrl'" error.
- Env vars are no longer auto-loaded. Add `import "dotenv/config"` in `prisma.config.ts`, whose helpers come from `prisma/config` (`defineConfig`, `env`). The `datasource` block keeps only `provider`; the URL lives in `datasource.url` in the config.
- `prisma generate` and `prisma db seed` are explicit now (the `--skip-generate`/`--skip-seed` flags were removed).
- Default connection-pool and timeout behavior differs from v6; review pool settings after upgrade.

## Agent skills
Prisma publishes official agent skills (`npx skills add prisma/skills`), AI prompts (prisma.io/docs/ai), and an MCP server. For Prisma work, prefer the official skill.

## Sources
- https://www.prisma.io/blog/announcing-prisma-orm-7-0-0
- https://www.prisma.io/docs/guides/upgrade-prisma-orm/v7
