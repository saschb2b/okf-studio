---
type: Feature
title: Bundle Browser
description: When a folder holds more than one OKF bundle, list them and let the user switch between them.
tags: [feature, navigation]
timestamp: 2026-06-28T00:00:00Z
---

# What it does

When [Folder Autodetect](folder-autodetect.md) finds more than one bundle, the Bundle Browser presents them and lets the user pick which to open and switch between them without re-choosing the folder.

# Each entry shows

- **Name** — derived from the bundle root `index.md`'s first `# Heading`, falling back to the directory name.
- **Path** — relative to the chosen folder.
- **Concept count** and the set of `type`s present (as colored dots matching the [graph palette](../ux/theming.md)).
- **`okf_version`** if declared, and a conformance badge from [Validation](validation.md).

# Behavior

- Selecting a bundle loads it into the [Graph View](graph-view.md) and [Reader](concept-reader.md); switching is instant because all detected bundles are parsed (or parsed lazily and cached) by the [Rust core](../architecture/okf-parsing.md).
- The browser lives in the left sidebar of the [Browsing Layout](../ux/browsing-layout.md) and collapses when only one bundle exists.
- Recent folders are remembered so reopening the app returns to the last workspace (see [First Run](../ux/first-run.md)).
