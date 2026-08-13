---
type: Reference
title: "no-slop: Microsoft grammar and person"
description: "The grammar and person rules no-slop takes from the Microsoft Writing Style Guide, with a verdict per rule cluster (adopt, house, reject, or already carried elsewhere in the skill)."
tags: [writing, style, house-style, grammar]
generated: { by: claude-code/claude-fable-5, at: 2026-08-08T00:00:00Z }
sources:
  - id: ms-grammar
    resource: https://learn.microsoft.com/en-us/style-guide/grammar/grammar-and-parts-of-speech
    title: "Grammar and parts of speech"
  - id: ms-verbs
    resource: https://learn.microsoft.com/en-us/style-guide/grammar/verbs
    title: "Verbs"
  - id: ms-person
    resource: https://learn.microsoft.com/en-us/style-guide/grammar/person
    title: "Person"
  - id: ms-nouns
    resource: https://learn.microsoft.com/en-us/style-guide/grammar/nouns-pronouns
    title: "Nouns and pronouns"
  - id: ms-ing
    resource: https://learn.microsoft.com/en-us/style-guide/grammar/ing-words
    title: "Words ending in -ing"
  - id: ms-prepositions
    resource: https://learn.microsoft.com/en-us/style-guide/grammar/prepositions
    title: "Prepositions"
  - id: ms-modifiers
    resource: https://learn.microsoft.com/en-us/style-guide/grammar/dangling-misplaced-modifiers
    title: "Dangling and misplaced modifiers"
---

# no-slop: Microsoft grammar and person

Write in present tense, indicative or imperative mood, second person, active voice, with every modifier next to the thing it modifies. That is the Microsoft grammar baseline, and most of it maps straight onto the register. Verdicts follow the frame set in [microsoft-style.md](../microsoft-style.md). **adopt** applies in every mode, **house** applies in house-style mode only, **reject** conflicts with the register, **carried** already lives in another file of this skill and is not restated here.

Already carried, do not re-learn from this page. Present tense and active voice with the actor named ([ste.md](../ste.md)). Sentence-case headings and capitalization mechanics ([formatting.md](../formatting.md), [capitalization.md](capitalization.md)). Gender-neutral pronoun guidance, which Microsoft delegates to its bias-free page ([inclusive-and-accessible.md](../inclusive-and-accessible.md)). Omitting a hollow "you can" (the SKILL.md tells, via [microsoft-style.md](../microsoft-style.md)).

## Verbs and mood

| Rule | Write this | Not this | Verdict |
|---|---|---|---|
| Indicative for statements, imperative for instructions, never mixed in one sentence[^ms-verbs] | Enter a file name, then save the file. | You should enter a file name, and the file is then saved. | adopt |
| No subjunctive for advice[^ms-verbs] | Be careful with email attachments. | We recommend that you be careful with email attachments. | adopt |
| Passive is permitted in an error to avoid blaming the reader[^ms-verbs] | That site can't be found. | You typed a bad address. | adopt, scoped to error strings (see [code-strings.md](../code-strings.md)) |
| A group noun takes a singular verb[^ms-verbs] | A variety of games is available. | A variety of games are available. | adopt |
| Singular subjects joined by "or" take a singular verb, mixed subjects match the closest one[^ms-verbs] | Your tablet or phone is all you need. | Your tablet or phone are all you need. | adopt |

## Person

| Rule | Write this | Not this | Verdict |
|---|---|---|---|
| Second person by default, speak to the reader[^ms-person] | Check if you have local admin rights. | Users should check whether they have local admin rights. | adopt |
| Avoid "we", write around the corporate speaker[^ms-person] | That didn't work. Try again. | We weren't able to run the checker. | adopt, it removes the daunting collective voice the register also declines |
| "We recommend" only as an escape from "it's recommended", and prefer neither[^ms-person] | Change your password. | It's recommended that you change your password. | adopt |
| "We" where the organization genuinely speaks (privacy, security commitments)[^ms-person] | We protect your privacy at every step. | This product protects your privacy. | adopt |
| First-person singular in UI labels that mark the reader's control[^ms-person] | Remember my password | Remember the user's password | house, it is a product-UI convention, not prose |

Microsoft motivates second person as a friendly, human tone.[^ms-person] no-slop keeps the mechanic and drops the motivation. Second person earns its place because it forces an actor and blocks passive voice.

## Nouns and pronouns

| Rule | Write this | Not this | Verdict |
|---|---|---|---|
| Default to lowercase, capitalize only true proper nouns[^ms-nouns] | cloud computing, open source | Cloud Computing, Open Source | adopt |
| Pluralize an abbreviation with a plain s[^ms-nouns] | ISVs, DBMSs | ISV's, DBMS's | adopt |
| No "(s)" optional plural, use the plural form[^ms-nouns] | Wait for x minutes. | Wait for x minute(s). | adopt |
| A collective noun takes a singular pronoun[^ms-nouns] | The company upgraded its storage. | The company upgraded their storage. | adopt |

## Modifiers, -ing words, prepositions

| Rule | Write this | Not this | Verdict |
|---|---|---|---|
| Make an -ing word's role unambiguous[^ms-ing] | How to meet the requirements | Meeting requirements | adopt, sharpest in headings |
| Place a modifier next to what it modifies[^ms-modifiers] | Only the selected text is deleted. | The selected text only is deleted. | adopt |
| No more than two chained prepositional phrases[^ms-prepositions] | the content of the message | the content of the body of the text of the message | adopt |
| Ending a sentence with a preposition is fine when it reads better[^ms-prepositions] | the environment your application runs in | the environment in which your application runs | adopt, forced formality is its own tell |
| The in/on table for UI elements (in a pane, on a tab)[^ms-prepositions] | On the toolbar, select File. | In the toolbar, select File. | house, a Microsoft product-writing convention |

One reject on these pages. The overview frames grammar as conversation, "the grammar you learned before you were 12".[^ms-grammar] The register keeps the simple mechanics and declines the conversational aim, per the conflict table in [microsoft-style.md](../microsoft-style.md).

[^ms-grammar]: Grammar and parts of speech.
[^ms-verbs]: Verbs.
[^ms-person]: Person.
[^ms-nouns]: Nouns and pronouns.
[^ms-ing]: Words ending in -ing.
[^ms-prepositions]: Prepositions.
[^ms-modifiers]: Dangling and misplaced modifiers.
