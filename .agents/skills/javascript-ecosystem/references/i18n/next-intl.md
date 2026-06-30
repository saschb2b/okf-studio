---
type: Library Notes
title: "next-intl"
description: "next-intl is App Router native with strict typing."
tags: [javascript, i18n]
timestamp: 2026-06-04T00:00:00Z
---
# next-intl

**Verified 2026-06-04.** Check the installed `next-intl` version first; re-verify if newer than below.

**Current stable**: 4.x (4.13), compatible with Next.js 16. **LLM default bias**: v2 to v3. Pages Router patterns, `NextIntlProvider`, and pre-`getRequestConfig` setups that predate the App Router and server-component model.

## The shift
next-intl is App Router native with strict typing. v4 centralizes type registration under one `AppConfig` interface (typed `Locale`, typed messages), is ESM-only, and adds ahead-of-time message precompilation. Static rendering requires priming the locale with `setRequestLocale`.

## Stop / Start
| Stop (next-intl v2 to v3) | Start (next-intl v4) |
| --- | --- |
| Pages Router `NextIntlProvider` + `_app.js` | App Router `[locale]` segment + `NextIntlClientProvider` in the root layout |
| A single `useTranslations` everywhere | `useTranslations()` in Client Components, async `getTranslations()` in Server Components |
| Ignoring static rendering | `setRequestLocale(locale)` plus `generateStaticParams` for locales |
| Scattered global type declarations | One `AppConfig` augmentation; `hasLocale()` to narrow strings |
| Hand-rolled locale routing | `defineRouting` in `routing.ts` via `createNextIntlPlugin()` |

## Gotchas
- v4 raised floors: TypeScript 5+, ESM-only output.
- The locale cookie is now session-only and set only when a user switches away from the `accept-language` match.
- `getRequestConfig()` must now return a `locale`.

## Companion
Next.js paradigm notes in [../meta-frameworks/nextjs.md](../meta-frameworks/nextjs.md).

## Sources
- https://next-intl.dev/blog/next-intl-4-0
- https://next-intl.dev/docs/getting-started/app-router
