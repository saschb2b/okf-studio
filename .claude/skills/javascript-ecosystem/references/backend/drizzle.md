---
type: Library Notes
title: "Drizzle ORM"
description: "v1 (RC) introduces Relational Queries v2 (a rewritten `db.query` and relations format), an opt-in JIT-compiled row mapper, validator integrations collapsed into `drizzle-orm` subpaths, and a..."
tags: [javascript, backend]
timestamp: 2026-06-05T00:00:00Z
---
# Drizzle ORM

**Verified 2026-06-05.** Check the installed `drizzle-orm` version first; re-verify if newer than below.

**Current stable**: 0.45.x on `latest`; 1.0 is in RC (May 2026), not yet GA. **LLM default bias**: 0.2x to 0.3x, the RQB v1 relational API, the `_journal.json` migration layout, and separate `drizzle-zod`/`drizzle-valibot` packages.

## The shift
v1 (RC) introduces Relational Queries v2 (a rewritten `db.query` and relations format), an opt-in JIT-compiled row mapper, validator integrations collapsed into `drizzle-orm` subpaths, and a journal-free migration layout. The default install is still 0.45 (0.x); v1 must be requested explicitly.

## Stop / Start
| Stop (LLM default) | Start (current Drizzle) |
| --- | --- |
| Separate `drizzle-zod` / `drizzle-valibot` / `drizzle-typebox` packages | Import from `drizzle-orm/zod`, `drizzle-orm/valibot`, etc. |
| Per-table `relations(t, ({ one, many }) => ...)` with `fields`/`references` | One central `defineRelations(schema, (r) => ...)` with `from`/`to`; pass `{ relations }` (not `{ schema }`) to `drizzle()` |
| Relying on `_journal.json` in the migrations folder | The journal-free format (`drizzle-kit up` to convert) |
| `drizzle-kit drop` | The new migration flow (`drop` removed in v1) |
| "Drizzle never reached 1.0" | Track 1.0 (RC; install with `drizzle-orm@rc`) |

## Gotchas
- `npm i drizzle-orm` still installs 0.45 (0.x), not v1. Request `@rc` or `@beta` to trial v1; do not claim v1 is the default.
- v1 adds MSSQL support across `drizzle-orm`, `drizzle-kit`, and `drizzle-seed`.
- RQB v2 is the biggest behavioral break; read the relations and query migration guides rather than assuming a drop-in.
- RQB v2 many-to-many uses `.through()` on the `from`/`to` columns; the legacy `relations()` helper moved to `drizzle-orm/_relations`.

## Sources
- https://orm.drizzle.team/docs/upgrade-v1
- https://orm.drizzle.team/roadmap
