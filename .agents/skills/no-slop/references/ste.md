---
type: Reference
title: "no-slop: Simplified Technical English"
description: "The ASD-STE100 construction rules behind the no-slop skill, the two modes, and the measured evidence that a writing system beats a banned-word list."
tags: [writing, ai-slop, style, editing, controlled-language, ste]
generated: { by: claude-code/unversioned, at: 2026-07-29T00:00:00Z }
sources:
  - id: asd-ste100
    resource: https://asd-ste100.org
    title: "ASD-STE100 Simplified Technical English, Issue 9"
  - id: ste-slop-kit
    resource: https://github.com/woosal1337/blog/tree/main/videos/ep01-the-cure-for-ai-slop
    title: "The cure for AI slop is a 1986 aircraft manual, the kit"
---

# no-slop: Simplified Technical English

The tells table in SKILL.md is a diagnostic list. A diagnostic list is the weakest of the available fixes, because it treats symptoms one word at a time. The stronger fix is a construction system the writer builds sentences with, and the system that exists is Simplified Technical English.

## What STE is

Simplified Technical English is a controlled language. The European aerospace industry standardized it in 1986 as AECMA Simplified English. It governed maintenance manuals for mechanics who often did not speak English first. It is now ASD-STE100, currently Issue 9, and free from asd-ste100.org.[^asd-ste100]

It is two things bound together. A writing-rule set of roughly 60 rules, and a controlled dictionary of about 900 approved words. Each dictionary entry carries one approved meaning and one approved part of speech.

STE strips voice on purpose. That is the correct trade in a procedure and the wrong one in an essay. So this skill splits it into two modes instead of applying it whole.

# The construction rules

The subset below is the mechanical half, the half a checker can see. The judgment half needs a human. Is this the right technical noun, and does the sentence make good sense to its reader? No checker certifies that.

## Words

| Rule | Write this | Not this |
|---|---|---|
| One name for one thing | the cache, then the cache again | the cache, then the store, then the layer |
| One meaning per word | "fall" means to move down | "traffic fell" for a decrease |
| The short common word | use, start, help, make sure, before, after, about, get, show, also | utilize, commence, facilitate, ensure, prior to, subsequent to, regarding, obtain, demonstrate, additionally |
| No marketing adjective | the measured property | seamless, robust, powerful, effortless, world-class, next-generation |
| One spelling convention | American, consistently | mixed |

The one-name rule is the same defect that [prose.md](prose.md) catalogs as elegant variation, arrived at from the other direction. STE forbids the synonym swap because a reader cannot tell whether two names mean two things. no-slop forbids it because the swap reads as stilted. Either way the fix is to repeat the plain noun.

## Verbs

- Active voice with a named actor. "The parser reads the file", not "the file is read by the parser", and not the actorless "the file is read".
- One verb for one action. "Analyze the log", not "perform an analysis of the log". The nominalization hides the verb inside a noun and then needs a weak verb to carry it.
- No stacked auxiliaries. Not "it is important to note that this may help to improve throughput". Write "this improves throughput".
- No progressive where a simple tense works. "The job writes the index", not "the job is writing the index".
- The plain verb, not the phrasal one. Start, not spin up. Contact, not reach out. Read, not dive into. Deploy, not roll out.

## Sentences

- One instruction per sentence. One idea per sentence in description.
- 20 words maximum for an instruction, 25 for a descriptive sentence.
- No semicolons. Write two sentences.
- Keep the articles. A, an, the, this, these. Dropping them is telegraphic, not concise.
- Put the condition before the command. "If the cache is cold, warm it first", not "warm the cache first if it is cold".

## Paragraphs and steps

- One topic per paragraph, six sentences maximum.
- Steps become a numbered vertical list, one action per item, in the imperative.
- Do not bury a step inside a paragraph of description.

This is the one place STE pushes toward a list where no-slop pushes away from one, and the two do not actually conflict. A real sequence of actions is exactly the case [formatting.md](formatting.md) reserves the list for. Everything else stays prose.

# The two modes

Strict STE is correct where a misreading costs something and voice is worth nothing. STE-flavored is the default for anything a person reads for information rather than to execute.

| | Strict STE | STE-flavored (default) |
|---|---|---|
| Use for | procedures, runbooks, install and migration steps, error and log messages, safety text, deprecation notices | READMEs, docs, posts, PR bodies, commit messages, email, release notes |
| Sentence cap | 20 words, hard | 25 words, and vary the rhythm deliberately |
| Contractions | expand them | keep them where the register allows |
| Dictionary | the ~900-word approved-word discipline | plain-word default, no lockdown |
| Voice | none, by design | the no-slop register survives |
| Rhythm | uniform is fine | uniform is its own tell, so mix lengths |

The flavored mode keeps the sentence, paragraph, active-voice, nominalization, and phrasal-verb discipline and relaxes only the dictionary. That is what makes it compatible with the no-slop register instead of a replacement for it.

## Where STE and no-slop disagree

Three rules differ, and no-slop wins each time. STE addresses a technical author drafting a manual. This skill addresses an LLM writing for a human reader.

| Item | STE | no-slop | Which applies |
|---|---|---|---|
| Em dash | permitted | banned | Banned. The em dash is the single loudest generated-text marker. |
| Semicolon | banned | not addressed | Banned. Two sentences read better anyway. |
| Contractions | banned | permitted | Permitted in flavored mode, expanded in strict. A banned contraction in a blog post reads as stiff, not precise. |
| Uniform short sentences | fine | a tell | Vary them in flavored mode. A run of identical clipped sentences is second-order slop. |

# The evidence

A first-party test asked whether a writing system actually beats the folk fix.[^ste-slop-kit] Six engineer-writing tasks, four conditions, two model families. The tasks were a README, a PR description, API docs, an error message, a getting-started page, and a deprecation notice. A heuristic anti-slop linter scored each output at violations per 100 words.

| Condition | Claude sonnet | gpt-5.5 |
|---|---|---|
| baseline | 4.36 | 3.54 |
| banned-word list | 4.21 (-3%) | 2.14 (-40%) |
| Orwell's six rules | 2.48 (-43%) | 1.69 (-52%) |
| STE skill | 1.12 (-74%) | 1.76 (-50%) |

What holds on both models. Any real writing system cuts measured slop by half or more. STE was best on Claude and effectively tied with Orwell on gpt-5.5.

What does not generalize. The banned-word list cut 3% on Claude and 40% on gpt-5.5. So "banning words does nothing" is a Claude result, not a law.

The two models also slop differently. Claude's default slop is loud, through em dashes, marketing adjectives, and run-ons. gpt-5.5 shipped zero em dashes and zero marketing adjectives by default. It slopped through passive voice and long sentences instead. On one task of six, STE scored slightly worse than baseline. A long-paragraph heuristic had penalized its many short sentences.

The honest caveats. A heuristic linter, n=6, two models, so directional rather than proof. Violations per 100 words is noisy under about 50 words, where a single hit reads as 10/100w. And STE fixes the form of slop, never the substance. It cannot make a hollow paragraph true.

# Examples

Both pairs are real model output from the same prompt, baseline against the STE instruction.[^ste-slop-kit]

## README intro

Before (4.19/100w, four em dashes, a 35-word opening sentence):

> Traditional caches miss constantly in LLM workloads because users rarely phrase the same question identically, and fluxcache solves this by embedding incoming prompts and matching them against previously cached queries within a configurable similarity threshold. It ships with sensible defaults so you can get semantic caching running in a few lines of code, while exposing the knobs that real applications need as they scale. Whether you're building a chatbot, a RAG pipeline, or an agentic workflow, fluxcache is designed to slot into your existing stack with minimal friction and no vendor lock-in.

After (1.18/100w, 12% shorter):

> A normal cache matches requests by exact text. A small change in wording then causes a cache miss. fluxcache compares the meaning of a new prompt with the prompts already in the cache. If two prompts are close enough in meaning, fluxcache returns the stored response instead of a new call to the model. This lowers the number of calls to the model and cuts the cost and response time of the application.

Every move is a rule above. The 35-word opener splits. "Sensible defaults", "minimal friction", and "no vendor lock-in" are marketing adjectives with nothing measurable behind them, so they go. The false-inclusivity opener names nobody, so it goes. The condition leads its command in the fourth sentence.

## Error message

Strict mode, where the caps are hard. The wider register rules for this surface, covering test names and log lines as well, are in [code-strings.md](code-strings.md). Before, 123 words with contractions, a rolling-window aside, and the filler claim "ensures fair access for all users". After, 72 words and zero violations:

> The API allows a maximum of 100 requests per minute for each account. Your application sent more requests than this limit allows. The server rejected the extra requests to protect the system for all users. Check the `Retry-After` header in the response for the exact wait time. Wait for this time, then send your request again.

One instruction per sentence, every sentence under 20 words, no contraction, the actor named in each. The reader gets the number, the cause, and the action.

# Self-lint

Six mechanical passes, in the order that finds the most per read. The linter at [slop-lint.mjs](../slop-lint.mjs) checks all six, plus the tells table.

1. Any sentence over the cap for the mode? Split it.
2. Any semicolon or em dash? Replace with a period, comma, colon, or parentheses.
3. Any passive with a known actor? Name the actor and make it active.
4. Any nominalization ("perform an analysis of"), progressive main verb, or phrasal verb? Use the plain verb.
5. Same thing named two ways? Pick one name and repeat it.
6. Strict mode only: any contraction? Expand it.

Read the score as a delta, not a grade. Lint the draft, revise, lint again. An absolute score only compares against another version of the same text. A document that quotes slop on purpose, this bundle for instance, scores high while being correct.

Two rules resist automation and stay a human read. One name for one thing needs to know that "the cache" and "the store" are the same component. One meaning per word needs to know which sense was intended.

[^asd-ste100]: ASD-STE100 Simplified Technical English, Issue 9. The standard is free but copyrighted, so it is cited here rather than reproduced.
[^ste-slop-kit]: The cure for AI slop is a 1986 aircraft manual, the kit. Numbers and sample outputs from its `experiment-results.md` and `before-after-samples.md`.
