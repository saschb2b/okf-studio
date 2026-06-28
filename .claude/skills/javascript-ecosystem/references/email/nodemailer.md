---
type: Library Notes
title: "Nodemailer"
description: "Nodemailer is still the canonical lower-level SMTP and transport library; the role is unchanged, but majors 7 and 8 broke on the edges."
tags: [javascript, email]
timestamp: 2026-06-04T00:00:00Z
---
# Nodemailer

**Verified 2026-06-04.** Check the installed `nodemailer` version first; re-verify if newer than below.

**Current stable**: 8.0 (v8.0 landed Feb 2026). **LLM default bias**: Nodemailer 6.x. `createTransport({ service: "gmail", auth: { user, pass } })`, the old SES v2/v3 SDK transport, and the error code `'NoAuth'`.

## The shift
Nodemailer is still the canonical lower-level SMTP and transport library; the role is unchanged, but majors 7 and 8 broke on the edges. v7 moved AWS SES to the SESv2 SDK and removed the older SES transports and rate-limiting helpers. v8 renamed the auth error code `'NoAuth'` to `'ENOAUTH'` and hardened TLS, DNS, and stream handling.

## Stop / Start
| Stop (Nodemailer 6) | Start (Nodemailer 8) |
| --- | --- |
| `nodemailer@^6` in `package.json` | `nodemailer@^8` (verify the Node runtime is current) |
| Catching `err.code === 'NoAuth'` | Catching `err.code === 'ENOAUTH'` |
| The legacy SES v2/v3 SDK transport | The SESv2-based SES transport (or an API provider) |
| Relying on Nodemailer's built-in SES rate-limiting | Handle throttling yourself or at the provider (removed in v7) |
| Hand-writing raw HTML strings inline | Render with React Email (`await render(<Email/>)`) and pass as the `html` field |

## Gotchas
- The `'NoAuth'` to `'ENOAUTH'` rename in v8 silently breaks error-handling switch statements; grep for it.
- If you used Nodemailer's SES integration, the v7 SESv2 migration requires code changes.
- Nodemailer sends but does not template; pair it with React Email's awaited `render()` output.

## Companion
Author templates with [react-email.md](./react-email.md).

## Sources
- https://github.com/nodemailer/nodemailer/blob/master/CHANGELOG.md
- https://www.npmjs.com/package/nodemailer
