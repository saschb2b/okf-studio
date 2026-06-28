---
type: Library Notes
title: "React Email"
description: "As of v6 everything is unified into the single `react-email` package, so you no longer install or import `@react-email/components` separately, and `render()` is async (returns a `Promise<string>`)."
tags: [javascript, email]
timestamp: 2026-06-04T00:00:00Z
---
# React Email

**Verified 2026-06-04.** Check the installed `react-email` version first; re-verify if newer than below.

**Current stable**: 6.x (the v6 line landed Apr 2026). **LLM default bias**: React Email 1.x/2.x with split packages (`@react-email/components` + `@react-email/render` installed separately) and a synchronous `render(<Email/>)`.

## The shift
As of v6 everything is unified into the single `react-email` package, so you no longer install or import `@react-email/components` separately, and `render()` is async (returns a `Promise<string>`). You author transactional emails as React components and render them to provider-agnostic HTML.

## Stop / Start
| Stop (React Email 1.x/2.x) | Start (React Email 6) |
| --- | --- |
| `npm i @react-email/components @react-email/render` | `npm i react-email` (single package) |
| `import { Button } from "@react-email/components"` | `import { Button } from "react-email"` |
| `import { render } from "@react-email/render"` | `import { render } from "react-email"` |
| Synchronous `const html = render(<Email/>)` | `const html = await render(<Email/>)` |
| Hand-rolling a preview server | The bundled dev preview and `@react-email/editor` |

## Gotchas
- Because `render()` is async, any inline `transport.sendMail({ html: render(...) })` now sends `[object Promise]`. Await it first.
- The old per-component packages still exist but are legacy; find-and-replace imports to `react-email`.
- Output is a plain HTML string; it does not send anything. Pair it with Resend, Nodemailer, or SES.

## Companion
Sending via [resend.md](./resend.md) or raw SMTP via [nodemailer.md](./nodemailer.md).

## Sources
- https://react.email/docs/changelog
- https://resend.com/blog/react-email-6
