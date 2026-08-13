---
type: Reference
title: "no-slop: STE safety instructions and word counts"
description: "The warning, caution, and note structure of STE section 7 and the punctuation and word-count mechanics of section 8, including the semicolon ban and the parentheses whitelist."
tags: [writing, controlled-language, ste, safety-text]
generated: { by: claude-code/claude-fable-5, at: 2026-08-08T00:00:00Z }
sources:
  - id: ste9
    resource: https://www.asd-ste100.org/assets/files/ASD-STE100_ISSUE9.pdf
    title: "ASD-STE100 Simplified Technical English, Issue 9 (2025-01-15)"
---

# no-slop: STE safety instructions and word counts

Sections 7 and 8 of the standard, ten rules.[^ste9] Safety text is the surface where a misread sentence costs the most, and the word-count mechanics are what make the 20 and 25 word caps in [ste.md](../ste.md) checkable rather than vibes.

## Section 7, safety instructions

A **warning** flags a risk of injury or death. A **caution** flags a risk of damage to objects. A note is neither, it gives information only (rule 5.5 in [procedural-and-descriptive.md](procedural-and-descriptive.md)).[^ste9]

Three rules order the inside of a warning or caution:

1. **7.1.** Identify the risk level immediately with the applicable word or symbol.
2. **7.2.** Start with a clear command or condition, the reader must know how to prevent the accident before anything else.
3. **7.3.** Then explain the risk or the possible result.

So the shape is level, command, consequence: "WARNING. Do not breathe the vapor. Liquid oxygen can cause irritation of the respiratory tract." Warnings and cautions are procedural text, so the 20-word cap applies to each sentence (5.1). The standard sets no formatting, the all-caps in its examples is illustrative, and other domains may use danger, attention, or ISO 3864 symbols as long as the content keeps this order.[^ste9] Placing the warning before the step it guards comes from tech-pub specifications such as S1000D, not from STE, so do not cite STE for it.

The pattern generalizes to any breaking-change note or destructive-command callout in a README or runbook: name the severity, give the preventing action, then the consequence. The error-message shape in [code-strings.md](../code-strings.md), what failed and what to do, is the same construction.

## Section 8, punctuation and word counts

Seven rules.[^ste9]

- **8.1.** All standard punctuation is allowed except the semicolon, which enables the over-long sentence. Write two sentences. This is the origin of the ban in [ste.md](../ste.md) and the SKILL.md tells.
- **8.2.** Hyphens connect directly related words (see [multi-word-nouns.md](multi-word-nouns.md)).
- **8.3.** Parentheses have a whitelist of six uses: references to illustrations or text, item numbers on illustrations, work-step identifiers, abbreviations, singular and plural at once, and explaining a word or part of a sentence.
- **8.4 to 8.7.** The counting mechanics behind the caps. A colon before a vertical list ends the sentence for counting. Parenthetical text counts as one word of its host sentence, and its own words count as a separate sentence. Each of these counts as one word: a number, a number with its unit (an Issue 9 revision), an abbreviation, an alphanumeric identifier, quoted text, a title or heading or label text, a proper noun (added in Issue 9), and a hyphenated word ("soap-and-water solution" is one word).

The counting rules matter to the skill's linter: `slop-lint.mjs` approximates the caps by naive word count, so a sentence dense with part numbers or quoted labels can flag long while being STE-legal. Treat a cap flag on such a sentence as a prompt to count by the rules above, not as an automatic failure.

[^ste9]: ASD-STE100 Issue 9, sections 7 and 8.
