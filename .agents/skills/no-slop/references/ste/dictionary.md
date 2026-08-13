---
type: Reference
title: "no-slop: the STE dictionary and word rules"
description: "How the ASD-STE100 controlled dictionary works, the word rules of section 1, the technical noun and verb allowances, and the writing practices of section 9."
tags: [writing, controlled-language, ste, dictionary]
generated: { by: claude-code/claude-fable-5, at: 2026-08-08T00:00:00Z }
sources:
  - id: ste9
    resource: https://www.asd-ste100.org/assets/files/ASD-STE100_ISSUE9.pdf
    title: "ASD-STE100 Simplified Technical English, Issue 9 (2025-01-15)"
  - id: ste-about
    resource: https://asd-ste100.org/about_STE.html
    title: "About STE, official site"
  - id: ceur-issue9
    resource: https://ceur-ws.org/Vol-3990/short24.pdf
    title: "Zambrini and Chiarello, From Specification to Standard, MDTT 2025"
---

# no-slop: the STE dictionary and word rules

Part 2 of ASD-STE100 is a controlled dictionary. Issue 9 counts 875 approved words and 1,274 unapproved words with approved alternatives.[^ste9] The public summaries round these to about 900 and about 1,200. The guiding principle is one word, one meaning, one part of speech, with a handful of documented exceptions such as "flush" (verb, to clean with a flow of liquid, and adjective, level surfaces).[^ste9]

The skill does not lock prose to the dictionary outside strict mode ([ste.md](../ste.md), the modes table). This page is for strict mode, for understanding why the word rules look the way they do, and for the discipline worth borrowing in any mode: restricted meanings and named allowances beat an open vocabulary.

## How an entry works

Approved words appear in uppercase with one approved meaning and the permitted verb forms or adjective comparisons. Unapproved words appear in lowercase with one or more approved alternatives, an STE example, and a non-STE example.[^ste9] The alternative is either a plainer near-synonym or a rebuilt construction. Illustrative pairs:

| Unapproved | Approved alternative |
|---|---|
| follow (meaning obey) | OBEY, while FOLLOW stays approved as "to come after" |
| ensure | MAKE SURE |
| fit | INSTALL |
| however | BUT |
| insert | PUT |
| main | PRIMARY |
| may | CAN |
| wear (clothing) | PUT ON, since "wear" is approved only as damage by friction |

## Section 1, the word rules

Fourteen rules.[^ste9] The load-bearing ones: use only approved words, technical nouns, or technical verbs (1.1). Use each approved word only as its listed part of speech (1.2) and only with its approved meaning (1.3). Do not use different technical nouns for the same item (1.11), which is the one-name-for-one-thing rule in [ste.md](../ste.md). Do not verb a technical noun, write "put clamps on the cable", not "clamp the cable" (1.7), and do not noun a technical verb (1.13). Pick technical nouns that are short and free of slang (1.9, 1.10). American English spelling per Merriam-Webster (1.14).

## Technical nouns and technical verbs

The dictionary deliberately excludes domain terms. A word outside the dictionary is legal when it fits a technical noun category (rule 1.5, 22 categories in Issue 9) or a technical verb category (rule 1.12, 4 categories).[^ste9] The categories cover parts, tools, materials, systems, math and science, navigation, units, quoted label text, roles and organizations, body parts, medical terms, documents, conditions, colors, damage terms, computing (Issue 9 examples include large language model, prompt engineering, token), operations, and the two Issue 9 additions, law and regulations, and animals and plants.[^ste9] Technical verbs split into manufacturing processes (drill, weld, anneal), computer processes (click, boot, download), subject-field instructions (taxi, hover), and law (comply with, waive).[^ste9]

The discipline that carries over to any register: prefer an approved plain verb when it expresses the action ("find broken wires", not "detect"), and prefer verb plus noun over a verbed noun ("apply grease", not "grease the fasteners").[^ste9]

## Section 9, writing practices

Four rules and eight general recommendations.[^ste9]

- 9.1. When a one-word swap does not work, rebuild the sentence. "Must be visible" becomes "make sure that you can see".
- 9.2. Check the approved meaning before using an approved word, since STE meanings are narrower than standard English.
- 9.3. No phrasal verbs built from approved words. "Put out the fire" becomes "extinguish". This is the plain-verb-over-phrasal row in [ste.md](../ste.md).
- 9.4. For a recurring statement, pick one wording and reuse it verbatim.

The general recommendations (GR-1 to GR-8) are explicitly not rules. The useful ones anywhere: keep "that" after verbs like make sure and show (GR-1, also a Microsoft global-English tip in [../microsoft/scannable-and-global.md](../microsoft/scannable-and-global.md)), restate the referent when "this" could point at two things (GR-4), and write English words instead of Latin abbreviations (GR-6). Issue 9 added GR-7, inclusive language, which meets the skill's [inclusive-and-accessible.md](../inclusive-and-accessible.md) from the aerospace side, and GR-8, the possessive form, permitted only when you are sure it is correct.[^ste9][^ceur-issue9]

## Issue 9 in one paragraph

Issue 9 (2025-01-15) reclassified STE from specification to standard, renamed "technical name" to "technical noun" for ISO 1087 alignment, added the two technical noun categories and the law technical verb category, added GR-7 and GR-8, revised the word-count rules (a number with its unit counts as one word, proper nouns count as one word), and updated 555 dictionary entries.[^ste9][^ste-about][^ceur-issue9] Issue 10 is scheduled for 2028 per the CEUR paper, a secondary source.[^ceur-issue9]

[^ste9]: ASD-STE100 Issue 9, the standard itself.
[^ste-about]: About STE, official site.
[^ceur-issue9]: Zambrini and Chiarello, MDTT 2025, by STEMG members.
