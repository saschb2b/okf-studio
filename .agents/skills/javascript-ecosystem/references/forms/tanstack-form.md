---
type: Library Notes
title: "TanStack Form"
description: "TanStack Form reached production-stable v1 with a headless, fully type-safe, framework-agnostic core (React, Vue, Angular, Solid, Svelte, Lit)."
tags: [javascript, forms]
timestamp: 2026-06-04T00:00:00Z
---
# TanStack Form

**Verified 2026-06-04.** Check the installed `@tanstack/react-form` version first; re-verify if newer than below.

**Current stable**: 1.x (v1.0 stable Mar 2025). **LLM default bias**: pre-v1 alpha-era APIs, or simply not knowing it exists and defaulting to Formik or React Hook Form.

## The shift
TanStack Form reached production-stable v1 with a headless, fully type-safe, framework-agnostic core (React, Vue, Angular, Solid, Svelte, Lit). It adopts the Standard Schema spec, so Zod 4 and Valibot schemas plug in directly with no dedicated resolver package, with deep type inference where invalid field names are type errors.

## Stop / Start
| Stop (LLM default) | Start (current TanStack Form) |
| --- | --- |
| Treating TanStack Form as alpha or experimental | It is v1 stable and production-ready |
| Wiring Zod via a separate resolver adapter | Pass the schema directly via Standard Schema (`validators: { onChange: schema }`) |
| Defaulting to Formik for new forms | TanStack Form for headless and max type-safety |
| Assuming React-only | Framework-agnostic adapters (`react-form`, `vue-form`, `solid-form`, etc.) |
| RHF uncontrolled-ref performance tricks | The reactive subscription model (`form.Field` render props, `useStore` selectors) |

## Gotchas
- Per-framework adapter versions can drift; pin the adapter for your framework explicitly.
- It is heavier than RHF (around 20 KB gzipped); choose it for type-safety and large dynamic forms, not minimal bundle size.
- It is the common recommended target when migrating off the now-unmaintained Formik.

## Companion
Schema validation in [zod.md](./zod.md).

## Sources
- https://tanstack.com/blog/announcing-tanstack-form-v1
- https://tanstack.com/form/latest/docs/overview
