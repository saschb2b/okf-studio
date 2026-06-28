---
type: Library Notes
title: "Motion (formerly Framer Motion)"
description: "The library was rebranded from `framer-motion` to `motion` and is now an independent, framework-agnostic project spanning vanilla JavaScript, React (`motion/react`), and Vue (`motion-v`)."
tags: [javascript, ui]
timestamp: 2026-06-04T00:00:00Z
---
# Motion (formerly Framer Motion)

**Verified 2026-06-04.** Check whether the project depends on `motion` or the old `framer-motion`; re-verify if newer than below.

**Current stable**: 12.x, published as the `motion` package. **LLM default bias**: `framer-motion` with `import { motion } from "framer-motion"`, and the React-only framing.

## The shift
The library was rebranded from `framer-motion` to `motion` and is now an independent, framework-agnostic project spanning vanilla JavaScript, React (`motion/react`), and Vue (`motion-v`). The React API itself did not break in the v12 rename; only the package name and import path changed.

## Stop / Start
| Stop (LLM default) | Start (current Motion) |
| --- | --- |
| `npm install framer-motion` | `npm install motion` |
| `import { motion } from "framer-motion"` | `import { motion } from "motion/react"` |
| `import { useScroll, AnimatePresence } from "framer-motion"` | Import those from `"motion/react"` |
| Treating it as React-only | Framework-agnostic (`motion` vanilla, `motion/react`, `motion-v` for Vue) |
| Referencing `framer-motion` as the current package | `motion` is canonical; `framer-motion` is the legacy name |

## Gotchas
- Migration is mechanical: uninstall `framer-motion`, install `motion`, swap `"framer-motion"` to `"motion/react"`. No breaking React API changes in the rename.
- Vue uses the separate `motion-v` package, not `motion/react`. Do not conflate the import paths.
- In the Next.js App Router, motion components still need `"use client"`.

## Sources
- https://motion.dev/docs/react-installation
- https://motion.dev/docs/react-upgrade-guide
