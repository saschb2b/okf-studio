---
type: Feature
title: Command Palette
description: A global launcher (Ctrl/Cmd + K or /) that jumps to any concept, searches body text, and runs quick actions — keyboard-only, grouped results.
tags: [feature, palette, launcher, navigation, keyboard, search]
timestamp: 2026-07-23T21:24:41+02:00
---

# What it does

A **global launcher**, opened with `Ctrl/Cmd + K`, with `/`, or by clicking the search field in the top bar, that jumps to any concept, searches concept **body text**, and runs quick actions such as open folder, open [Bundle Home](bundle-home.md), open [Bundle details](metadata-inspector.md), manage [Bundle Connections](interoperability-lab.md), [create a shareable bundle](recipient-projections.md), toggle [log](log-view.md), and re-scan (see [keyboard shortcuts](../ux/keyboard-shortcuts.md)). It is the one fast way to get anywhere without reaching for the mouse, and the app's primary search entry point.

# Matching & grouping

- **Fuzzy matching** over each concept's `title`, id, `type`, description, and tags, and over each quick action's label, ranked so the closest match leads; with no query it offers a starting set rather than a blank box.
- **The match is shown, not just used.** The characters a query matched are marked in the result's title, so an abbreviation finding its concept — `grph` → **Gr**a**ph** View — reads as a hit rather than as a guess. Ranking lives in `features/shell/paletteSearch.ts` and is unit-tested: prefix beats word-start beats mid-word substring beats subsequence, runs of adjacent characters and matches on word boundaries score higher, and a multi-word query requires every term but not their order.
- **No search dependency.** Fuse.js would replace the ranker with about twelve kilobytes, and the one thing it adds over this is tolerance for transposed characters (`agnet` for `agent`). Subsequence matching, field weighting, and match indices for highlighting are all here. The transposition gap is deliberate and tested for, not an oversight.
- Results are **grouped** so a long list stays scannable, each group labelled with its own count. With no query, **Recent** concepts and a short **suggested** set of actions lead — not the whole command list. With a query, **Concepts** and **Actions** are ordered by their own best match rather than by a fixed sequence, so searching "agent" leads with the Agent Panel concept instead of whichever command was declared first. Origin-bound **OKF tasks** follow the concept they act on and never lead, so Enter opens the best navigation match instead of unexpectedly starting agent work. **In text** body matches with snippets come last.
- Quick actions appear alongside concept results, so the same box launches a command or navigates to a node.
- **OKF tasks** use the same stable IDs and [context-preview launcher](native-okf-tasks.md) as the reader, graph, validation panel, and source tray. Arrow to one to start cited research, change-impact work, enrichment, or a matching repair without copying a concept path.

# The states it has to hold

Each of these used to be the same undifferentiated wall of rows.

| State | What it shows |
|-------|---------------|
| **No folder open** | Only the commands that work without one. It used to offer Re-scan folder, Bundle home, and four visualization switches with nothing to apply them to — and the launcher was not even mounted, so `Ctrl/Cmd + K` on the empty state ran the handler, suppressed the browser default, and rendered nothing. |
| **No query** | Recent concepts and a handful of suggested commands. Nineteen commands, each tagged "Action" beneath a heading reading ACTIONS, is a list to escape from rather than a place to start. |
| **Results** | Ranked across groups, with matched characters marked, a colored dot carrying the concept's type — the same encoding the graph and sidebar use — and `↵` on the row Enter will act on. |
| **Capped** | Says so. The Concepts group holds thirty; the footer reads "30 shown · 112 concepts match" rather than silently dropping the rest. |
| **No match** | Names the query, says what was searched over, and offers the commands that still work. "No matches" alone left a failed query and nowhere to go. |

A result's snippet quotes prose, not markdown source: fences, links, headings, list markers, and inline HTML are stripped first, so an "In text" hit reads as a sentence instead of as `Scan[Rust core scans] Scan -- Graph[Graph view]`.

The footer carries two hints and no more: `↑↓ navigate` and `↵ open`, as unboxed glyphs beside their verbs. **Esc is not a footer hint** — it sits at the top right of the search row as a boxed cap that *is* the close control, which is where a reader looks for one. A footer that lists every chord becomes a second toolbar competing with the results; the full keymap belongs in the [shortcuts overlay](../ux/keyboard-shortcuts.md), which is what that surface is for.

# Keyboard-only

- Open, type, arrow through results, Enter to choose, Escape to dismiss — entirely from the keyboard, honoring the [keyboard-friendly principle](../product/principles.md) and the [accessibility](../ux/accessibility.md) contract.

# Selection drives everything

- Selecting a result drives the **single shared selection**, so the [graph](graph-view.md), [reader](concept-reader.md), and [sidebar](../ux/browsing-layout.md) all sync to it — the same selection model the rest of [Navigation](navigation.md) uses.

# Why it stays fast

- It filters over the already-parsed [data model](../architecture/data-model.md) — no re-scan, no disk read — keeping results instant ([performance](../architecture/performance.md)).

# Launcher vs. filters

- The launcher is a **transient overlay** for finding and going to one thing — by id, title, or body text — then it dismisses. [Search & Filter](search-and-filter.md) is the *persistent* surface: type and tag filters in the sidebar's Filter lens that narrow the *whole view* and stay applied. Use the launcher to go somewhere; use filters to keep seeing less.
