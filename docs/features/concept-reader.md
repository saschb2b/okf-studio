---
type: Feature
title: Concept Reader
description: A reading-first pane — a centered, comfortable prose column with a quiet right context rail of outline, relationships, and metadata.
tags: [feature, reader, markdown, core, reading]
timestamp: 2026-07-07T00:00:00Z
---

# What it does

Selecting a node (in the [graph](graph-view.md) or [sidebar](navigation.md)) opens its concept in the reading pane. Reading is one of the app's core values, so the pane is designed as a *reading surface*, not a data inspector: a centered, typographically comfortable prose column, flanked by a quiet right rail that carries the document's outline, its relationships, and its metadata — so navigation context is visible without crowding the text.

# Composition

At a wide width the reader is a **centered content shell** holding two columns:

- A **reading column** capped to a comfortable measure (~70 characters) via [reading-layer tokens](../ux/theming.md), centered with balanced gutters so the text never pins to one edge or sprawls edge-to-edge. Prose stays **flush-left** (centered body text harms readability — see [Accessibility](../ux/accessibility.md)).
- **Media breaks out of the measure** (the layout-breakouts pattern from long-form editorial design): prose keeps its line length on any display — wide text hurts reading, per the classic 45–75ch band and WCAG 1.4.8's 80-character line — while the surfaces that *aren't* prose, the [design-system](design-system-rendering.md) **live example previews and token visualizations**, expand to the full content column. On a large display an example renders at near-real page width instead of squeezed into a text column, which is the whole point of a live preview; the shell's outer cap is sized accordingly (wider than any prose-only cap would be).
- A **right context rail** (~300px), sticky, scrolling independently — quiet context only, never a second stream of prose.

This is **responsive**: when the pane is narrow (or in the [split layout](../ux/browsing-layout.md) where the graph already supplies relationship context), the rail collapses and its modules fall back beneath the article; the rail shows in full in reader-only and wide windows. The collapse threshold **tracks the chosen text width** ([settings](../ux/settings.md)): a wider measure claims the rail's space for prose sooner, so the two never crowd or overlap each other. The rail always follows the `<article>` in document/focus order with its own landmark, so reading order stays correct.

# Header

- A **breadcrumb** of the concept's index path (e.g. `Architecture / Data Model`), orienting the reader in the bundle ([Navigation](navigation.md)).
- A single quiet **meta line** above the title — `● Type · status · applies-to` as plain dim text with dot separators, the type carrying its [palette color](../ux/theming.md) as a small dot (the same encoding the Filter lens and graph use). Status is colored **only when exceptional** (experimental / deprecated); stable is the baseline and reads as plain text. An earlier revision rendered each of these as its own bordered pill — three competing chip treatments read as noise, and the pills were dropped for the flat line. Tags render the same way beneath the description, as quiet `#tag` text: they are labels, not buttons, so no pill chrome suggesting a dead click. See [Design-System Rendering](design-system-rendering.md) for status/applies_to.
- Technical metadata (Concept ID, timestamp, `resource`) lives in the rail's **Details** module rather than as a wall of labels above the prose.
- A concept that carries design **tokens** renders them as a visualization (swatches, type specimens, scales, or a token table) between the header and the body — see [Design-System Rendering](design-system-rendering.md).

# Body — a polished Markdown renderer

Rendered for pleasant reading, sanitized before injection ([security](../architecture/ipc-and-security.md)):

- A generous, readable base size and rhythm; a clear **heading hierarchy** (distinct levels), with **anchored headings** (a hover permalink and a stable id) so sections can be linked and jumped to — in-page `#anchor` links in the body work too. A body's `# Section` headings (the OKF convention — `# Schema`, `# Examples`) are **demoted one step to h2**: the concept title owns the page's single h1, and left as h1 they would rival it and fall outside the outline and anchor pass. All of this — ids, permalinks, the code-copy affordance below — is **baked into the rendered HTML string**, never appended to the live DOM afterwards, so React re-applying the body can't wipe it.
- **Callouts / admonitions** via GFM alert syntax (`> [!NOTE]`, `[!TIP]`, `[!WARNING]`, `[!IMPORTANT]`, `[!CAUTION]`), themed from the status [color roles](../ux/theming.md).
- **Fenced code**, **syntax-highlighted** ([Shiki](../architecture/tech-stack.md), the engine behind VS Code) with a dual light/dark theme that follows the app, and a one-click **copy** affordance. Highlighting is offline and CSP-safe — Shiki's WASM-free JS engine and a curated grammar set, all lazy-loaded only when a concept has code; an unknown language degrades to a plain themed block. Also: **tables** styled for legibility (readable size, header weight, row hover, tabular numerals); blockquotes, lists, and the conventional [`# Schema` / `# Examples` / `# Citations`](../reference/okf-spec-summary.md) sections.
- **Math renders as typeset formulas.** TeX between `$…$` (inline) or `$$…$$` (display) is typeset with KaTeX — lazy-loaded like Shiki, fonts bundled, fully offline. The TeX is fenced off from markdown processing (subscript underscores never italicize) and the typeset markup is baked into the body string like everything else. Guards keep prose safe: currency (`$5 and $10`), spaced dollars, and `$` inside code stay literal, and `\$` escapes one. Invalid TeX renders best-effort; if the typesetter is unavailable the raw TeX stays visible as quiet code — a formula is never lost.
- **Color values get a swatch.** A color value — inline code that is exactly a color (`#1f883d`, `rgb(...)`, `hsl(...)`), *or* a hex color written in plain prose (`borderColor-default (#d1d9e0)`) — is prefixed with a small chip, so a design-system role table or sentence *shows* its colors — see [Design-System Rendering](design-system-rendering.md). Bundle-agnostic; the chip's color is strictly validated before it is inlined, and code/link/pre text is left untouched.
- **Token references resolve in prose.** Inline code that is a `{group.name}` token reference is annotated with the value it resolves to (and gets a swatch when that value is a color), so a doc that mentions a token still shows it — see [Design-System Rendering](design-system-rendering.md).
- **Images render with a spotlight.** A **local** bundle image is inlined (read as a `data:` URL — no network fetch, per the [offline principle](../product/principles.md)) and is **click-to-zoom**: clicking opens a full-window spotlight overlay (dismiss with the close button, Escape, or a backdrop click). A **remote** image is never auto-fetched; it becomes an "open in browser" control. An unreadable local image degrades to a quiet placeholder. See [IPC & Security](../architecture/ipc-and-security.md) for how the offline guarantee holds.
- **Links say where they lead.** Every link is underlined (never color-only, per [WCAG 1.4.1](../ux/accessibility.md)) and carries a hover hint naming its destination, so a click is predictable before it happens. An **in-bundle link** resolves the [path](../architecture/okf-parsing.md) and opens in the reader (graph + reader stay in sync). A **section link** (one that points at a directory, e.g. `reference/` or `reference/index.md`) opens that part of the bundle rather than doing nothing. An **external link** carries an outbound arrow and a visually-hidden "opens in browser" cue, and opens in the system browser. An **unresolved link** is marked broken with non-color affordances (a dashed underline and a prohibited marker), not merely a dimmed strikethrough, and names the missing target on hover. Broken links are surfaced, never hidden, per the [tolerant-consumer principle](../product/principles.md). Classification is baked into the rendered body so the cues never disappear on re-render.

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
