---
type: Library Notes
title: "Chakra UI"
description: "v3 is a complete rewrite."
tags: [javascript, ui]
timestamp: 2026-06-04T00:00:00Z
---
# Chakra UI

**Verified 2026-06-04.** Check the installed `@chakra-ui/react` version first; re-verify if newer than below.

**Current stable**: v3.x (v3.0 shipped Oct 2024). **LLM default bias**: v2, and v1. The Emotion-based v2 API with `extendTheme`, framer-motion animations, and monolithic components.

## The shift
v3 is a complete rewrite. Styling moved off Emotion onto a Panda-style engine, component logic onto Ark UI (Zag.js state machines), and framer-motion is no longer a dependency. The component API changed pervasively, most visibly to a namespaced compound pattern, with a new theming system via `createSystem`.

## Stop / Start
| Stop (LLM default) | Start (Chakra v3) |
| --- | --- |
| `extendTheme({...})` + `<ChakraProvider theme={theme}>` | `createSystem(defaultConfig, {...})` + `<ChakraProvider value={system}>` |
| Monolithic `<Modal>` / `<Menu>` / `<Accordion>` | Compound parts (`Dialog.Root` + `Dialog.Trigger` + `Dialog.Content`, `Menu.Root`) |
| Assuming Emotion + framer-motion underneath | The Panda-style engine + Ark UI; framer-motion is gone |
| v2 prop names and theme shape | The v3 token and recipe system (run the official codemod) |
| `@chakra-ui/react@2` | `@chakra-ui/react@3` and the v3 snippets/CLI |

## Gotchas
- v3 is a hard break from v2. Nearly everything changed (deps, props, config schema, some token names). An official v2 to v3 codemod exists.
- v3 supports RSC and Next.js out of the box, unlike the v2 Emotion runtime.
- Park UI (Ark UI + Panda CSS) is a sibling project whose patterns rhyme with v3. Do not conflate the two.

## Sources
- https://www.chakra-ui.com/blog/00-announcing-v3
- https://chakra-ui.com/docs/get-started/migration
