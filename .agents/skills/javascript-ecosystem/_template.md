# Notes template

Copy this block when adding a tool. Keep it tight, one screen. Volatile version numbers live here, not in `SKILL.md`, so there is one place to re-verify. The file lives at `references/<category>/<tool>.md` and is a concept in that directory's OKF bundle, so it must open with the frontmatter shown below.

```
---
type: Library Notes
title: <Tool>
description: <one sentence on the headline shift, no ": " or " #">
tags: [javascript, <category>]
timestamp: <YYYY-MM-DD>T00:00:00Z
---

# <Tool>

**Verified <YYYY-MM-DD>.** Check the project's installed version first; re-verify if newer than below.

**Current stable**: <major.minor> (<month year>). **LLM default bias**: <the versions and patterns training data over-represents>.

## The shift
<2-3 sentences on what changed and why it matters. This section ages slowly. Lead here.>

## Stop / Start
| Stop (LLM default) | Start (current) |
| --- | --- |
| <old pattern an agent reaches for> | <the current replacement> |

## Gotchas
- <migration trap, peer-dep requirement, common footgun>

## Companion (optional)
<link to a deeper sibling skill or related notes file, only if it already exists>

## Sources
- <official release notes or migration guide>
- <docs>
```

## Conventions

- **Stop column** is what an LLM emits unprompted. **Start column** is the current paradigm. Phrase both as concrete patterns, not prose.
- **No version numbers in `SKILL.md`.** The index routes; the notes file dates.
- **OKF frontmatter is required.** Each notes file is a concept in the `references/` OKF bundle, so it opens with the frontmatter above (a non-empty `type`, plus `title`, `description`, `tags`, `timestamp`). `node scripts/check-skills.mjs` validates the bundle and fails without it.
- Lead with **The shift**, not the version. Paradigms outlive release numbers.
- Cross-link a notes file to another only after the target file exists, so every commit stays link-valid.
- **A notes file must stand on its own.** Put the actual paradigm correction (the Stop/Start table) in the file itself. Reference another skill (`react-compiler`, `codegen-api`, etc.) only by name as an optional deeper dive, never as a required step and never as a cross-skill file link. If the sibling skill is not installed, this file must still deliver the full correction.
- **Teachable artifacts live inside this skill.** If a file teaches a technique (a config, a worked example, an audit), that artifact must exist here, inline or in a deep-dive sibling like `api-codegen/setup.md`. Never point at another skill as the only place an example lives. A reader with only this skill installed must get 100% of the teaching.
- After adding a file, register the row in the matching `SKILL.md` table. That is the only required edit outside this folder.
