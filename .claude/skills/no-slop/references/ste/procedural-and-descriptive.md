---
type: Reference
title: "no-slop: STE procedural and descriptive writing"
description: "The verb, sentence, and paragraph rules of STE sections 3 to 6, and the exact split between procedural and descriptive writing that the skill's strict and flavored modes descend from."
tags: [writing, controlled-language, ste, procedures]
generated: { by: claude-code/claude-fable-5, at: 2026-08-08T00:00:00Z }
sources:
  - id: ste9
    resource: https://www.asd-ste100.org/assets/files/ASD-STE100_ISSUE9.pdf
    title: "ASD-STE100 Simplified Technical English, Issue 9 (2025-01-15)"
---

# no-slop: STE procedural and descriptive writing

Sections 3 to 6 of the standard, 23 rules.[^ste9] This page carries the exact rules behind the mechanical subset in [ste.md](../ste.md) and the split that the skill's strict and flavored modes descend from.

## Section 3, verbs

Seven rules.[^ste9] The core is rule 3.2: only six verb forms exist in STE. Infinitive, imperative, simple present, simple past, simple future, and the past participle as an adjective only. Perfect tenses are banned ("have adjusted", "had adjusted"). Rule 3.4 bans auxiliary constructions, so "must be adjusted" and "is to be installed" become an imperative or an active sentence. Rule 3.5 bans -ing verb forms; the dictionary's own -ing words are exhaustively lighting, opening, routing, servicing, mating, missing, remaining, something, and during. Rule 3.6 requires active voice, with one scoped exception: descriptive writing may use passive when the agent is unknown. Rule 3.7 is the anti-nominalization rule, describe an action with a verb, not a noun.

The [ste.md](../ste.md) rows "simple tense over progressive", "no stacked auxiliaries", and "one verb per action" are rules 3.5, 3.4, and 3.7 respectively.

## Section 4, sentences

Five rules that apply to both writing types.[^ste9] Write short, clear sentences (4.1). Do not omit words or contract to get under a cap, telegraphic style is banned (4.2), which is why [ste.md](../ste.md) keeps the articles. Turn complex text into a vertical list (4.3). Link related sentences with approved connectors, and, but, then, thus, as a result (4.4). Keep articles and demonstratives before nouns (4.5, moved from section 2 in Issue 9).

## Sections 5 and 6, the split

| | Procedural (section 5) | Descriptive (section 6) |
|---|---|---|
| Job of the text | tells the reader to act | gives information |
| Sentence cap | 20 words (5.1) | 25 words (6.3) |
| Mood | imperative commands (5.3) | imperative not permitted |
| Passive | never | allowed when the agent is unknown (3.6) |
| Structure | numbered steps for sequence | paragraphs with a topic sentence (6.4) |
| Paragraph rules | none, steps carry the order | one topic, topic sentence first, six sentences maximum (6.4 to 6.6) |

Two refinements the skill's summary rows did not carry:

- **5.2.** One instruction per sentence, except when two or more actions genuinely happen at the same time. Simultaneity is the one licensed compound.
- **5.4.** Condition before command, divided by a comma, and the comma placement can flip the meaning. "When the pump does not operate correctly, disconnect it" says something different from "When the pump does not operate, correctly disconnect it."[^ste9]
- **5.5.** A note gives information only, never an instruction, requirement, or limit. A note is descriptive text inside a procedure, so its sentences take the 25-word cap.

The paragraph discipline (one topic, six sentences, topic sentence first) is a descriptive-writing construct, not a general one. The skill generalizes it to prose because a README or doc is descriptive writing in STE's sense. The topic-sentence rule (6.4) is the "first sentence carries the point" rule in the SKILL.md pass 2 and in [structure.md](../structure.md).

## What the modes take from this

Strict mode is the procedural rule set applied whole. Flavored mode is the descriptive rule set with the dictionary unlocked. That mapping is stated in [ste.md](../ste.md); this page is where each number comes from.

[^ste9]: ASD-STE100 Issue 9, sections 3 to 6.
