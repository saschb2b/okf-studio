---
type: Reference
title: "no-slop: Microsoft word choice"
description: "The word-choice rules no-slop takes from the Microsoft Writing Style Guide, the prescribed word swaps that overlap the anti-slop mission, and a verdict per rule cluster."
tags: [writing, style, house-style, word-choice]
generated: { by: claude-code/claude-fable-5, at: 2026-08-08T00:00:00Z }
sources:
  - id: ms-word-choice
    resource: https://learn.microsoft.com/en-us/style-guide/word-choice/
    title: "Word choice"
  - id: ms-contractions
    resource: https://learn.microsoft.com/en-us/style-guide/word-choice/use-contractions
    title: "Use contractions"
  - id: ms-simple
    resource: https://learn.microsoft.com/en-us/style-guide/word-choice/use-simple-words-concise-sentences
    title: "Use simple words, concise sentences"
  - id: ms-new-ways
    resource: https://learn.microsoft.com/en-us/style-guide/word-choice/dont-use-common-words-in-new-ways
    title: "Don't use common words in new ways"
  - id: ms-tech-terms
    resource: https://learn.microsoft.com/en-us/style-guide/word-choice/use-technical-terms-carefully
    title: "Use technical terms carefully"
  - id: ms-jargon
    resource: https://learn.microsoft.com/en-us/style-guide/word-choice/avoid-jargon
    title: "Avoid jargon"
  - id: ms-spelling
    resource: https://learn.microsoft.com/en-us/style-guide/word-choice/use-us-spelling-avoid-non-english-words
    title: "Use US spelling and avoid non-English words"
  - id: ms-leverage
    resource: https://learn.microsoft.com/en-us/style-guide/a-z-word-list-term-collections/l/leverage
    title: "leverage"
  - id: ms-please
    resource: https://learn.microsoft.com/en-us/style-guide/a-z-word-list-term-collections/p/please
    title: "please"
---

# no-slop: Microsoft word choice

Pick the simple word with one clear meaning, use it the same way every time, and cut every word that adds nothing. Microsoft's word-choice section reaches the anti-slop position from readability, and most of it is adopt. Verdicts follow [microsoft-style.md](../microsoft-style.md). **adopt** applies in every mode, **house** in house-style mode only, **reject** conflicts, **carried** already lives elsewhere in the skill.

Already carried, do not re-learn from this page. "If you mean the same thing, use the same word"[^ms-word-choice] is the one-name-for-one-thing rule ([ste.md](../ste.md), noted in [microsoft-style.md](../microsoft-style.md)). The plain-word substitutions (the SKILL.md pass 3 table). Business and marketing jargon such as leverage[^ms-jargon] (the SKILL.md slop vocabulary tell). The contractions policy itself, required by Microsoft, expanded in strict, permitted in flavored (the SKILL.md modes, conflict table in [microsoft-style.md](../microsoft-style.md)).

## Prescribed word swaps

The swaps Microsoft mandates that overlap the anti-slop mission. Several duplicate a SKILL.md pass 3 row, listed here with their Microsoft source so the rule can be cited into a house that follows this guide. The source column keys into the sources list above.

| Write this | Not this | Source |
|---|---|---|
| use | utilize, make use of | `ms-simple` |
| use, take advantage of | leverage as a verb | `ms-leverage` |
| to | in order to, as a means to | `ms-simple` |
| also | in addition | `ms-simple` |
| connect | establish connectivity | `ms-simple` |
| remove | extract, take away, eliminate | `ms-simple` |
| tell | inform, let know | `ms-simple` |
| because | since, when the meaning is causal | `ms-simple` |
| affect performance | impact performance | `ms-new-ways` |
| respond to the request | respond to the ask | `ms-new-ways` |
| copy | rip, when copy is what you mean | `ms-tech-terms` |
| nothing, just give the instruction | please, unless the ask is inconvenient or the software is at fault | `ms-please` |
| nothing | quite, very, quickly, easily, effectively, when they add no meaning | `ms-simple` |
| for example | e.g. | `ms-spelling` |
| that is | i.e. | `ms-spelling` |
| namely | viz. | `ms-spelling` |
| therefore | ergo | `ms-spelling` |

Verdict for the whole table, adopt. The "please" and "easily" rows are the sharpest additions. Politeness padding and effortlessness claims are both slop the SKILL.md does not yet name this precisely.

## Contraction mechanics

These apply wherever contractions are permitted at all, so they are adopt even though the policy itself is carried. Never contract a noun with a verb ("Microsoft's developing"). Avoid ambiguous or awkward forms (there'd, it'll, they'd). Do not mix a contraction with its spelled-out form in the same text.[^ms-contractions] The stated goal, a friendly and informal tone, is the house motivation the register declines, house.

## Precision rules

| Rule | Verdict |
|---|---|
| Prefer a verb with precise meaning over weak be, have, make, do[^ms-simple] | adopt, with a boundary. STE's approved list keeps short common verbs (make sure, get). Take the sharper verb when one exists, never a fancier one. |
| Words that are both noun and verb (file, post, record, screen) need disambiguating context[^ms-simple] | adopt |
| Do not invent words (bucketize) or assign new meanings (graveyard for archive)[^ms-new-ways] | adopt |
| Do not verb nouns or noun verbs (the ask, get the download)[^ms-new-ways] | adopt |
| Use the everyday term over the technical one, define a required technical term in context, use the words a professional audience uses[^ms-tech-terms] | adopt |
| Jargon tests, if you think it is jargon it is, if a reviewer questions it it may be, spell out acronyms[^ms-jargon] | adopt as a quick self-check |
| Research emerging terms across analyst and press sites before adopting them[^ms-tech-terms] | reject, corporate terminology process, not a register rule |
| US spelling (license, not licence)[^ms-spelling] | house, match the destination's locale, do not repaint a British repo |
| Avoid non-English phrases (de facto, ad hoc) and Latin abbreviations, etc. only where space is tight[^ms-spelling] | adopt, plain English over borrowed polish |

[^ms-word-choice]: Word choice, overview.
[^ms-contractions]: Use contractions.
[^ms-simple]: Use simple words, concise sentences.
[^ms-new-ways]: Don't use common words in new ways.
[^ms-tech-terms]: Use technical terms carefully.
[^ms-jargon]: Avoid jargon.
[^ms-spelling]: Use US spelling and avoid non-English words.
