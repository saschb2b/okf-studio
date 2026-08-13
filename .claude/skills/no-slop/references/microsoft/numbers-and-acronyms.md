---
type: Reference
title: "no-slop: Microsoft numbers and acronyms"
description: "The Microsoft rules for writing numbers and acronyms, adopted where they sharpen precision and rejected where they need an en dash."
tags: [writing, style, house-style, mechanics]
generated: { by: claude-code/claude-fable-5, at: 2026-08-08T00:00:00Z }
sources:
  - id: ms-numbers
    resource: https://learn.microsoft.com/en-us/style-guide/numbers
    title: "Numbers"
  - id: ms-acronyms
    resource: https://learn.microsoft.com/en-us/style-guide/acronyms
    title: "Acronyms"
---

# no-slop: Microsoft numbers and acronyms

no-slop had no number or acronym rules before this page, so most of what follows is new rather than carried. Verdicts as elsewhere. **adopt** applies in every mode, **house** in house-style mode only, **reject** names the conflict.

## Numbers. Verdict, adopt

All from the numbers page.[^ms-numbers]

| Rule | Write this | Not this |
|---|---|---|
| Spell zero through nine, numerals from 10 | five databases, 10 screen savers | 5 databases |
| One numeral forces numerals for the set | 16 pages, 7 pages, and 5 pages | 16 pages and seven pages |
| Never open a sentence with a numeral | Eleven apps are included. | 11 apps are included. |
| Numerals for measurements, money, percentages, and entered values | 3 cm, enter **5** | three centimeters |
| Spell million and billion, no K, M, B | 7 million, 65,000 people | 7M, 65K people |
| Commas from four digits | 1,024 | 1024 in body text |
| Ordinals in words, never with -ly | the first row | the 1st row, firstly |
| Hyphenate spelled-out compounds and fractions | twenty-five, two-thirds | twenty five |
| Leading zero on decimals under one | 0.5 cm | .5 cm |
| Spell the month in dates | June 12, 2017 | 6/12/2017 |

The date rule exists because day and month order varies by country. ISO 8601 (2017-06-12), this repo's convention, resolves the same ambiguity and also satisfies the intent.

## Numbers, house and rejected

- **house.** Numerals for zero through nine where space is tight (tables, UI). The adjacent-number split ("fifteen 20-page articles"). Noon and midnight instead of 12:00. Spelling out "percent" with the numeral, since technical docs normally use the % sign. Phone-number formatting is US-specific trivia and is skipped.[^ms-numbers]
- **reject.** The en dash for page and year ranges, and the en dash anywhere near a minus sign. The register bans en dashes outright. Write "from 2016 through 2020" in prose and a plain hyphen in a cramped table cell, and use a real minus sign for negatives.[^ms-numbers]

## Acronyms. Verdict, adopt

All from the acronyms page.[^ms-acronyms]

- Use only acronyms the audience already knows. When unsure, spell the term.
- First mention gives the spelled-out term with the acronym in parentheses. After that, the acronym alone.
- Do not expand household acronyms (USB, URL, API, FAQ).
- An acronym used once is never introduced. Spell the term and move on.
- Do not debut an acronym in a title or heading. Introduce it in the body text below.
- Lowercase the spelled-out form except proper nouns, as in dynamic-link library (DLL).
- Pick a or an by pronunciation. A URL, an ISP, a SQL database.
- Pluralize with a lowercase s (three APIs). No s when the term is already plural.
- Avoid the possessive unless the acronym names a person or organization.
- Do not coin acronyms, and never from product or feature names.

These rules serve the same reader as the [ste.md](../ste.md) one-meaning-per-word rule. An unexplained acronym is a word with a private meaning. The global tips in [scannable-and-global.md](scannable-and-global.md) point at the same discipline from the translation side, since an unexpanded acronym like RAM can machine-translate as the common word.

## Acronyms, house

The SEO exception, keeping both the spelled-out term and a once-used acronym because search demands it, is a destination concern. Apply it only where search terms genuinely rule the page.[^ms-acronyms]

[^ms-numbers]: Numbers.
[^ms-acronyms]: Acronyms.
