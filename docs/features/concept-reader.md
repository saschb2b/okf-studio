---
type: Feature
title: Concept Reader
description: A reading-first pane — a centered, comfortable prose column with a quiet right context rail of outline, relationships, and metadata.
tags: [feature, reader, markdown, core, reading]
timestamp: 2026-06-30T18:30:00Z
---

# What it does

Selecting a node (in the [graph](graph-view.md) or [sidebar](navigation.md)) opens its concept in the reading pane. Reading is one of the app's core values, so the pane is designed as a *reading surface*, not a data inspector: a centered, typographically comfortable prose column, flanked by a quiet right rail that carries the document's outline, its relationships, and its metadata — so navigation context is visible without crowding the text.

# Composition

At a wide width the reader is a **centered content shell** holding two columns:

- A **reading column** capped to a comfortable measure (~70 characters) via [reading-layer tokens](../ux/theming.md), centered with balanced gutters so the text never pins to one edge or sprawls edge-to-edge. Prose stays **flush-left** (centered body text harms readability — see [Accessibility](../ux/accessibility.md)).
- A **right context rail** (~300px), sticky, scrolling independently — quiet context only, never a second stream of prose.

This is **responsive**: when the pane is narrow (or in the [split layout](../ux/browsing-layout.md) where the graph already supplies relationship context), the rail collapses and its modules fall back beneath the article; the rail shows in full in reader-only and wide windows. The rail always follows the `<article>` in document/focus order with its own landmark, so reading order stays correct.

# Header

- A **breadcrumb** of the concept's index path (e.g. `Architecture / Data Model`), orienting the reader in the bundle ([Navigation](navigation.md)).
- A **type badge** colored to match the [graph palette](../ux/theming.md), the **title**, and a lead **description**. A design-system concept also shows its **status** and **applies_to** here — see [Design-System Rendering](design-system-rendering.md).
- Technical metadata (Concept ID, timestamp, `resource`) lives in the rail's **Details** module rather than as a wall of labels above the prose.
- A concept that carries design **tokens** renders them as a visualization (swatches, type specimens, scales, or a token table) between the header and the body — see [Design-System Rendering](design-system-rendering.md).

# Body — a polished Markdown renderer

Rendered for pleasant reading, sanitized before injection ([security](../architecture/ipc-and-security.md)):

- A generous, readable base size and rhythm; a clear **heading hierarchy** (distinct h1–h4), with **anchored headings** (a hover permalink and a stable id) so sections can be linked and jumped to.
- **Callouts / admonitions** via GFM alert syntax (`> [!NOTE]`, `[!TIP]`, `[!WARNING]`, `[!IMPORTANT]`, `[!CAUTION]`), themed from the status [color roles](../ux/theming.md).
- **Fenced code**, **syntax-highlighted** ([Shiki](../architecture/tech-stack.md), the engine behind VS Code) with a dual light/dark theme that follows the app, and a one-click **copy** affordance. Highlighting is offline and CSP-safe — Shiki's WASM-free JS engine and a curated grammar set, all lazy-loaded only when a concept has code; an unknown language degrades to a plain themed block. Also: **tables** styled for legibility (readable size, header weight, row hover, tabular numerals); blockquotes, lists, and the conventional [`# Schema` / `# Examples` / `# Citations`](../reference/okf-spec-summary.md) sections.
- **Color values get a swatch.** A color value — inline code that is exactly a color (`#1f883d`, `rgb(...)`, `hsl(...)`), *or* a hex color written in plain prose (`borderColor-default (#d1d9e0)`) — is prefixed with a small chip, so a design-system role table or sentence *shows* its colors — see [Design-System Rendering](design-system-rendering.md). Bundle-agnostic; the chip's color is strictly validated before it is inlined, and code/link/pre text is left untouched.
- **Token references resolve in prose.** Inline code that is a `{group.name}` token reference is annotated with the value it resolves to (and gets a swatch when that value is a color), so a doc that mentions a token still shows it — see [Design-System Rendering](design-system-rendering.md).
- **Images render with a spotlight.** A **local** bundle image is inlined (read as a `data:` URL — no network fetch, per the [offline principle](../product/principles.md)) and is **click-to-zoom**: clicking opens a full-window spotlight overlay (dismiss with the close button, Escape, or a backdrop click). A **remote** image is never auto-fetched; it becomes an "open in browser" control. An unreadable local image degrades to a quiet placeholder. See [IPC & Security](../architecture/ipc-and-security.md) for how the offline guarantee holds.
- **Links are underlined** (never color-only — [WCAG 1.4.1](../ux/accessibility.md)). **Intra-bundle links** are visually distinguished from external ones; clicking an in-bundle link resolves the [path](../architecture/okf-parsing.md) and navigates (graph + reader stay in sync), external URLs open in the system browser, and **unresolved links** carry a non-color "broken" affordance, not merely a dimmed strikethrough.

# The right context rail

Stacked, titled modules — quiet navigation context kept beside the prose instead of stranded at the bottom:

- **On this page** — an outline of the body's headings with **scroll-spy** (the current section highlights as you read, and the last section stays highlighted once you reach the end of the page); clicking jumps to the anchored heading.
- **Cited by** — the backlinks: every concept that links *to* this one ([computed by the core](../architecture/data-model.md)). The reverse-index a flat file tree hides; listed first because it is the context the file system cannot give.
- **Links to** — the outbound references.
- **Related by tag** — other concepts sharing this one's tags (synthesized from frontmatter), a relationship dimension beyond explicit links.
- **Details** — type, Concept ID, **Updated** timestamp, and the `resource` link.
- **Broken links** — unresolved targets, de-emphasized, surfaced (never hidden) per the [tolerant-consumer principle](../product/principles.md) and [Validation](validation.md).

Every relationship row is clickable and drives the **single shared selection**, so the [graph](graph-view.md), reader, and [sidebar](navigation.md) stay in sync — the rail turns the reader into a second navigator alongside the graph.

# Reading preferences

An **"Aa" control** at the **top-right of the reader's header** (with the content, not in the title bar — reading is a reader concern, used sparingly) opens a small popover (built on [Base UI](../architecture/frontend-architecture.md)) to tune reading comfort: **text size**, **measure width**, **line spacing**, **font** (the humanist UI sans by default, with an opt-in reading **serif**), and a **reading-aids** toggle (dyslexia-friendly letter/word spacing). Each maps to a CSS variable on the reader and **persists** alongside the other [settings](../ux/settings.md); the keyboard text-size shortcuts (`Ctrl/Cmd +/-/0`) drive the same size control. This is the content-scoped reading layer, distinct from page zoom (suppressed for a [native feel](../ux/theming.md)).
