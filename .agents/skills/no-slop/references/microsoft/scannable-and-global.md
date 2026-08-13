---
type: Reference
title: "no-slop: Microsoft scannable content and global English"
description: "The Microsoft rules for headings, lists, tables, and worldwide readers, and where the global tips meet the STE rules already in the skill."
tags: [writing, style, house-style, global-english]
generated: { by: claude-code/claude-fable-5, at: 2026-08-08T00:00:00Z }
sources:
  - id: ms-scannable
    resource: https://learn.microsoft.com/en-us/style-guide/scannable-content/
    title: "Scannable content"
  - id: ms-headings
    resource: https://learn.microsoft.com/en-us/style-guide/scannable-content/headings
    title: "Headings"
  - id: ms-lists
    resource: https://learn.microsoft.com/en-us/style-guide/scannable-content/lists
    title: "Lists"
  - id: ms-tables
    resource: https://learn.microsoft.com/en-us/style-guide/scannable-content/tables
    title: "Tables"
  - id: ms-global
    resource: https://learn.microsoft.com/en-us/style-guide/global-communications/
    title: "Global communications"
  - id: ms-global-tips
    resource: https://learn.microsoft.com/en-us/style-guide/global-communications/writing-tips
    title: "Writing tips for global communications"
---

# no-slop: Microsoft scannable content and global English

Verdicts as elsewhere. **adopt** applies in every mode, **house** in house-style mode only, **reject** names the conflict.

## Already carried

- Sentence-case headings, no heading end punctuation, headings only where a reader jumps. Carried by [formatting.md](../formatting.md).
- Numbered lists for sequence, bullets for unordered sets. Carried by the SKILL.md tells table.
- Parallel structure in list items. Carried by [inclusive-and-accessible.md](../inclusive-and-accessible.md).
- Lead with the point and front-load what matters. Carried by SKILL.md passes 1 and 2 and [structure.md](../structure.md).
- Short paragraphs, one topic each. Carried by [ste.md](../ste.md).
- The list-versus-prose boundary. Carried by SKILL.md pass 2 and [formatting.md](../formatting.md).

## Headings. Verdict, adopt

From the headings page.[^ms-headings] Parallel structure at each heading level. Never two headings in a row with no text between, that signals redundant structure. Add subheads only when at least two distinct subtopics exist. Put the most important word first and get more specific as levels descend. No ampersands or plus signs in headings.

**house.** Infinitive task headings ("To create a heading"), question headings, the vs. abbreviation, and run-in bold headings. Run-ins collide with the [formatting.md](../formatting.md) bold discipline, so they stay confined to house docs that already use Note and Tip callouts.[^ms-headings]

## Lists. Verdict, adopt

From the lists page.[^ms-lists] Two to seven items, each short enough that two or three fit in one glance. Introduce a list with a sentence or fragment ending in a colon, and add no intro text after a heading that already introduces it. No semicolons, commas, or trailing conjunctions on items. Periods only when items are complete sentences, none when every item is three words or fewer or is a label. Avoid items that grammatically complete an introductory fragment, they are hard to translate.

**house.** Term lists, the bold term followed by a period and a definition. This is the exact shape [formatting.md](../formatting.md) flags as the signature LLM list. The boundary is real content. A genuine glossary of statuses or terms earns the form in house mode. A feature list wearing bold labels is still slop in every mode.[^ms-lists]

## Tables. Verdict, adopt

From the tables page.[^ms-tables] Use a table only when rows have two or more attributes, a one-attribute set is a list. Put the identifying entry in the leftmost column. Keep entries within a column parallel. Make column headers precise, "Group" or "Employee" rather than "Name". Never leave a cell blank or fill it with an em dash, write None or Not applicable. Do not build rows where header plus cell forms a sentence, it breaks localization.

**house.** Repeating or fixed header rows and responsive column budgets, which are publishing plumbing. The intro-sentence-ends-with-a-period detail.

**reject.** The overview's F-pattern advice to place "an offer or a Buy or Download button" in the hot corner. That optimizes for conversion, not comprehension, and the register has no offers to place. The front-loading half of the same advice is already carried.[^ms-scannable]

## Global English tips

These tips target translators and non-native readers, the same audience ASD-STE100 was built for, so the overlap with [ste.md](../ste.md) is large.[^ms-global]

Where the two agree, carried by [ste.md](../ste.md). Short simple sentences. One word per concept and one concept per word, in both directions. Active voice, imperative in procedures, standard subject-verb-object order. Keep the articles. Plain verbs over idioms and phrasal verbs, and no culture-bound expressions.

What the global tips add. Verdict, adopt.[^ms-global-tips]

- Keep "that" and "who". Eliding the relative pronoun hides the sentence structure from a translator and a tired reader alike.
- Avoid modifier stacks. Unwind "well thought-out Windows migration project plan" into clauses.
- Keep modifiers beside the words they modify, and place "only" with care.
- Coordinate at most two, never more than three, phrases or clauses per sentence.
- Watch words in -ing and -ed whose role is ambiguous. Add a determiner, add a form of be, or split the sentence.
- Limit sentence fragments.
- Give short headings and labels a verb when meaning needs one, "Access is denied" over "Access denied".

**house.** The instruction to balance a friendly voice with clarity. Warmth belongs to the house, and [microsoft-style.md](../microsoft-style.md) already rules on that conflict.

[^ms-scannable]: Scannable content, overview.
[^ms-headings]: Headings.
[^ms-lists]: Lists.
[^ms-tables]: Tables.
[^ms-global]: Global communications, overview.
[^ms-global-tips]: Writing tips.
