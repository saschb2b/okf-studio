---
type: Feature
title: Concept Reader
description: A reading pane that renders a concept's markdown body with its frontmatter, citations, and clickable links and backlinks.
tags: [feature, reader, markdown, core]
timestamp: 2026-06-28T00:00:00Z
---

# What it does

Selecting a node (in the [graph](graph-view.md) or [sidebar](navigation.md)) opens its concept in the reading pane: the rendered markdown body plus a structured header built from the frontmatter.

# Header (from frontmatter)

- **Type badge** colored to match the [graph palette](../ux/theming.md).
- **Title**, **description**, **tags**, **timestamp**, and — when present — a **`resource`** link opened in the system browser.
- The concept's **Concept ID** (its path minus `.md`).

# Body

- Renders standard markdown: headings, lists, tables, fenced code (with syntax tint), blockquotes, and the conventional [`# Schema` / `# Examples` / `# Citations`](../reference/okf-spec-summary.md) sections.
- **Intra-bundle links are live:** clicking a markdown link to another concept (an href like `../tables/x.md`) resolves the [path](../architecture/okf-parsing.md) and navigates to that concept (graph + reader stay in sync). External URLs open in the system browser.
- **Citations** under `# Citations` are listed; links into a `references/` concept resolve like any other.

# Relationships

- **Links to** — the concepts this one references (outbound edges).
- **Cited by** — the backlinks: every concept that links *to* this one, computed by the [Rust core](../architecture/data-model.md). This is the reverse-index that a flat file tree hides.

Both lists are clickable, turning the reader into a second navigator alongside the [graph](graph-view.md).
