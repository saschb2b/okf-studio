---
type: Design Principle
title: Design Principles
description: The non-negotiable principles every OKF Studio feature and decision must respect.
tags: [product, principles]
timestamp: 2026-07-24T12:00:00Z
---

# Principles

These are the constraints behind every [feature](../features/) and [architecture decision](../architecture/). When a trade-off is unclear, the earlier principle wins.

1. **Local-first and offline-capable.** Reading, validating, searching, graphing, staging, applying, and inspecting local Git state require no Studio server or account. Opening a local folder makes no network request. Network activity is tied to a named user action such as opening a URL, checking for updates, installing or connecting an external agent, contacting a configured model endpoint, fetching an attached source, or choosing Fetch, Pull, or Push in [Integrated Git](../features/integrated-git.md), with one disclosed exception: a quiet once-per-launch read of the public release manifest that feeds the [update badge](../ux/settings.md), carries no identity, and has an off switch. Studio does not add telemetry or silent phone-home behavior. An air-gapped workspace remains useful with local files and a local model or agent; hosted providers and remote sources are unavailable by definition.

2. **Vendor-neutral.** Studio reads and curates conformant OKF bundles from any producer. It targets the [format](../reference/okf-spec-summary.md), independent of a specific tool or schema. Agent connections are replaceable: ACP, a local endpoint, or an API-key-backed compatible endpoint can drive the same reviewed workspace.

3. **Tolerant consumer.** Per the OKF spec, the app **must not refuse a bundle** for soft issues: missing optional fields, unknown `type` values, unknown frontmatter keys, broken cross-links, or missing `index.md`. It degrades gracefully and surfaces issues through [Validation](../features/validation.md) instead of failing.

4. **Read-only by default.** Pointing the app at a folder never modifies it, starts an agent, or runs a mutating or networked Git command. Opening and browsing use scoped read access, so inspecting an untrusted bundle remains safe. At launch, the [Agent Panel](../features/agent-panel.md) may visibly reconnect an agent that the user connected and did not disconnect, at most once per session. It never starts an agent the user did not choose. Bundle writing requires an explicit thread grant, a staged revision, validation, human review, and a separate Apply action. Git mutation requires its own named user action in the Git panel. See the [Agent System](../architecture/agent-system.md) and [Git Integration Architecture](../architecture/git-integration.md).

5. **Visible agency.** Agent work stays in an inspectable thread. Context, plans, tool lifecycles, permission requests, proposed files, validation results, and diffs remain visible. No agent may turn a proposal into a bundle write without the reviewed transaction boundary.

6. **Fast.** A bundle of a few hundred concepts renders an interactive graph in well under a second. Heavy work (scan, parse, watch) happens in the [Rust core](../architecture/tech-stack.md); the UI stays responsive.

7. **Progressive disclosure.** The UI mirrors OKF's own navigation model: start at the root `index.md`, reveal detail on demand. The graph and sidebar let users descend without reading everything (see [Navigation](../features/navigation.md)). Agent guidance follows the same rule by loading the packaged OKF skill and bundle context only as needed.

8. **Keyboard-friendly.** Every primary action has a [shortcut](../ux/keyboard-shortcuts.md). The app is usable without a mouse.

9. **Self-contained and portable.** The core workspace ships as one installable desktop application per platform. Optional catalog agents use a Studio-managed, pinned runtime; custom agents remain an explicit user-managed integration. Bundles stay plain portable files, following OKF's "format, not platform" ethos.
