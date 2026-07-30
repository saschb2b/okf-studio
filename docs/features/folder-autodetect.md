---
type: Feature
title: Folder Autodetect
description: Point the app at a folder and it finds every OKF bundle nested inside, with no manifest or configuration.
tags: [feature, discovery, core]
generated: { by: claude/unrecorded, at: 2026-06-29T12:00:00Z }
---

# What it does

The user chooses a single folder. The app recursively scans it and discovers **all OKF bundles** within. The folder itself may *be* a bundle, may *contain* one, or may contain many across subdirectories, such as a monorepo with several `docs/` bundles. No manifest, no config file, no naming convention required.

# Behavior

- Scanning runs in the [Rust core](../architecture/tech-stack.md) within bounds: a maximum depth, and an ignore list of `.git`, `node_modules`, `target`, and `dist`. A large repo therefore stays fast.
- A directory qualifies as a bundle root per the [Bundle Detection](../architecture/bundle-detection.md) algorithm: primarily a root `index.md` declaring `okf_version`, or a tree of `.md` files carrying `type` frontmatter.
- Detection de-duplicates nested results, and the outermost qualifying root wins. Its sub-`index.md` directories count as parts of that bundle, not as separate bundles.
- The result is a list handed to the [Bundle Switcher](bundle-switcher.md). If the scan finds exactly one bundle, it opens automatically (see [First Run](../ux/first-run.md)).
- Re-scan on demand (and automatically via [Live Reload](live-reload.md)).

# Empty / edge cases

- **No bundles found:** show a clear empty state explaining what an OKF bundle looks like, with a link to the [spec summary](../reference/okf-spec-summary.md).
- **Partial / non-conformant directories:** still offered if they look bundle-ish, with conformance reported by [Validation](validation.md). Tolerance is a [core principle](../product/principles.md).
- **Symlinks:** followed once, with cycle protection.
