---
type: Architecture Decision
title: Bundle Detection
description: The algorithm that walks a chosen folder and decides which directories are OKF bundle roots.
tags: [architecture, decision, discovery, algorithm]
timestamp: 2026-06-28T00:00:00Z
---

# Problem

Given one folder, find every OKF bundle inside it (the [Folder Autodetect](../features/folder-autodetect.md) feature). OKF has no required marker file, so detection is heuristic — but the spec gives strong signals.

# Signals (strongest first)

1. **Root `index.md` with `okf_version`.** The spec says a bundle root *may* declare `okf_version` in its `index.md` frontmatter — the only place that frontmatter is allowed. A directory whose `index.md` carries `okf_version` is a bundle root with high confidence.
2. **A tree of typed concepts.** Otherwise, a directory is a candidate root if it (recursively) contains one or more non-reserved `.md` files whose frontmatter has a non-empty `type` (the one hard [conformance rule](../reference/okf-spec-summary.md)).

# Algorithm

```
scan(folder):
  walk folder depth-first, bounded by MAX_DEPTH
  skip ignored dirs: .git, node_modules, target, dist, build, .venv
  for each directory D (cycle-safe on symlinks):
    if D/index.md has okf_version  -> mark D as bundle root (confident)
    else if D contains >=1 typed concept .md (recursively)
                                   -> mark D as candidate root
  resolve overlaps:
    a confident root absorbs nested candidate dirs (their index.md are sub-indexes,
    not separate bundles)
    keep the OUTERMOST confident root; drop candidates contained within it
  return de-duplicated list of bundle roots
```

# Rules & edge cases

- **Nesting:** the outermost qualifying root wins; inner `index.md` directories are parts of that bundle (sub-directory indexes), not separate bundles.
- **The chosen folder may itself be a bundle root** — detection includes the root, not just descendants.
- **Bound the walk** (depth + ignore list) so pointing at a big monorepo stays [fast](../product/principles.md).
- **Confidence is recorded** and shown in the [Bundle Browser](../features/bundle-browser.md); low-confidence candidates are still offered, since the app is a [tolerant consumer](../product/principles.md).
- Detection re-runs when [Live Reload](../features/live-reload.md) sees structural changes.

Output feeds [OKF Parsing](okf-parsing.md), which turns each root into the [data model](data-model.md).
