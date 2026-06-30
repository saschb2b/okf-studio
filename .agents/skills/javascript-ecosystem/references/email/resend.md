---
type: Library Notes
title: "Resend"
description: "Resend is API-first: you send with an API key via `resend.emails.send()` and can pass a React Email component straight to the `react` field instead of pre-rendering HTML."
tags: [javascript, email]
timestamp: 2026-06-04T00:00:00Z
---
# Resend

**Verified 2026-06-04.** Check the installed `resend` version first; re-verify if newer than below.

**Current stable**: 6.x (6.12). **LLM default bias**: an SMTP-first mental model and older `resend` SDKs. Reaching for Nodemailer plus SMTP credentials, omitting idempotency keys and batch send, and using `svix` for webhooks.

## The shift
Resend is API-first: you send with an API key via `resend.emails.send()` and can pass a React Email component straight to the `react` field instead of pre-rendering HTML. Modern usage adds idempotency keys, a `batch.send()` endpoint, and webhook verification that moved from `svix` to `standardwebhooks`.

## Stop / Start
| Stop (LLM default) | Start (current Resend) |
| --- | --- |
| Configuring SMTP host/port/user/pass | `new Resend(process.env.RESEND_API_KEY)` and the HTTPS API |
| Pre-rendering to HTML then passing `html:` | `resend.emails.send({ react: <EmailTemplate .../> })` |
| Looping `emails.send()` for bulk | `resend.batch.send([...])` (up to 100 in one call) |
| App-side dedupe and risking double sends on retry | Pass `{ idempotencyKey }` to `emails.send` / `batch.send` |
| `import { Webhook } from "svix"` to verify events | Verify with `standardwebhooks` (the dependency the SDK now ships) |

## Gotchas
- The batch endpoint does not support `attachments` or `scheduled_at`; use individual `emails.send()` for those.
- Idempotency keys live only 24 hours; design retry windows around that, with distinct keys per batch chunk.
- 6.12.4 replaced `svix` with `standardwebhooks`; update any transitive `svix` verification path.

## Companion
Author templates with [react-email.md](./react-email.md).

## Sources
- https://resend.com/docs/api-reference/emails/send-email
- https://github.com/resend/resend-node
