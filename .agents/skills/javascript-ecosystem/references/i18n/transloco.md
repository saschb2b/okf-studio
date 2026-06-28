---
type: Library Notes
title: "Transloco (Angular i18n)"
description: "Transloco is Angular's runtime i18n library, with live language switching, lazy scopes, and a signal-based API."
tags: [javascript, i18n]
timestamp: 2026-06-05T00:00:00Z
---
# Transloco (Angular i18n)

**Verified 2026-06-05.** Check the installed `@jsverse/transloco` version first; re-verify if newer than below.

**Current stable**: 8.x under `@jsverse/transloco`. **LLM default bias**: the old `@ngneat/transloco` package (frozen at 6.x), NgModule `TranslocoModule.forRoot` setup, and confusing it with `@angular/localize`.

## The shift
Transloco is Angular's runtime i18n library, with live language switching, lazy scopes, and a signal-based API. It moved scope from `@ngneat` to `@jsverse`, and setup is the standalone `provideTransloco({ config, loader })`.

## Stop / Start
| Stop (LLM default) | Start (current Transloco) |
| --- | --- |
| `@ngneat/transloco` (deprecated, frozen at 6.0.4) | `@jsverse/transloco` (8.x) |
| `TranslocoModule.forRoot(...)` NgModule | `provideTransloco({ config, loader })` standalone provider |
| Hand-wiring the HTTP loader | `ng add @jsverse/transloco` (and `provideHttpClient()` for the loader) |
| Confusing it with `@angular/localize` | Transloco is runtime JSON with live switching; `@angular/localize` is compile-time |

## Template usage
```html
<ng-container *transloco="let t">{{ t('hello') }}</ng-container>
<!-- or --> {{ 'hello' | transloco }}
```

## Choosing
- `@angular/localize`: built-in, compile-time (`i18n` attribute, `$localize`), one bundle per locale. Best for SEO and zero runtime overhead, with no live switching.
- `ngx-translate`: the older runtime library, still maintained; prefer Transloco for new runtime i18n.

## Companion
The framework in [../frameworks/angular.md](../frameworks/angular.md).

## Sources
- https://jsverse.gitbook.io/transloco
- https://github.com/jsverse/transloco
