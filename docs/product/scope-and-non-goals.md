---
type: Reference
title: Scope and Non-Goals
description: What OKF Studio ships now, what is deferred, and what it deliberately will not be.
tags: [product, scope, roadmap]
generated: { by: claude/unrecorded, at: 2026-07-22T23:10:18Z }
---

# Current scope

Studio covers the complete local knowledge loop:

- **Explore:** autodetect local bundles, open a GitHub or archive URL into a local cache, and switch among bundles. Render graph and hierarchy views, read concepts, search, navigate, validate, and live-reload.
- **Connect:** run an external ACP agent, a custom local ACP command, or Studio Agent through Ollama, LM Studio, llama.cpp, or a compatible endpoint. External agents own their authentication. Studio-managed API keys stay in the operating-system credential store.
- **Curate:** attach selected concepts, reader text, prior threads, local files, folders, pasted text, images where supported, or an explicit public HTTPS source. Context stays bounded and visible.
- **Create and enhance:** use guided threads to create a fresh bundle from sources or enrich the active bundle. Proposals enter staging, validation, graph preview, destination selection, and reviewed apply rather than writing directly.
- **Query and change:** run cited deep research or request a dataset change through ordinary inspectable threads with plans, tool activity, and exported Markdown.
- **Version:** inspect the repository around the active bundle, review and stage changes, and commit a named scope. Browse bounded history, and explicitly fetch, fast-forward pull, or push. See [Integrated Git](../features/integrated-git.md).
- **Ship:** packaged installers for Windows (`.msi`/`.exe`) and Ubuntu (`.deb`/AppImage). macOS builds from source. See [Build and Release](../architecture/build-and-release.md).

# Deferred

The [OKF Ecosystem Response](okf-ecosystem-response-roadmap.md) sequences compatibility, profile, provenance, lifecycle, projection, and interoperability work. Its packages remain deferred unless its implementation record marks them as shipped.

- Enforcement-backed external-agent isolation profiles, including a tested Windows path, before unattended writes.
- Cross-session permission rules after ACP supplies a stable tool identity that Studio can display and match.
- Client-owned terminal or environment-variable authentication if ACP standardizes those methods.
- Tag-browsing views and saved filters.
- Export: the current graph as PNG/SVG, or the bundle as a static self-contained HTML.
- "Cited by" graph focus mode and shortest-path-between-concepts.
- **Folder-as-workspace grouping.** Treat the containing folder as its own entity so bundles from one repository or context are visibly connected. Recent items are currently per-bundle through the [Bundle Switcher](../features/bundle-switcher.md). The folder remains only the read scope.
- **Editable scan ignore-list.** Let users change the directories that the [scan](../architecture/bundle-detection.md) skips in [Settings](../ux/settings.md). The ignore-list is currently fixed, while the maximum scan depth is configurable.
- **Custom-frame platform polish.** Restore the Windows 11 Snap Layouts flyout on the maximize button and native macOS traffic-light placement. The [borderless title bar](../ux/browsing-layout.md) currently gives up both behaviors. Studio draws rounded corners through a transparent window. Environments without compositing may still need a solid-corner fallback.

# Non-goals

- **Not an unreviewed editor.** Opening a bundle remains read-only. Studio authoring happens only through an explicit thread write grant, staged changes, conformance validation, diff review, and atomic apply. See [Agent System](../architecture/agent-system.md).
- **Not a general markdown wiki.** It renders markdown and organizes it around OKF concepts, types, and links. It does not provide arbitrary note-taking.
- **Not a cloud / sync product.** No Studio backend, account, telemetry, or bundle synchronization exists. Optional providers and remote sources are explicit connections, not a Studio cloud.
- **Not a general Git or hosting client.** [Integrated Git](../features/integrated-git.md) covers the repository review, stage, commit, history, and explicit remote loop around an open bundle. It does not clone from [Open-from-URL](../features/bundle-switcher.md), edit conflicts, manage branches or worktrees, rewrite history, or provide pull-request and issue workflows. Git metadata remains protected from agent staging and bundle writes.
- **Not a general autonomous computer operator.** Studio tools stay closed and bundle-scoped. External ACP processes retain normal operating-system access until a verified isolation host exists, so they remain interactive and ineligible for unattended writes.
- **Not a headless validator CLI.** The `validate` desktop command opens the granted bundle and its visible Validation surface. Machine-readable conformance remains the standalone `scripts/okf-validate.mjs`.
- **Not a capability marketplace.** Studio 0.3 ships one build-verified declarative OKF pack. It does not import third-party packs, executable skills, hooks, binaries, or MCP servers.
- **Not tied to one bundle schema.** It must never assume a specific set of `type` values or domain.
