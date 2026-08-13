---
type: Reference
title: "no-slop: Microsoft capitalization"
description: "Capitalization rules distilled from the Microsoft Writing Style Guide, judged as adopted into the register or reserved for house-style destinations."
tags: [writing, style, house-style, capitalization]
generated: { by: claude-code/claude-fable-5, at: 2026-08-08T00:00:00Z }
sources:
  - { id: ms-caps, resource: "https://learn.microsoft.com/en-us/style-guide/capitalization", title: "Capitalization" }
  - { id: ms-hyphens, resource: "https://learn.microsoft.com/en-us/style-guide/punctuation/dashes-hyphens/hyphens", title: "Hyphens" }
---

# no-slop: Microsoft capitalization

One default and one exception. Sentence-style capitalization everywhere, title-style only when a destination demands it. Verdicts: **adopt** applies in every mode, **house** applies only in house-style mode.

## Sentence-style is the default

**Adopt.** Sentence-case headings are already carried ([formatting.md](../formatting.md), noted as an agreement in [microsoft-style.md](../microsoft-style.md)). The full rule set extends beyond headings:[^ms-caps]

| Rule | Write this | Not this |
|---|---|---|
| Capitalize the first word and proper nouns, lowercase everything else | Configure the build cache | Configure The Build Cache |
| Rewrite a sentence that would open with an always-lowercase word | The fdisk tool partitions the disk. | fdisk partitions the disk. |
| Lowercase the spelled-out form of an acronym unless it is a proper noun | central processing unit (CPU) | Central Processing Unit (CPU) |
| No internal capitals in invented words unless the brand spells it that way | autoscale | AutoScale |
| Keep a keyword's traditional case, even mid-sentence | grep, fdisk, JSON | Grep at sentence start (rewrite instead) |
| After a slash, capitalize only if the word before it is capitalized | Country/Region, on/off | Country/region |
| In a hyphenated compound, capitalize each part that would be capitalized unhyphenated | Customer-friendly content is brief. | Customer-Friendly content is brief. |

The hyphenated-compound row comes from the hyphens page.[^ms-hyphens]

## Caps as decoration

**Adopt.** Never all caps for emphasis, and never all lowercase as a design pose. Italic, sparingly, is the one sanctioned emphasis.[^ms-caps] This pairs with the emphasis rules in [formatting.md](../formatting.md): shouting and aesthetic lowercase are both decoration, and the register drops decoration.

## After a colon

Lowercase after a colon inside a sentence (**adopt**, see the colons section of [punctuation.md](punctuation.md)). Capitalize after a colon that splits a title into title and subtitle (**house**, the pattern itself is a Learn-style headline device).[^ms-caps]

## Title-style capitalization

**House.** The register never chooses title case. Use it only where the destination requires it: book and article titles in citations, blog names, people's titles, a house that mandates it. Microsoft's own rules for those occasions:[^ms-caps]

| Rule | Example |
|---|---|
| Capitalize the first and last words, always | The Teaching Tool You're Looking For |
| Lowercase a, an, the unless first | Microsoft on the Issues |
| Lowercase prepositions of four or fewer letters | How to Personalize Windows |
| Lowercase and, but, or, nor, yet, so unless first or last | Monitoring and Operating a Private Cloud |
| Capitalize everything else, including Is, Its, This, That | Enterprise Agility Is Not an Oxymoron |
| Capitalize after a hyphen if the part stands alone capitalized, or ends the title | Self-Paced Training, Essential Snap-Ins |

Skipped as product trivia: the branding rationale for reserving capitals, UI-label casing for specific products, and the tweet allowance.

[^ms-caps]: Capitalization.
[^ms-hyphens]: Hyphens.
