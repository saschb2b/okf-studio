---
type: Library Notes
title: "i18next (with react-i18next)"
description: "i18next is now TypeScript-first."
tags: [javascript, i18n]
timestamp: 2026-06-04T00:00:00Z
---
# i18next (with react-i18next)

**Verified 2026-06-04.** Check the installed `i18next` and `react-i18next` versions first; re-verify if newer than below.

**Current stable**: i18next 26.x, react-i18next 17.x. **LLM default bias**: i18next v19 to v21 and react-i18next v11 to v13. Untyped string keys, the `withTranslation` HOC, custom `interpolation.format` callbacks, and TypeScript as an afterthought.

## The shift
i18next is now TypeScript-first. Module augmentation gives compile-time key validation, a Selector API (`t($ => $.key)`) gives autocomplete and IDE speed on large catalogs, and the Formatter API replaced the old `interpolation.format` (removed in v26). react-i18next is hooks-first and inherits the typed keys.

## Stop / Start
| Stop (LLM default) | Start (current) |
| --- | --- |
| Plain untyped string keys | Module augmentation (`declare module 'i18next'` with `CustomTypeOptions`) |
| `withTranslation()` HOC / `NamespacesConsumer` | The `useTranslation()` hook |
| `t('deeply.nested.key')` as the only option on huge catalogs | The Selector API `t($ => $.deeply.nested.key)` |
| Custom `interpolation: { format }` | `i18next.services.formatter.add(...)` (old format removed in v26) |
| Mixing arbitrary majors | Pair react-i18next 17.x with i18next 26.x |
| Assuming an Intl polyfill fallback | Native `Intl` (mandatory since v24) |

## Gotchas
- The Selector API is opt-in and changes call syntax; use the codemod for large codebases.
- v26 is a hard cutover for custom formatting; leftover `interpolation.format` breaks at runtime.
- Type safety lives in i18next's `CustomTypeOptions`, not react-i18next; configure it once and both inherit it.

## Companion
For Next.js App Router server components, teams often prefer [next-intl.md](./next-intl.md).

## Sources
- https://www.i18next.com/overview/typescript
- https://www.i18next.com/misc/migration-guide
