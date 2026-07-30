---
type: Architecture Decision
title: Bundle Detection
description: The algorithm that walks a chosen folder and decides which directories are OKF bundle roots.
tags: [architecture, decision, discovery, algorithm]
generated: { by: claude/unrecorded, at: 2026-07-04T18:30:00Z }
---

# Problem

Given one folder, find every OKF bundle inside it (the [Folder Autodetect](../features/folder-autodetect.md) feature). OKF has no required marker file, so detection is heuristic. The spec still gives strong signals.

# Signals (strongest first)

1. **Root `index.md` with `okf_version`.** The spec says a bundle root *may* declare `okf_version` in its `index.md` frontmatter, the only place the spec allows that frontmatter. A directory whose `index.md` carries `okf_version` is a bundle root with high confidence.
2. **A tree of typed concepts, bounded by `index.md`.** Otherwise, a directory is a candidate root if it (recursively) contains one or more non-reserved `.md` files whose frontmatter has a non-empty `type` (the one hard [conformance rule](../reference/okf-spec-summary.md)). A typed concept belongs to the **nearest enclosing directory that has its own `index.md`**, the top of a contiguous `index.md` chain and a bundle boundary. Take a plain *container* folder that merely holds several `index.md`-bearing bundle directories, none declaring `okf_version`. It yields **one candidate per bundle** rather than a single merged root. Loose concepts with no `index.md` anywhere fall back to the scanned folder as one candidate.

# Algorithm

```
scan(folder):
  walk folder depth-first, bounded by MAX_DEPTH
  skip ignored dirs: .git, node_modules, target, dist, build, .venv
  for each directory D (cycle-safe on symlinks):
    if D/index.md has okf_version  -> mark D as bundle root (confident)
  for each typed concept .md file:
    candidate root = nearest ancestor dir with its own index.md whose parent has
                     none (the top of a contiguous index.md chain); else the
                     scanned folder      -> mark as candidate root
  resolve overlaps:
    a confident root absorbs nested candidate dirs (their index.md are sub-indexes,
    not separate bundles)
    keep the OUTERMOST confident root; drop candidates contained within it
  return de-duplicated list of bundle roots
```

# Rules and edge cases

- **Nesting within a bundle:** inside a confident (or candidate) root, inner `index.md` directories are parts of that bundle (sub-directory indexes), not separate bundles. The boundary rule stops at the *top* of the `index.md` chain, so nested section indexes never split a bundle.
- **A container of bundles is not a bundle:** point at a folder that itself has no `index.md` but holds several bundle directories that do. One example is `GoogleCloudPlatform/knowledge-catalog`'s `okf/bundles`, whose sub-bundles omit `okf_version`. Detection returns each sub-bundle separately rather than merging their concepts under the container. The [Bundle Switcher](../features/bundle-switcher.md) then lists them, and the [Open-from-URL](../features/bundle-switcher.md) dialog offers a picker.
- **The chosen folder may itself be a bundle root**: detection includes the root as well as descendants.
- **Bound the walk** (depth + ignore list) so pointing at a big monorepo stays [fast](../product/principles.md).
- **Detection records confidence** and shows it in the [Bundle Switcher](../features/bundle-switcher.md). It still offers low-confidence candidates, since the app is a [tolerant consumer](../product/principles.md).
- Detection re-runs when [Live Reload](../features/live-reload.md) sees structural changes.

Output feeds [OKF Parsing](okf-parsing.md), which turns each root into the [data model](data-model.md).
