---
type: Library Notes
title: "Express"
description: "Express 5 finally shipped after a long gestation, focused on stability and security rather than features."
tags: [javascript, backend]
timestamp: 2026-06-05T00:00:00Z
---
# Express

**Verified 2026-06-05.** Check the installed `express` version first; re-verify if newer than below.

**Current stable**: 5.1 (Mar 2025). **LLM default bias**: Express 4.x. It was the only stable major for roughly a decade, so corpora are saturated with v4 idioms.

## The shift
Express 5 finally shipped after a long gestation, focused on stability and security rather than features. The biggest practical change is that rejected promises from `async` handlers now propagate to the error handler automatically, and routing moved to `path-to-regexp@8`.

## Stop / Start
| Stop (Express 4) | Start (Express 5) |
| --- | --- |
| `try/catch` + `next(err)` in every async handler | `return`/`throw` in `async` handlers; rejections auto-forward |
| Wildcard route `app.get('*', ...)` | Named splat `app.get('/*splat', ...)` |
| Optional param `/user/:id?` | Brace syntax `/user{/:id}` (slash inside the braces) |
| `res.send(status)` and `app.del(...)` | `res.sendStatus(status)` and `app.delete(...)` |
| `req.param(name)` | Read `req.params` / `req.body` / `req.query` directly |
| Assuming `express@latest` is v4 | `npm i express` now pulls v5; pin `express@4` for legacy |

## Gotchas
- Run `npx codemod@latest @expressjs/v5-migration-recipe` for the codemods, but the new path-matching syntax needs manual review.
- An unmatched optional param is now omitted from `req.params` entirely (v4 set it to `undefined`).
- Express 5 requires Node 18+.
- Express 4 is still in maintenance into late 2026, so do not assume a recent codebase is v5. Check the version.

## Sources
- https://expressjs.com/en/blog/2024-10-15-v5-release
- https://expressjs.com/en/guide/migrating-5.html
