---
type: Library Notes
title: "Day.js"
description: "Day.js is the roughly 2 KB, immutable, Moment.js-API-compatible drop-in."
tags: [javascript, dates]
timestamp: 2026-06-04T00:00:00Z
---
# Day.js

**Verified 2026-06-04.** Check the installed `dayjs` version first; re-verify if newer than below.

**Current stable**: 1.11.x. **LLM default bias**: Moment.js idioms and mutable-object thinking carried over from Moment, plus forgetting that Day.js is immutable and plugin-gated.

## The shift
Day.js is the roughly 2 KB, immutable, Moment.js-API-compatible drop-in. Same chainable API surface, but every mutating-looking call returns a new instance, and advanced features (time zone, UTC, custom parse, relative time) are opt-in plugins rather than bundled.

## Stop / Start
| Stop (LLM default) | Start (current) |
| --- | --- |
| `moment()` and Moment imports for new code | `dayjs()` (same API shape, ~2 KB, maintained) |
| Treating instances as mutable | Immutable usage; reassign the returned value (`const next = d.add(1, 'day')`) |
| Assuming UTC, time zone, custom-parse work out of the box | `dayjs.extend(utc)`, `dayjs.extend(timezone)`, `dayjs.extend(customParseFormat)` first |
| `dayjs().tz('America/New_York')` without setup | Load `utc` then `timezone` plugins first (timezone depends on utc) |
| Shipping all of Moment's locale and feature weight | Core plus only the plugins you need |

## Gotchas
- The plugin model is the number-one migration trap: a missing `.extend()` throws or silently no-ops on `.tz()`, `.utc()`, custom formats, and relative time.
- Immutability differs from Moment; code that relied on in-place mutation breaks.
- Day.js leans on the host `Intl`/`Date`, so it is not Temporal-grade for zone and calendar correctness. Treat it as a light formatter, not a full Temporal replacement.

## Companion
For zone-correct new code on modern runtimes, prefer native [temporal.md](./temporal.md).

## Sources
- https://day.js.org/
- https://github.com/iamkun/dayjs
