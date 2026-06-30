---
type: Design Principle
title: Design Principles
description: The non-negotiable principles every OKF Viewer feature and decision must respect.
tags: [product, principles]
timestamp: 2026-06-28T00:00:00Z
---

# Principles

These are the constraints behind every [feature](../features/) and [architecture decision](../architecture/). When a trade-off is unclear, the earlier principle wins.

1. **Local-first and offline.** No server, no account, no network round-trip to read a bundle. Everything runs on the user's machine against the local filesystem. The app must work fully air-gapped.

2. **Vendor-neutral.** The viewer renders *any* conformant OKF bundle from any producer — not just bundles we made. It targets the [format](../reference/okf-spec-summary.md), never a specific tool or schema.

3. **Tolerant consumer.** Per the OKF spec, the app **must not refuse a bundle** for soft issues: missing optional fields, unknown `type` values, unknown frontmatter keys, broken cross-links, or missing `index.md`. It degrades gracefully and surfaces issues through [Validation](../features/validation.md) instead of failing.

4. **Read-only by default.** Pointing the app at a folder never modifies it. Filesystem access is read-only and [scoped](../architecture/ipc-and-security.md) to the chosen folder. It is always safe to open an untrusted bundle.

5. **Fast.** A bundle of a few hundred concepts renders an interactive graph in well under a second. Heavy work (scan, parse, watch) happens in the [Rust core](../architecture/tech-stack.md); the UI stays responsive.

6. **Progressive disclosure.** The UI mirrors OKF's own navigation model: start at the root `index.md`, reveal detail on demand. The graph and sidebar let users descend without reading everything (see [Navigation](../features/navigation.md)).

7. **Keyboard-friendly.** Every primary action has a [shortcut](../ux/keyboard-shortcuts.md). The app is usable without a mouse.

8. **Self-contained and portable.** A single installable binary per platform, no runtime dependencies the user must manage, following OKF's own "format, not platform" ethos.
