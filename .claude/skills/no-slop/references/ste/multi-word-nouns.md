---
type: Reference
title: "no-slop: STE multi-word nouns"
description: "The STE cap of three words per noun cluster and the two repair methods, a rule generated prose breaks constantly with stacked modifier chains."
tags: [writing, controlled-language, ste, noun-clusters]
generated: { by: claude-code/claude-fable-5, at: 2026-08-08T00:00:00Z }
sources:
  - id: ste9
    resource: https://www.asd-ste100.org/assets/files/ASD-STE100_ISSUE9.pdf
    title: "ASD-STE100 Simplified Technical English, Issue 9 (2025-01-15)"
---

# no-slop: STE multi-word nouns

Section 2 of the standard, two rules.[^ste9] Generated prose stacks nouns and modifiers into chains ("well thought-out Windows migration project plan"), so this is one of the highest-value STE sections the skill did not carry until now. The Microsoft global-English tips flag the same defect from the translation side ([../microsoft/scannable-and-global.md](../microsoft/scannable-and-global.md)).

## Rule 2.1, no more than three words per noun cluster

A long cluster is ambiguous because the head noun usually sits last, the internal connections are unstated, and readers whose native language puts the head noun first parse it backward.[^ste9] Repair it by unpacking with prepositions (of, on, in, for) or a relative clause:

| Before | After |
|---|---|
| runway light connection resistance calibration | calibration of the resistance of the runway light connection |
| Remove the engine transmission housing attachment bolts. | Remove the bolts that attach the transmission housing to the engine. |

The unpacked form is longer and clearer. Concision that hides structure is not concision, the same trade [ste.md](../ste.md) makes when it keeps the articles.

## Rule 2.2, when an official name is longer than three words

A technical noun you cannot rename (an official part name) gets written in full once, then either of two repairs:[^ste9]

1. Introduce a shorter form or the official abbreviation, then use that.
2. Hyphenate the words that operate as one unit so the cluster counts as three or fewer units ("main-gear-door retraction-winch handle").

Guardrails: never hyphenate unrelated words, never build a hyphen group of more than three units, never shorten or hyphenate a name that is already within the cap, and never remove a hyphen the official name carries. And do not swing into abbreviation soup, "Remove the diaphragm assembly (8)" reads better than "Remove the DA (8)".[^ste9]

## Outside strict mode

The three-word cap is a strict-mode rule. The instinct applies everywhere: when a noun phrase needs three modifiers, the sentence is hiding relationships that prepositions or a clause would state. Unpack it before reaching for any word-level fix.

[^ste9]: ASD-STE100 Issue 9, section 2.
