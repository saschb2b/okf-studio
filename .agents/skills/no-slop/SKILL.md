---
name: no-slop
description: Write and revise human-facing prose in a plain, precise, professional register, stripping the tells that mark text as AI-generated. Builds sentences with ASD-STE100 Simplified Technical English, the controlled language behind aerospace maintenance manuals, then checks them against a tells table and a bundled linter. Use when writing or editing a README, blog post, doc, PR or commit message, email, release note, changelog, error message, runbook, or any copy a person will read. Also use when the user asks to make text sound less like AI, remove AI slop, cut the marketing voice, write plain or controlled technical English, reduce over-structuring or list-itis, make wording inclusive or accessible, tighten, de-fluff, or professionalize a draft, or when reviewing prose you just generated before handing it over. Extends to writing inside code. Code comments, commit messages, PR descriptions, test names, error and log messages, and markdown formatting like headings, bold, emoji, and badges.
tags: [writing, editing, controlled-language]
date: 2026-07-29
---

# Write Without the Slop

## The register

Target voice: a German professional writing English at C2 level. Precise, direct, structurally clean. Reserved rather than enthusiastic. Clarity and exactness over flourish or warmth.

This is a register, not an accent. Do not introduce Germanisms, false friends, or grammar errors. Near-native English, just without the bubbly American default.

Most "AI slop" is not wrong, it is over-written. Too warm, too balanced, too eager to summarize itself. Strip that and the text gets shorter and better. The goal is prose that reads like a competent person wrote it on purpose.

## How to apply

- **Writing new prose** (README, docs, email, post, commit or PR message, release note): hold the register while drafting. Then read once against the two tables below, construction first, then the tells.
- **Revising a draft, or your own output before you hand it over**: run the slop pass. Scan for the tells in the table, fix each, then read once more for structure and stance. See [prose.md](./references/prose.md) for before/after rewrites.
- **Writing inside code** (a comment, commit message, PR description, test name, error or log string): apply the same register. Then check the matching sibling file under Beyond prose below.
- **Match the surrounding text.** A codebase, a thread, or a doc has an established voice. These rules sharpen prose. They do not override a house style the user already follows.

## Build the sentence right

Build with the construction rules first, then check against the tells. Order matters. Given only a list of forbidden words, Claude cut measured slop by 3%. Given a whole writing system, it cut 74%. A banned-word list treats symptoms, so reach for it last.

The system is ASD-STE100 Simplified Technical English, standardized by the aerospace industry in 1986 for maintenance manuals that had to survive a non-native reader. Its mechanical rules are the ones that catch slop, and they are the subset below.

| Rule | Write this | Not this |
|---|---|---|
| One name for one thing | the cache, then the cache again | the cache, then the store, then the layer |
| One meaning per word | "fall" means to move down | "traffic fell" for a decrease |
| The short common word | use, start, help, make sure, before, after, about, get, show, also | utilize, commence, facilitate, ensure, prior to, subsequent to, regarding, obtain, demonstrate, additionally |
| Active voice, actor named | the parser reads the file | the file is read |
| One verb per action | analyze the log | perform an analysis of the log |
| No stacked auxiliaries | this improves throughput | it may help to improve throughput |
| Simple tense over progressive | the job writes the index | the job is writing the index |
| Plain verb over phrasal | start, contact, read, deploy | spin up, reach out, dive into, roll out |
| One idea per sentence, capped | 20 words for an instruction, 25 for description | a 40-word coordinated chain |
| No semicolons | two sentences | one sentence, spliced |
| Condition before command | if the cache is cold, warm it first | warm the cache first if it is cold |
| One topic per paragraph | six sentences maximum, steps as a numbered list | a step buried in a paragraph |

**Three modes.** Strict covers procedures, runbooks, install and migration steps, error and log messages, and deprecation notices. Every rule applies, the cap is 20 words, contractions expand. STE-flavored is the default everywhere else, for READMEs, docs, posts, PR bodies, and email. Keep the sentence, verb, and paragraph discipline, cap at 25 words, and leave contractions and the register above intact. 
**House-style mode** applies when the text ships into a surface with an established style, most often the Microsoft Writing Style Guide. There the house wins, so contractions, em dashes, and a warmer voice are correct. Do not pick it because the text is technical, only because the destination follows that style. Every other tell stays in force.

The full rule set, the mode split, the places STE and no-slop disagree, and the measured evidence are in [ste.md](./references/ste.md). The Microsoft mechanics and the three conflicts are in [microsoft-style.md](./references/microsoft-style.md).

## The tells (kill on sight)

| Tell | Fix |
|---|---|
| Em dash for drama or aside | period, comma, colon, or parentheses |
| "not X, but Y" / "it's not just X, it's Y" | state Y plainly |
| Rule-of-three that isn't load-bearing ("fast, clean, and reliable") | keep the one term that carries weight |
| Throat-clearing opener ("In today's world", "When it comes to") | delete, start at the point |
| Summary that restates the body ("In conclusion", "Ultimately") | delete, or end on the last real point |
| Transition filler ("Moreover", "Furthermore", "It's worth noting") | delete, the next sentence stands on its own |
| Forced enumeration ("Here are three reasons"), or list-itis where prose belongs | make the points in prose, reserve lists for parallel independent items |
| Padding a list to a round number ("5 tips" with two filler entries) | keep only the real items |
| Reflexive hedging ("It's important to note that", "arguably", "may potentially") | cut, or make the qualification real and specific |
| Validation or flattery ("Great question", "You're absolutely right") | answer the thing |
| Slop vocabulary (delve, leverage, navigate, realm, landscape, tapestry, intricate, robust, seamless, crucial, vital, foster, harness) | the plain word |
| Category noun where a specific one exists ("the relevant component") | name the thing ("the auth middleware") |
| Numbers on an unordered set | bullets, since numbers imply sequence or rank |
| Expletive opener ("There are three options") | put the subject first ("Three options exist") |
| Link text that says nothing ("click here", "read more") | describe the destination |
| Directional-only reference ("above", "below", "on the left") | name the thing, since a screen reader has no left |
| Significance inflation ("stands as a testament", "marks a pivotal moment") | state the plain fact, drop the importance claim |
| Inflated copula ("boasts", "serves as", "features" where "is" or "has" fits) | restore the plain verb |
| Vague authority ("studies show", "experts agree", "it is widely regarded") | name the source, or cut the claim |
| Participle-chain tail ("..., further cementing its legacy") | end the sentence at the fact |
| False inclusivity ("Whether you're a beginner or an expert") | say who it is actually for |
| Chatbot scaffolding ("Let's dive in", "As you can see", "Happy coding!") | delete, start and end at the content |
| Negative-space hype ("Say goodbye to X", "Gone are the days of Y") | state what the thing does |

The tables catch phrases. These habits decide whether the fix lands. Lead with the point, so the first sentence carries it. When you cut a vague phrase, replace it with a fact rather than a quieter adjective. A hedged rewrite is the same slop at lower volume.

Do not dodge a listed word into something more contorted, and rephrase the sentence instead of reaching for a thesaurus. Match the medium, since an email is not a slide deck and a prose post is not API docs.

Default to prose. Reach for a list only when the items are genuinely parallel and independent, meaning steps, options, or criteria. When ideas connect or need context, write the paragraph.

## Check the draft

Read once against the rules above. Then run the linter. Paths below are relative to this skill's directory, so resolve `slop-lint.mjs` next to this SKILL.md.

```sh
node slop-lint.mjs README.md              # a file, flavored mode
node slop-lint.mjs --strict runbook.md    # procedures, 20-word cap
echo "$draft" | node slop-lint.mjs        # prose you have not written to a file yet
```

Run it in three cases. You edited a prose file, so lint before and after and report the delta. You are about to hand over a draft longer than a paragraph, so pipe it through stdin first. The user asked for a slop pass by name, so show them the score. Skip it for a one-line commit message, and skip it when `node` is unavailable, since the rules above stand on their own.

The score is violations per 100 words across the construction rules and the tells. Read it as a delta, never as a grade. Lint the draft, revise, lint again, and the drop is the signal. An absolute number only compares against another version of the same text, and a document that quotes slop on purpose scores high while being correct. Under about 50 words the number is noise, so trust it on longer text.

Two rules stay a human read, because a checker cannot know that "the cache" and "the store" are the same component. One name for one thing, and one meaning per word.

## Beyond prose

The register and the tells apply wherever you write, not only in essays and docs. Each surface carries its own slop, with the tells and rewrites in a sibling file:

- **Formatting** (headings, bold, lists, emoji, badges, smart quotes). See [formatting.md](./references/formatting.md).
- **Code comments** that narrate the diff or restate the code. See [code-comments.md](./references/code-comments.md). That page is the register pass. `comment-stinky` is the deep version. It covers whether a comment should exist at all, what it should say instead, and the write-time gate. Use it when the task is about the comments themselves rather than the prose sounding generated.
- **Commit messages and PR descriptions** that restate the diff instead of the reason for it. See [commits-and-prs.md](./references/commits-and-prs.md).
- **Strings in code** (test names, error and log messages). See [code-strings.md](./references/code-strings.md).
- **Prose that breaks for assistive technology, or that excludes a reader** by assuming who they are. Neither reads as slop, both are defects, and volume production introduces them fast. See [inclusive-and-accessible.md](./references/inclusive-and-accessible.md).

One rule carries across all of them. Match the surrounding work: a file's comment density, a repo's commit history, a doc's heading style. These rules sharpen the writing, they do not override a house style.

## Don't over-correct

The rules remove warmth that was not earned. They do not require coldness. Watch the second-order slop they can create:

- **Clipped to the point of robotic.** Vary sentence length. A run of five-word sentences is its own tell.
- **Avoidance that produces a worse word.** "Strong" is fine when you mean strong. The rule targets "robust" as a reflex, not the idea behind it.
- **Cutting a transition that was doing real work.** Drop filler, keep the connective a reader needs to follow the logic.
- **Banning contrast itself.** A real contrast sometimes needs "but". The target is the inflated "not just X, it's Y" cadence, not the word.
- **Strict STE where it does not belong.** The 20-word cap and the expanded contraction are right in a runbook. In a blog post they read as stiff rather than precise. Default to flavored, and escalate only when a misreading costs something.
- **Chasing the score.** The linter counts what it can match. A text can reach zero violations and still say nothing, because these rules fix the form of slop and never the substance.
- **Treating every list as slop.** A real sequence of steps or set of options belongs in a list. The target is the list used as a substitute for thinking, not the list itself. An accurate count ("the twelve construction rules") is fine. A padded or announced-then-listed one is not.

When in doubt, read it aloud. If it sounds like a person explaining something they understand, keep it. If it sounds like a brochure, fix it.
