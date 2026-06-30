---
type: Library Notes
title: "React Hook Form"
description: "Still on the v7 major and actively maintained (a v8 beta is in flight)."
tags: [javascript, forms]
timestamp: 2026-06-04T00:00:00Z
---
# React Hook Form

**Verified 2026-06-04.** Check the installed `react-hook-form` version first; re-verify if newer than below.

**Current stable**: 7.77 (May 2026); v8 is in beta, not stable. **LLM default bias**: React Hook Form v7 generally, but often older v7 patterns and the v6 `register` ref-callback style (`ref={register}`).

## The shift
Still on the v7 major and actively maintained (a v8 beta is in flight). The current best practice pairs RHF with a schema resolver for validation rather than inline `register` rules, and reserves `<Controller>` for controlled and third-party inputs while keeping native inputs uncontrolled for performance.

## Stop / Start
| Stop (LLM default) | Start (current RHF) |
| --- | --- |
| `register` as a ref callback (`<input ref={register} name="x" />`) | Spread the return (`<input {...register("x")} />`) |
| Hand-rolled inline validation rules for complex schemas | A resolver (`useForm({ resolver: zodResolver(schema) })`) |
| `<Controller>` for every input | Native inputs uncontrolled; `<Controller>` for controlled libraries (MUI, RN) |
| Reaching for v8 in production | Stay on v7.77 (v8 is beta) |

## Gotchas
- `@hookform/resolvers` 5.x requires `react-hook-form@7.55.0+`; pair RHF 7.77 with resolvers 5.4.x.
- 7.77 added security hardening against prototype-path traversal; bump if you were on an older 7.x.
- v8 beta changes some internals; do not assume v8 docs apply to the stable v7 line.

## Companion
Schema validation in [zod.md](./zod.md).

## Sources
- https://react-hook-form.com/
- https://github.com/react-hook-form/react-hook-form/releases
