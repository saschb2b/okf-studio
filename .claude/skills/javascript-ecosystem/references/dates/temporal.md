---
type: Library Notes
title: "Temporal (TC39)"
description: "Temporal is a finished standard that replaces the broken `Date`."
tags: [javascript, dates]
timestamp: 2026-06-04T00:00:00Z
---
# Temporal (TC39)

**Verified 2026-06-04.** Check runtime support and whether the project uses a polyfill; re-verify status if newer than below.

**Current status**: Stage 4 / finished, part of ECMAScript 2026. Native in Firefox 139, Chrome 144 (V8), and Node 26; Safari has it in Technology Preview only. Polyfill via `temporal-polyfill` or `@js-temporal/polyfill`. **LLM default bias**: no native Temporal at all. The legacy `Date` plus Moment/Luxon/date-fns workarounds, and the stale "Temporal is Stage 3, not shippable" framing.

## The shift
Temporal is a finished standard that replaces the broken `Date`. It adds immutable, purpose-specific types (`PlainDate`, `PlainTime`, `PlainDateTime`, `ZonedDateTime`, `Instant`, `Duration`) with first-class IANA time-zone and calendar support, deterministic arithmetic, and no month-zero or mutation footguns.

## Stop / Start
| Stop (legacy Date) | Start (Temporal) |
| --- | --- |
| `new Date()` for the current time | `Temporal.Now.zonedDateTimeISO()` (or `.instant()`, `.plainDateISO()`) |
| Zero-indexed months (`new Date(2026, 5)` for June) | 1-indexed `Temporal.PlainDate.from({ year: 2026, month: 6, day: 4 })` |
| Mutating in place (`d.setDate(d.getDate()+1)`) | Immutable `pd.add({ days: 1 })` |
| DST and time-zone offset math on `Date` | `Temporal.ZonedDateTime` with a real IANA `timeZone` |
| Ad hoc duration math in milliseconds | `Temporal.Duration` plus `.since()` / `.until()` / `.round()` |
| Reaching for Moment or Luxon just for parsing and zones | Native `Temporal` (with a polyfill where Safari or old targets matter) |

## Gotchas
- Safari stable lacks it (about 69% coverage), so production front ends should still ship a polyfill or feature-detect.
- `@js-temporal/polyfill` is alpha and large; `temporal-polyfill` is a smaller, more current alternative.
- `Temporal.Instant` (exact time) versus `PlainDateTime` (wall-clock, no zone) is a real distinction; converting requires an explicit time zone.

## Sources
- https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal
- https://github.com/tc39/proposal-temporal
