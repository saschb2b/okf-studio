---
okf_version: "0.1"
---

# OKF Studio — Product Knowledge Bundle

**OKF Studio** is a cross-platform desktop workspace (Windows + Ubuntu) for connected [Open Knowledge Format](reference/okf-spec-summary.md) (OKF) bundles. It detects bundles in a folder, renders each as a graph and reader, and connects user-chosen agents to explicit context for creation, curation, and cited research. Proposed writes stay staged until validation, review, and a separate apply action. It is built with [Tauri 2.0](reference/tauri-2.md) — a Rust core plus the system webview.

This bundle is the product's source of truth: what it does ([features](features/)), how it feels ([UX](ux/)), and how it is built ([architecture](architecture/)). It also doubles as the app's **built-in sample bundle** — Studio dogfoods itself by rendering this very directory.

# Product

* [Overview](product/overview.md) - A local-first workspace for exploring, creating, curating, and querying connected OKF bundles with user-chosen agents.
* [OKF Studio Transformation](product/studio-roadmap.md) - Sequenced work packages for creation, curation, querying, reviewed writes, and external-agent isolation.
* [OKF Agent Specialization](product/agent-specialization-roadmap.md) - Sequenced work packages for specialized OKF skills, artifacts, routines, and entry points.
* [OKF Viewer to OKF Studio](product/migration-notes.md) - How existing local data, credentials, and compatibility identifiers behave on upgrade.
* [Personas & Use Cases](product/personas.md) - Who it's for, as concrete personas and the jobs they hire it to do.
* [How It Compares](product/comparison.md) - OKF Studio vs. the reference visualizer, PKM tools, static-site generators, editors, and agent chat surfaces.
* [Design Principles](product/principles.md) - The non-negotiables: local-first, vendor-neutral, tolerant, read-only by default, and visible agency.
* [Scope & Non-Goals](product/scope-and-non-goals.md) - Current Studio scope, deferred work, and explicit non-goals.

# Features

* [Agent Panel](features/agent-panel.md) - Run parallel agent threads, attach OKF context, approve tools, and review proposed knowledge changes.
* [Source Adapters and Provenance](features/source-adapters.md) - Turn selected files, folders, images, and public URLs into bounded untrusted evidence with visible versioned provenance.
* [Folder Autodetect](features/folder-autodetect.md) - Point at a folder; find every OKF bundle inside it.
* [Bundle Switcher](features/bundle-switcher.md) - Top-left switcher for the open bundle, sibling bundles in the folder, and recently-opened bundles.
* [Graph View](features/graph-view.md) - Force-directed graph of concepts, colored by type, linked by cross-references.
* [Visualization Views](features/viz-views.md) - Treemap, sunburst, and circle packing views of the bundle hierarchy.
* [Concept Reader](features/concept-reader.md) - Rendered markdown with frontmatter, citations, and clickable links.
* [Design-System Rendering](features/design-system-rendering.md) - Native ODSF token visualizations and sandboxed example previews.
* [Search & Filter](features/search-and-filter.md) - Full-text search, type filters, and tag browsing.
* [Navigation](features/navigation.md) - Progressive disclosure from index.md, link following, and history.
* [Command Palette](features/command-palette.md) - Jump to any concept and run quick actions from the keyboard.
* [Validation](features/validation.md) - Surface OKF conformance errors and warnings without refusing the bundle.
* [Knowledge Health](features/knowledge-health.md) - Give agents deterministic quality evidence without turning heuristics into conformance.
* [Structured Agent Work](features/structured-agent-work.md) - Keep validated OKF plans, reports, research, migrations, and staged revisions active beside the conversation.
* [Artifact Verification and Critic Passes](features/artifact-verification.md) - Compare deterministic checks with an optional isolated critic whose findings cannot approve or apply work.
* [Native OKF Tasks](features/native-okf-tasks.md) - Start bounded curated work from the OKF object already in view.
* [Live Reload](features/live-reload.md) - Watch the folder and refresh the graph as files change.
* [Log View](features/log-view.md) - Render a bundle's log.md as a dated, newest-first change timeline.

# UX

* [First Run](ux/first-run.md) - From empty state to a rendered bundle in two clicks.
* [Empty & Error States](ux/empty-and-error-states.md) - Every no-content, loading, and failure state, and how to recover.
* [Agent Workspace Dogfood](ux/agent-workspace-dogfood.md) - Journey evidence and open findings from the Agent Panel workspace refinement.
* [Browsing Layout](ux/browsing-layout.md) - The three-pane workspace: sidebar, graph, reader.
* [Keyboard Shortcuts](ux/keyboard-shortcuts.md) - Keys for power users.
* [Theming](ux/theming.md) - Light/dark and the type-color palette.
* [Accessibility](ux/accessibility.md) - Keyboard operability, focus, screen-reader semantics, contrast, and motion.
* [Settings & Preferences](ux/settings.md) - Theme, recent folders, scan tuning, motion, and reset.

# Architecture

* [Agent System](architecture/agent-system.md) - External ACP agents, Studio Agent, credentials, scoped tools, permissions, and reviewed writes.
* [Tech Stack](architecture/tech-stack.md) - Tauri 2.0, the Rust core, the frontend, and why.
* [Bundle Detection](architecture/bundle-detection.md) - The algorithm that finds OKF bundles in a folder.
* [OKF Parsing](architecture/okf-parsing.md) - How concepts, links, and indexes are parsed.
* [Data Model](architecture/data-model.md) - Bundle, Concept, and Graph shapes shared across the IPC boundary.
* [Frontend Architecture](architecture/frontend-architecture.md) - The frontend as a thin client over the Rust command/event surface.
* [IPC & Security](architecture/ipc-and-security.md) - Typed Tauri commands for scoped reads, explicit network and process actions, and reviewed writes.
* [Performance & Scale](architecture/performance.md) - How the app stays fast, from the bounded scan to graph rendering.
* [Testing & Dogfooding](architecture/testing.md) - Frontend, Rust core, native host, accessibility, conformance, and Studio authoring gates.
* [OKF Agent Benchmarking](architecture/agent-benchmarking.md) - Frozen task fixtures, machine-checked OKF facts, and provider evaluation boundaries.
* [Build & Release](architecture/build-and-release.md) - Versioning, per-OS packaging, releases, and opt-in updates.

# Reference

* [Zed Agent System Research](reference/zed-agent-system.md) - Primary-source patterns and constraints adopted for OKF Studio.
* [Specialized Agent Systems Research](reference/specialized-agent-systems.md) - Product patterns for turning the agent foundation into an OKF-specialized workspace.
* [OKF Spec Summary](reference/okf-spec-summary.md) - The v0.1 rules Studio must honor.
* [OKF Reference HTML Visualizer](reference/okf-reference-visualizer.md) - Google's single-file HTML consumer — the reference this app is the desktop counterpart to.
* [OKF Sample Bundles](reference/okf-sample-bundles.md) - The GA4, Stack Overflow, and Bitcoin bundles used as additional fixtures.
* [Tauri 2.0](reference/tauri-2.md) - Key facts about the framework and its plugins.
* [Glossary](reference/glossary.md) - Terms used across this bundle.

# Proposals

* [Deep Knowledge Diving](proposals/deep-knowledge-diving.md) - Where the viewer is thin for going deep, and the big-data patterns worth borrowing.
* [Bundle Overview & Health](proposals/bundle-overview.md) - A landing view that orients you in a bundle before you dive.
* [Faceted Query Bar](proposals/faceted-search.md) - Structured field queries and facet rails that filter the workspace live.
* [Lineage & Traversal](proposals/lineage-and-traversal.md) - Expand-on-click, upstream/downstream lineage, path-between, and unlinked mentions.
* [Multi-View — Tabs & Windows](proposals/multi-view.md) - Reader tabs with per-tab history, browser-standard modifier clicks, and undocking a tab into its own window.

# Subdirectories

* [Product](product/) - Vision, audience, principles, and scope.
* [Features](features/) - One concept per user-facing capability.
* [UX](ux/) - Flows, layout, shortcuts, theming, accessibility, settings.
* [Architecture](architecture/) - How it is built.
* [Reference](reference/) - External specs, the OKF ecosystem, and a glossary.
* [Proposals](proposals/) - Design directions not yet built.
