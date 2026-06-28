---
type: Library Notes
title: "Angular Material + CDK"
description: "Standalone components are the default (import the component class directly, no `MatXModule`)."
tags: [javascript, ui]
timestamp: 2026-06-05T00:00:00Z
---
# Angular Material + CDK

**Verified 2026-06-05.** Check the installed `@angular/material` version first (it tracks the Angular major); re-verify if newer than below.

**Current stable**: v22 (tracks Angular 22). Packages `@angular/material` and `@angular/cdk`. **LLM default bias**: NgModule `MatXModule` imports, the old `mat.define-light-theme()` SCSS theming, `BrowserAnimationsModule`, and the removed legacy (pre-MDC) components.

## The shift
Standalone components are the default (import the component class directly, no `MatXModule`). Theming moved to Material 3 with the `mat.theme()` mixin, which emits system-level `--mat-sys-*` CSS variables. Animations are provided with `provideAnimationsAsync()`. Legacy non-MDC components were removed in v17; all components are MDC-based. `@angular/cdk` is the headless behavior toolkit Material is built on.

## Stop / Start
| Stop (LLM default) | Start (current Angular Material) |
| --- | --- |
| `imports: [MatButtonModule]` (NgModule) | `imports: [MatButton]` (standalone class) |
| `mat.define-light-theme()` + `@include mat.all-component-themes()` | `@include mat.theme((color, typography, density))` (M3, `--mat-sys-*` tokens) |
| `BrowserAnimationsModule` | `provideAnimationsAsync()` in `bootstrapApplication` |
| `@angular/material/legacy-*` components | MDC-based components (legacy removed in v17) |
| Overriding component CSS classes for colors | The validated `overrides` API (`mat.theme-overrides()`, `mat.<component>-overrides()`) |

## CDK and the landscape
- `@angular/cdk` is the unstyled, accessible toolkit: overlay, a11y, drag-drop, layout (BreakpointObserver), table, portal, virtual scrolling. Material is built on it; reach for it to build custom components.
- Alternatives: PrimeNG (Aura theme plus an unstyled mode), ng-zorro-antd (Ant Design), Taiga UI. For the shadcn-style approach, **Spartan** (`@spartan-ng/brain` headless primitives on CDK, plus a copy-in Tailwind-styled "helm").

## Gotchas
- `@angular/material` and `@angular/cdk` publish in lockstep with the Angular major; pin all three together.
- The v22 button is the unified `matButton="filled|tonal|outlined|elevated|text"` attribute (old `mat-raised-button` still works).

## Companion
Color-role usage in [theme-colors.md](./theme-colors.md); the React headless equivalent in [headless-ui.md](./headless-ui.md); the framework in [../frameworks/angular.md](../frameworks/angular.md).

## Sources
- https://material.angular.dev/guide/theming
- https://material.angular.dev/guide/getting-started
