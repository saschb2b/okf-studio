---
type: Reference
title: "no-slop: Microsoft punctuation"
description: "Punctuation mechanics distilled from the Microsoft Writing Style Guide, each cluster judged as adopted into the register, house-style-only, or rejected."
tags: [writing, style, house-style, punctuation]
generated: { by: claude-code/claude-fable-5, at: 2026-08-08T00:00:00Z }
sources:
  - { id: ms-punct, resource: "https://learn.microsoft.com/en-us/style-guide/punctuation/", title: "Punctuation" }
  - { id: ms-fmt, resource: "https://learn.microsoft.com/en-us/style-guide/punctuation/formatting-punctuation", title: "Formatting punctuation" }
  - { id: ms-apos, resource: "https://learn.microsoft.com/en-us/style-guide/punctuation/apostrophes", title: "Apostrophes" }
  - { id: ms-colons, resource: "https://learn.microsoft.com/en-us/style-guide/punctuation/colons", title: "Colons" }
  - { id: ms-commas, resource: "https://learn.microsoft.com/en-us/style-guide/punctuation/commas", title: "Commas" }
  - { id: ms-dashes, resource: "https://learn.microsoft.com/en-us/style-guide/punctuation/dashes-hyphens/", title: "Em dashes, en dashes, hyphens, and minus signs" }
  - { id: ms-hyphens, resource: "https://learn.microsoft.com/en-us/style-guide/punctuation/dashes-hyphens/hyphens", title: "Hyphens" }
  - { id: ms-ellipses, resource: "https://learn.microsoft.com/en-us/style-guide/punctuation/ellipses", title: "Ellipses" }
  - { id: ms-exclam, resource: "https://learn.microsoft.com/en-us/style-guide/punctuation/exclamation-points", title: "Exclamation points" }
  - { id: ms-periods, resource: "https://learn.microsoft.com/en-us/style-guide/punctuation/periods", title: "Periods" }
  - { id: ms-quest, resource: "https://learn.microsoft.com/en-us/style-guide/punctuation/question-marks", title: "Question marks" }
  - { id: ms-quotes, resource: "https://learn.microsoft.com/en-us/style-guide/punctuation/quotation-marks", title: "Quotation marks" }
  - { id: ms-semi, resource: "https://learn.microsoft.com/en-us/style-guide/punctuation/semicolons", title: "Semicolons" }
  - { id: ms-slashes, resource: "https://learn.microsoft.com/en-us/style-guide/punctuation/slashes", title: "Slashes" }
---

# no-slop: Microsoft punctuation

The punctuation mechanics no-slop takes from the Microsoft guide, cluster by cluster. Verdicts: **adopt** applies in every mode, **house** applies only in house-style mode, **reject** conflicts with the register. The three brand-voice conflicts and the adopted basics live in [microsoft-style.md](../microsoft-style.md).

## The governing rule

**Adopt.** Punctuation load measures sentence complexity. More than a comma or two plus end punctuation means the sentence wants a rewrite, and the same instinct drives the STE sentence cap in [ste.md](../ste.md).[^ms-punct]

## Periods

**Adopt.** One space after a period and no period on a heading are already carried ([microsoft-style.md](../microsoft-style.md), [formatting.md](../formatting.md)). New here:[^ms-periods]

| Rule | Write this | Not this |
|---|---|---|
| End every sentence with a period, even a two-word one | Be brief. | Be brief (no end punctuation) |
| No periods on list items of three or fewer words | Installed apps | Installed apps. |
| Period on every item once any item is a full sentence, or completes the intro phrase | all items end with periods | a mix of punctuated and bare items |

## Commas

**Adopt.** The serial comma is already carried ([microsoft-style.md](../microsoft-style.md)).[^ms-commas]

| Rule | Write this | Not this |
|---|---|---|
| Comma after an introductory phrase | With the CLI, you can script it. | With the CLI you can script it. |
| Comma before the conjunction joining independent clauses, or better, two sentences | Select Options, and then select Save. | Select Options and then select Save. |
| No comma splice | two sentences | Select Options, then select Save. |
| No comma inside a compound predicate | The tool scans the disk and then reports. | The tool scans the disk, and then reports. |
| Comma between reversible adjectives before a noun | a small, fast parser | a small fast parser |
| Commas around the year in a full date, none between bare month and year | the February 4, 2015, issue | the February, 2015 issue |

Microsoft fixes a comma splice with a semicolon. The register does not: write two sentences ([ste.md](../ste.md) bans the semicolon).

## Colons

**Adopt** the sentence-level rules, **house** the title pattern.[^ms-colons]

| Rule | Verdict |
|---|---|
| Avoid a mid-sentence amplifying colon. Rephrase, split, or use a list | adopt |
| Lowercase after a colon inside a sentence, unless proper noun | adopt |
| Colon before a list only when the intro points at it ("the following", a count). A full-sentence intro without that pointer takes a period | adopt |
| A fragment intro takes a colon only if an item completes it as a sentence, else no punctuation | adopt |
| No colon at the end of a heading | carried already ([formatting.md](../formatting.md)) |
| Colon inside a title as title-plus-subtitle, capitalize after it | house |
| Period, never a colon, before an image, table, or code sample | house |

## Semicolons

**Reject the permitted uses, keep the instinct.** Microsoft itself says to simplify the sentence until the semicolon disappears, then allows three uses (unjoined clauses, contrasting statements, complex series).[^ms-semi] The register keeps only the first half. [ste.md](../ste.md) bans semicolons outright: write two sentences or break the series into a list.

## Dashes, hyphens, minus signs

The em dash is **rejected**, already carried as a tell and argued in [microsoft-style.md](../microsoft-style.md). The en dash in ranges and open compounds ("Windows 10–compatible") is **house**: in register prose use a hyphen or the word "to". **Adopt** the minus sign rule: a real minus sign for negatives and subtraction, never an en dash, for accessibility.[^ms-dashes]

**Adopt** the hyphen cluster:[^ms-hyphens]

| Rule | Write this | Not this |
|---|---|---|
| Hyphenate a compound modifier before its noun | left-aligned text, read-only memory | left aligned text |
| No hyphen after an -ly adverb or "very" | highly graphical interface | highly-graphical interface |
| No hyphen on a predicate adjective | the text is left aligned | the text is left-aligned |
| Spell out instead of suspending compounds | upper-right or lower-right corner | upper- and lower-right corner |
| Prefixes attach solid unless confusion or a capital follows | reenter, subprocess, non-XML, re-sign | re-enter, non-security related |

A prefix modifies a word, never a phrase: write "unrelated to security", never "non-security related".

## Quotation marks

**Adopt**: quotation marks mark quotations only, double by default, single only inside double. Straight quotes are already carried ([formatting.md](../formatting.md)). **House**: the American placement, commas and periods inside the closing quote, other punctuation outside unless quoted.[^ms-quotes]

## Ellipses, exclamation points, question marks

**Adopt.** No ellipsis except to mark omitted text in a quotation (spaced on both sides mid-sentence) or omitted code, and never echo a UI label's ellipsis in instructions.[^ms-ellipses] Exclamation points sparingly per Microsoft.[^ms-exclam] The register goes further: effectively never, enthusiasm is the thing it declines. Questions sparingly, the reader wants answers. A question earns its mark only at a real decision point.[^ms-quest] **Reject** the ellipsis-as-pause allowance for conversational UI. That pause is chatbot warmth, a tell.

## Apostrophes

**Adopt**:[^ms-apos] singular possessive adds 's even after s, x, or z (the CSS's flexibility). Plural ending in s adds only the apostrophe (users' passwords). "Its" is the possessive, "it's" the contraction. Never an apostrophe for a plural.

## Slashes

**Adopt**:[^ms-slashes] never a slash as "or" (write "product or service"). Established pairs are fine (client/server, TCP/IP). When telling a reader to type one, spell it out first: "enter two backslashes (\\)". Capitalize after a slash only if the word before it is capitalized.

## Punctuation around formatted text

**Adopt**:[^ms-fmt] punctuation takes the style of the sentence, not of the bold or linked element it touches, unless the reader must type the punctuation. Parentheses and brackets always match the main text, and open and close marks match each other.

[^ms-punct]: Punctuation overview.
[^ms-periods]: Periods.
[^ms-commas]: Commas.
[^ms-colons]: Colons.
[^ms-semi]: Semicolons.
[^ms-dashes]: Em dashes, en dashes, hyphens, and minus signs.
[^ms-hyphens]: Hyphens.
[^ms-quotes]: Quotation marks.
[^ms-ellipses]: Ellipses.
[^ms-exclam]: Exclamation points.
[^ms-quest]: Question marks.
[^ms-apos]: Apostrophes.
[^ms-slashes]: Slashes.
[^ms-fmt]: Formatting punctuation.
