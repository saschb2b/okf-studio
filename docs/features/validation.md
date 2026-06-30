---
type: Feature
title: Validation
description: Surface OKF conformance — errors and warnings — in the UI without ever refusing to render the bundle.
tags: [feature, validation, conformance]
timestamp: 2026-06-30T11:00:00Z
---

# What it does

Runs the [OKF conformance check](../reference/okf-spec-summary.md) over each bundle and presents the results, while always rendering whatever is there. This is the visible expression of the [tolerant-consumer principle](../product/principles.md): report, never reject.

# What it checks

- **Errors (hard rule):** a non-reserved `.md` file with no frontmatter block, or a frontmatter block missing a non-empty `type`. These are the only failures the spec defines.
- **Warnings (soft):** a broken cross-link, a `log.md` date that is not ISO `YYYY-MM-DD` (where the [Log View](log-view.md) shows the dated history), an `index.md` carrying frontmatter where it shouldn't, a reserved filename used as a concept. Reported, never fatal.

# How it surfaces

- An **issue indicator** at the left of the [status bar](../ux/browsing-layout.md). Its urgency is **inverted from a badge**: conformance is the baseline, so it reads *quietly* (a dim "✓ Conformant", never a green splash) — colour is reserved for the exception (amber "⚠ N warnings", red "✕ N errors"), so the eye is only drawn when there is something to act on. Clicking it opens the validation panel.
- A **validation panel** listing each issue with its file and a one-line explanation; clicking an issue jumps to the concept.
- Inline cues: a concept with an error gets a marked node in the [graph](graph-view.md); a [broken link](concept-reader.md) renders but is styled as unresolved.

# Relationship to the CLI

The same logic as the bundled `scripts/okf-validate.mjs` checker, reimplemented in the [Rust core](../architecture/okf-parsing.md). The CLI stays the canonical, scriptable checker (it is a [non-goal](../product/scope-and-non-goals.md) to replace it); the app's panel is the interactive view of the same rules.
