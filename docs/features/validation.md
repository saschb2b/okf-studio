---
type: Feature
title: Validation
description: Surface OKF conformance (errors and warnings) in the UI without ever refusing to render the bundle.
tags: [feature, validation, conformance]
generated: { by: claude/unrecorded, at: 2026-07-23T20:15:52+02:00 }
---

# What it does

Runs the [OKF conformance check](../reference/okf-spec-summary.md) over each bundle and presents the results, while always rendering whatever is there. This is the visible expression of the [tolerant-consumer principle](../product/principles.md): report, never reject.

# What it checks

- **Errors (hard rule):** a non-reserved `.md` file with no frontmatter block, or a frontmatter block missing a non-empty `type`. These are the only failures the spec defines.
- **Warnings (soft):** a broken cross-link, or a `log.md` date that is not ISO `YYYY-MM-DD`. The [Log View](log-view.md) shows the dated history. Also an `index.md` carrying frontmatter where it shouldn't, or a reserved filename used as a concept. Reported, never fatal.

# How it surfaces

- The title bar's **Bundle details** Info action carries a small status mark: pass, warning, or error. Its accessible name and tooltip state the result without relying on colour. The dialog expands that mark into **Conformant**, **Conformant with warnings**, or **Not conformant**, gives the exact issue counts, and opens the full validation report. Core status therefore stays with the bundle's identity, format, and size instead of being split across the footer.
- A **validation panel** lists each issue with its file and a one-line explanation. Clicking an issue jumps to the concept. Issues render as **flat problems-list rows**, the VS Code pattern: a severity dot, the message, and the concept id dimmed beneath. An Errors or Warnings heading groups them and carries the severity color once. No per-row severity word repeats it, and no card chrome surrounds what is a list.
- Inline cues: a concept with an error gets a marked node in the [graph](graph-view.md). A [broken link](concept-reader.md) renders, and its styling marks it unresolved.
- The [Agent Panel](agent-panel.md) can attach a chosen issue as visible, removable source evidence. Its exact message and concept provenance reach the agent through the bounded source path without granting edits.
- Each finding also has a [Native OKF Tasks](native-okf-tasks.md) action. It carries the exact finding as bounded evidence, prioritizes the curated repair capability, and keeps any proposed edit behind reviewed staging.
- The [Compatibility Clinic](compatibility-clinic.md) includes these same findings beside separate portability and extension groups. Its machine-readable export retains the distinction instead of promoting advice into an OKF error.

# Relationship to the CLI

The same logic as the bundled `scripts/okf-validate.mjs` checker, reimplemented in the [Rust core](../architecture/okf-parsing.md). The CLI stays the canonical, scriptable checker, and replacing it is a [non-goal](../product/scope-and-non-goals.md). The app's panel is the interactive view of the same rules.

# Relationship to knowledge health

[Knowledge Health](knowledge-health.md) is a separate agent-facing analysis. It may report navigation, provenance, freshness, duplication, graph, or coverage signals. It labels each as a fact or heuristic and never adds them to the OKF conformance error count. A health-analysis limit or failure cannot stop this validation surface or prevent the bundle from opening.
