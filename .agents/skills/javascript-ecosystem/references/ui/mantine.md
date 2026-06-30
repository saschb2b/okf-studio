---
type: Library Notes
title: "Mantine"
description: "The Emotion removal already happened in v7 (native CSS modules plus CSS variables, `createStyles` dropped); that is the shift most LLMs miss."
tags: [javascript, ui]
timestamp: 2026-06-04T00:00:00Z
---
# Mantine

**Verified 2026-06-04.** Check the installed `@mantine/core` version first; re-verify if newer than below.

**Current stable**: v9 (Mar 2026), React 19.2+ only. **LLM default bias**: v6 and earlier, frequently the pre-v7 Emotion era with `createStyles`.

## The shift
The Emotion removal already happened in v7 (native CSS modules plus CSS variables, `createStyles` dropped); that is the shift most LLMs miss. v9 then pushes the baseline to React 19.2+ (uses `useEffectEvent`, `Activity`), changes several defaults, and renames some props.

## Stop / Start
| Stop (LLM default) | Start (current Mantine) |
| --- | --- |
| `createStyles` / Emotion styling (v6 and earlier) | CSS modules plus the `classNames`/`styles` props and Mantine CSS variables |
| Assuming v6 or v7 is current | `@mantine/*@^9`, which requires React 19.2+ |
| `<Grid gutter={...}>` | `<Grid gap={...}>` (renamed in v9) |
| `<Collapse in={...}>` | `<Collapse expanded={...}>` (renamed in v9) |
| `useCallback`/`useMemo` around hook callbacks | Pass them directly (v9 hooks use `useEffectEvent`) |

## Gotchas
- v9 is React 19.2+ only. If stuck on React 18, stay on the v8 line, which is still patched.
- Peer-dependency bumps in v9: Tiptap 3+ (`@mantine/tiptap`), Recharts 3+ (`@mantine/charts`).
- The Emotion removal is a v7 change, not v9. Plenty of stale guidance still references `createStyles`.

## Sources
- https://mantine.dev/changelog/9-0-0/
- https://mantine.dev/changelog/7-0-0/
