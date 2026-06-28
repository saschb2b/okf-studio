---
type: Library Notes
title: "Package managers (pnpm / npm / Bun)"
description: "pnpm went security-by-default in v10: no implicit pre/post-install scripts, plus a `minimumReleaseAge` cooldown to dodge zero-day supply-chain attacks."
tags: [javascript, tooling]
timestamp: 2026-06-04T00:00:00Z
---
# Package managers (pnpm / npm / Bun)

**Verified 2026-06-04.** Check the lockfile and `packageManager` field to see which one the project uses; re-verify if newer than below.

**Current stable**: pnpm 11.x; npm 11 (bundled with Node 24); Bun 1.3.x. **LLM default bias**: pnpm 8/9 with implicit lifecycle-script trust, and Bun framed as "just a fast runtime" rather than a production package manager and test runner.

## The shift
pnpm went security-by-default in v10: no implicit pre/post-install scripts, plus a `minimumReleaseAge` cooldown to dodge zero-day supply-chain attacks. Bun matured into a full toolchain (runtime, package manager, bundler, test runner, shell) with built-in database and S3 clients and a text lockfile.

## Stop / Start
| Stop (LLM default) | Start (current) |
| --- | --- |
| Assuming postinstall scripts "just run" under pnpm | Allow-list them via `onlyBuiltDependencies` / `pnpm approve-builds` |
| Bun as an experimental runtime only | Bun as a drop-in package manager (`bun install`) and test runner (`bun test`) |
| Reaching for Jest or Vitest reflexively in Bun projects | Built-in `bun test` (Jest-compatible API) |
| `npm i -g pnpm` and version drift | Corepack and the `packageManager` field |
| A separate Postgres or Redis driver in Bun apps | Bun's built-in `Bun.sql` and Redis clients where applicable |

## Gotchas
- pnpm's blocked install scripts can silently break native-module packages until you approve them; a fresh repo may need `pnpm approve-builds`.
- `minimumReleaseAge` can delay legitimately urgent patches; tune it deliberately.
- Bun's lockfile is text (`bun.lock`), not the old binary `bun.lockb`. Bun on Windows still has rougher edges than macOS or Linux.

## Sources
- https://pnpm.io/blog/releases/11.0
- https://bun.com/blog
