---
type: Library Notes
title: "Material UI (MUI)"
description: "The major line jumped v5 to v6 to v7 to v9 (no v2, no v8) to share a major with MUI X."
tags: [javascript, ui]
timestamp: 2026-06-04T00:00:00Z
---
# Material UI (MUI)

**Verified 2026-06-04.** Check the installed `@mui/material` version first; re-verify if newer than below.

**Current stable**: v9 (Apr 2026). **LLM default bias**: v5, often v4. `makeStyles`/`withStyles`, the old `Grid` with `item`/`xs`/`md`, and Emotion theming as the assumed default.

## The shift
The major line jumped v5 to v6 to v7 to v9 (no v2, no v8) to share a major with MUI X. The architectural moves across that span are CSS-variables theming (`cssVariables`), a rewritten `Grid` (Grid v2, now just `Grid`), and ongoing decoupling from Emotion. The separately marketed Pigment CSS zero-runtime engine is paused, so it is not the production styling path.

## Stop / Start
| Stop (LLM default) | Start (current MUI) |
| --- | --- |
| `makeStyles` / `withStyles` / `createStyles` | `sx` for one-offs, `styled()` for reusable components |
| Assuming v5 or v6 is current | Target `@mui/material@^9`; pin MUI X to the matching v9 |
| `<Grid item xs={6} md={4}>` | `<Grid size={{ xs: 6, md: 4 }}>` (no `item` prop) |
| Reaching for Pigment CSS as the new default | Stay on the Emotion-backed `styled`/`sx` runtime; Pigment is paused |
| Separate light and dark themes | `createTheme({ cssVariables: true })` and `CssVarsProvider` |

## Gotchas
- There is no v2 and no v8. The sequence is v5, v6, v7, v9. Do not invent the missing numbers.
- MUI Core and MUI X share a major. v9 pairs with MUI X v9; mismatched majors are an anti-pattern.
- A v7 to v9 jump needs the official codemods.
- Base UI is MUI's actively developed headless layer.

## Companion
Color-role usage (the 10 roles, `alpha()`, the audit) is inlined in [theme-colors.md](./theme-colors.md). The standalone **theme-colors** skill is an optional deeper dive. This file is versions and paradigms only.

## Sources
- https://mui.com/versions/
- https://mui.com/material-ui/migration/migrating-to-v6/
