---
type: Feature
title: Folder Autodetect
description: Point the app at a folder and it finds every OKF bundle nested inside, with no manifest or configuration.
tags: [feature, discovery, core]
generated: { by: claude/unrecorded, at: 2026-06-29T12:00:00Z }
---

# What it does

The user chooses a single folder. The app recursively scans it and discovers **all OKF bundles** within — whether the folder *is* a bundle, *contains* one, or contains many across subdirectories (e.g. a monorepo with several `docs/` bundles). No manifest, no config file, no naming convention required.

# Behavior

- Scanning runs in the [Rust core](../architecture/tech-stack.md) and is bounded (max depth, ignore `.git`, `node_modules`, `target`, `dist`) so pointing at a large repo stays fast.
- A directory qualifies as a bundle root per the [Bundle Detection](../architecture/bundle-detection.md) algorithm — primarily a root `index.md` declaring `okf_version`, or a tree of `.md` files carrying `type` frontmatter.
- Nested results are de-duplicated: the outermost qualifying root wins; its sub-`index.md` directories are treated as parts of that bundle, not separate bundles.
- The result is a list handed to the [Bundle Switcher](bundle-switcher.md). If exactly one bundle is found, it opens automatically (see [First Run](../ux/first-run.md)).
- Re-scan on demand (and automatically via [Live Reload](live-reload.md)).

# Empty / edge cases

- **No bundles found:** show a clear empty state explaining what an OKF bundle looks like, with a link to the [spec summary](../reference/okf-spec-summary.md).
- **Partial / non-conformant directories:** still offered if they look bundle-ish, with conformance reported by [Validation](validation.md). Tolerance is a [core principle](../product/principles.md).
- **Symlinks:** followed once, with cycle protection.
