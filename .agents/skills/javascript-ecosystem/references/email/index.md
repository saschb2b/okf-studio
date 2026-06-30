# Transactional email

- [Nodemailer](nodemailer.md) - Nodemailer is still the canonical lower-level SMTP and transport library; the role is unchanged, but majors 7 and 8 broke on the edges.
- [React Email](react-email.md) - As of v6 everything is unified into the single `react-email` package, so you no longer install or import `@react-email/components` separately, and `render()` is async (returns a `Promise<string>`).
- [Resend](resend.md) - Resend is API-first: you send with an API key via `resend.emails.send()` and can pass a React Email component straight to the `react` field instead of pre-rendering HTML.
