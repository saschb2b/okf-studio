---
type: Library Notes
title: "Zod"
description: "Zod 4 is a near-total internal rewrite (much faster parsing, smaller core, far fewer type instantiations)."
tags: [javascript, forms]
timestamp: 2026-06-04T00:00:00Z
---
# Zod

**Verified 2026-06-04.** Check the installed `zod` version first; re-verify if newer than below.

**Current stable**: 4.x (4.4); Zod 4.0 stable shipped May 2025. **LLM default bias**: Zod 3.x. `z.string().email()`, single-arg `z.record()`, and the `message`/`invalid_type_error`/`required_error`/`errorMap` error API.

## The shift
Zod 4 is a near-total internal rewrite (much faster parsing, smaller core, far fewer type instantiations). It promotes string-format validators to tree-shakable top-level functions, unifies all error customization under one `error` param, and adds a `zod/mini` functional variant. Zod is used well beyond forms (API boundaries, env, config), so this matters broadly.

## Stop / Start
| Stop (Zod 3) | Start (Zod 4) |
| --- | --- |
| `z.string().email()` / `.url()` / `.uuid()` | Top-level `z.email()`, `z.url()`, `z.uuid()` |
| `z.string({ message, invalid_type_error, required_error })` and `errorMap` | A single unified `z.string({ error })` (string or function) |
| `z.record(z.string())` (single arg) | `z.record(z.string(), z.string())` (key and value) |
| `.default()` applying to the input type | `.default()` now applies to output; use `.prefault()` for the old behavior |
| `error.format()` / `error.flatten()` | `z.treeifyError(error)` |

## Gotchas
- Issue type names changed (e.g. `ZodInvalidTypeIssue` to `z.core.$ZodIssueInvalidType`); custom error-introspection code breaks.
- `z.uuid()` is now strict per RFC; strings that passed loose v3 checks may fail.
- `zod@3.25` ships v4 internally under the `zod/v4` subpath, so a minor v3 bump can pull v4 code paths. Pin deliberately. Reach for `zod/mini` when bundle size is critical.

## Sources
- https://zod.dev/v4
- https://zod.dev/v4/changelog
