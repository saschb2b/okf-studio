---
type: Library Notes
title: "date-fns"
description: "v4 adds first-class time-zone support for the first time via the `@date-fns/tz` package (a `TZDate` class and a `tz()` helper) and a new `in` context option that nearly every function accepts."
tags: [javascript, dates]
timestamp: 2026-06-04T00:00:00Z
---
# date-fns

**Verified 2026-06-04.** Check the installed `date-fns` version first; re-verify if newer than below.

**Current stable**: v4 (Sep 2024), with `@date-fns/tz` for time zones. **LLM default bias**: v1 and v2 patterns. Deep submodule imports like `import addDays from 'date-fns/addDays'`, and the assumption that date-fns has no built-in time-zone support.

## The shift
v4 adds first-class time-zone support for the first time via the `@date-fns/tz` package (a `TZDate` class and a `tz()` helper) and a new `in` context option that nearly every function accepts. The library is ESM-first, with named tree-shakable imports as the standard.

## Stop / Start
| Stop (date-fns v1 to v3 habits) | Start (date-fns v4) |
| --- | --- |
| `import addDays from 'date-fns/addDays'` (deep default) | `import { addDays } from 'date-fns'` (named, tree-shaken) |
| The separate `date-fns-tz` add-on for zones | `@date-fns/tz` with `TZDate` and `tz()` |
| Passing a plain `Date` and hoping offsets are right | `addHours(date, 5, { in: tz('Asia/Singapore') })` |
| `utcToZonedTime` / `zonedTimeToUtc` (old API) | `TZDate` instances that carry their zone through arithmetic |
| CommonJS-only consumption | ESM-first (CJS still available) |

## Gotchas
- `@date-fns/tz` is a separate install. `TZDate` is tiny but you opt in per package.
- v3 to v4 is a light major (mostly TypeScript generics); most app code upgrades cleanly.
- Do not mix the legacy `date-fns-tz` package with the new `@date-fns/tz` model.

## Companion
For new code on modern runtimes, prefer native [temporal.md](./temporal.md); date-fns is the lightweight interim.

## Sources
- https://blog.date-fns.org/v40-with-time-zone-support/
- https://github.com/date-fns/date-fns/releases/tag/v4.0.0
