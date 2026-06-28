---
type: Library Notes
title: "Angular"
description: "Angular is signal-first and zoneless."
tags: [javascript, frameworks]
timestamp: 2026-06-05T00:00:00Z
---
# Angular

**Verified 2026-06-05.** Check the installed `@angular/core` version first; re-verify if newer than below.

**Current stable**: 22 (Jun 2026). **LLM default bias**: Angular 2 through 16. NgModules everywhere, Zone.js, `*ngIf`/`*ngFor`, RxJS for everything, constructor injection.

## The shift
Angular is signal-first and zoneless. Signals are the primary reactivity primitive, standalone components are the default (no NgModules), built-in control flow (`@if`/`@for`/`@switch`/`@let`) replaces structural directives, and zoneless change detection is the default from v21. From v22, OnPush is the default change detection strategy: a component with an undefined `changeDetection` is `OnPush`, not eager. As of v22 the resource APIs (`resource`, `rxResource`, `httpResource`) and Signal Forms (`@angular/forms/signals`) are stable.

## Stop / Start
| Stop (LLM default) | Start (current Angular) |
| --- | --- |
| `NgModule` + `declarations` | Standalone components (default since v17; no `standalone: true` needed from v19) |
| `*ngIf` / `*ngFor` / `*ngSwitch` | `@if` / `@for` (with `track`) / `@switch` |
| Zone.js change detection | `provideZonelessChangeDetection()` (default from v21) |
| `@Input()` / `@Output()` decorators | `input()` / `output()` / `model()` signal functions |
| `@ViewChild` / `@ContentChild` decorators | `viewChild()` / `contentChild()` signal queries |
| Constructor injection | `inject()` |
| `BehaviorSubject` for local component state | `signal()` / `computed()` / `effect()` |
| `HttpClient` + manual subscribe for reads | `httpResource()` / `rxResource()` / `resource()` |
| Explicit `changeDetection: ChangeDetectionStrategy.OnPush` opt-in; `ChangeDetectionStrategy.Default` | OnPush is the default from v22 (omit it); `Default` is deprecated, use `ChangeDetectionStrategy.Eager` to opt back into eager checking |

## Gotchas
- Migrate with `ng update` plus the official schematics (control-flow, standalone, signal inputs, inject), not by hand.
- `@for` requires a `track` expression. Omitting it is an error, unlike `*ngFor`'s optional `trackBy`.
- Zoneless needs OnPush-correct or signal-driven components. Not all third-party libraries are zoneless-ready yet.
- The zoneless provider is `provideZonelessChangeDetection()`; the old `provideExperimentalZonelessChangeDetection()` name is gone. New v22 projects are zoneless by default and do not need the provider in bootstrap. Add it only when migrating an existing zone-based app, not to fresh projects.
- OnPush is the default from v22, so do not add `changeDetection: ChangeDetectionStrategy.OnPush` to new components; it is the baseline. `ChangeDetectionStrategy.Default` is deprecated, renamed `Eager`, which is the explicit opt-out for eager checking.
- Resource imports differ: `resource` from `@angular/core`, `rxResource` from `@angular/core/rxjs-interop` (a `stream:` factory, not `loader:`), `httpResource` from `@angular/common/http`.

## Companion
**Official agent skills.** Angular publishes its own agent skills, `angular-developer` (code and architecture) and `angular-new-app` (CLI scaffold), at github.com/angular/skills, installable via the same installer: `npx skills add https://github.com/angular/skills`. For Angular work, prefer the framework's own skill as the authoritative, maintained source; this file is the cross-ecosystem summary that points to it.

**Angular CLI MCP server.** The CLI ships an experimental MCP server that connects AI agents to Angular tooling: `search_documentation`, `find_examples`, `get_best_practices`, an `onpush_zoneless_migration` planner, `list_projects`, and (opt-in) `build`/`test`/`modernize`. Set it up with `ng mcp`, which prints the per-editor config; the server itself runs via `npx -y @angular/cli mcp`. It ships inside `@angular/cli`, not a separate `@angular/mcp` package.

Angular ecosystem entries in this skill: Material and CDK in [../ui/angular-material.md](../ui/angular-material.md), state in [../data/ngrx.md](../data/ngrx.md), the Vite meta-framework in [../meta-frameworks/analog.md](../meta-frameworks/analog.md), i18n in [../i18n/transloco.md](../i18n/transloco.md), and testing in [../testing/angular-testing.md](../testing/angular-testing.md). Lint with `angular-eslint` (see [../tooling/eslint.md](../tooling/eslint.md)).

## Sources
- https://angular.dev/reference/releases
- https://angular.dev/guide/signals
- https://github.com/angular/angular/releases
- https://angular.dev/ai/mcp
