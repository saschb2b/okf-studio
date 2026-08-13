---
name: no-slop
description: Write and revise human-facing prose in a plain, professional register, stripping the tells that mark text as AI-generated. Works top down. First restructure the document (reorder, merge, split, delete, or replace sections and generated scaffold), then rebuild paragraphs and sentences with ASD-STE100 Simplified Technical English and the mechanics adopted from the Microsoft Writing Style Guide, then kill word-level tells and check with a bundled linter. Use when writing or editing a README, blog post, doc, PR or commit message, email, release note, changelog, error message, runbook, or any copy a person will read. Also use when asked to make text sound less like AI, remove AI slop, restructure or de-bloat a doc, cut the marketing voice, write plain or controlled technical English, fix over-structuring or list-itis, make wording inclusive or accessible, tighten or professionalize a draft, or to review prose you just generated. Extends to comments, commits, PRs, test names, error and log strings, and formatting.
tags: [writing, editing, controlled-language]
date: 2026-08-08
---

# Write Without the Slop

## The register

Target voice: a German professional writing English at C2 level. Precise, direct, structurally clean. Reserved rather than enthusiastic. This is a register, not an accent, so no Germanisms, no false friends, no grammar errors. Near-native English, just without the bubbly American default.

Most AI slop is not wrong, it is over-written and over-organized. Too warm, too balanced, too scaffolded, too eager to summarize itself. Strip that and the text gets shorter and better. The goal is prose that reads like a competent person wrote it on purpose.

## Work top down

Slop lives at every scale, from the table of contents down to the word. Polishing sentences inside a structure that is itself slop is wasted work, so run the passes in order. Each pass deletes text the later passes would otherwise polish.

1. **Rethink the document.** Reorder, merge, split, delete, and replace whole sections. The moves are below, the worked examples in [structure.md](./references/structure.md).
2. **Rebuild the paragraphs.** One topic each, point first, steps out of prose.
3. **Build the sentences right** with the STE construction rules.
4. **Kill the word-level tells**, including the adopted Microsoft mechanics.
5. **Check** with the linter, then the human-only reads.

On any draft longer than a few paragraphs, a wording-only edit means the biggest pass was skipped. Make the structural moves, or state that the structure is sound and why. When writing new prose the same order applies as questions: what does the reader need, in what order, then the paragraph plan, then the sentences. When writing inside code (a comment, commit message, test name, error string), apply the same register and check the matching file under Beyond prose.

Two standing rules. Match the surrounding work (a repo's history, a doc's established voice, a mandated template); these rules sharpen writing, they do not override a house style the user follows. And when you restructure someone's draft, report the moves ("merged X into Y, dropped Z"), never silently.

## Pass 1, restructure the document

| Find | Move |
|---|---|
| An intro that previews, a conclusion that recaps, a section restating another | delete it, or merge its one real sentence into the body |
| Generated scaffold (Overview, Features, Conclusion; Summary, Changes, Testing on a two-line PR) | replace with the sections this document earns, often none |
| The point buried under background | reorder, lead with what the reader came for |
| Two sections sharing one topic | merge them |
| One section doing two jobs | split it |
| A wall of bullets where reasoning belongs | rewrite as prose |
| A step buried in a descriptive paragraph | pull it into a numbered list, one action per item |
| A heading for every two sentences | merge under fewer headings |
| A document twice as long as its content | cut it, half length is a normal outcome |

## Pass 2, rebuild the paragraphs

One topic per paragraph, six sentences maximum, the first sentence carries the point. Reach for a list only when the items are genuinely parallel and independent (steps, options, criteria); when ideas connect or need context, write the paragraph. A real sequence of actions is the one place a list is required: numbered, imperative, one action per item.

## Pass 3, build the sentences right

The system is ASD-STE100 Simplified Technical English, standardized by the aerospace industry in 1986 for maintenance manuals that had to survive a non-native reader. It works: given only a banned-word list, Claude cut measured slop by 3%; given this system, 74%. Full rules, modes, and evidence in [ste.md](./references/ste.md).

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

## Pass 4, the tells (kill on sight)

| Tell | Fix |
|---|---|
| Em dash for drama or aside | period, comma, colon, or parentheses |
| "not X, but Y" / "it's not just X, it's Y" | state Y plainly |
| Rule-of-three that isn't load-bearing ("fast, clean, and reliable") | keep the one term that carries weight |
| Throat-clearing opener ("In today's world", "When it comes to") | delete, start at the point |
| Summary that restates the body ("In conclusion", "Ultimately") | delete, or end on the last real point |
| Transition filler ("Moreover", "Furthermore", "It's worth noting") | delete, the next sentence stands on its own |
| Forced enumeration ("Here are three reasons"), or a list padded to a round number | make the points in prose, keep only the real items |
| Reflexive hedging ("It's important to note that", "arguably", "may potentially") | cut, or make the qualification real and specific |
| Validation or flattery ("Great question", "You're absolutely right") | answer the thing |
| Slop vocabulary (delve, leverage, navigate, realm, landscape, tapestry, intricate, robust, seamless, crucial, vital, foster, harness) | the plain word |
| Category noun where a specific one exists ("the relevant component") | name the thing ("the auth middleware") |
| Numbers on an unordered set | bullets, since numbers imply sequence or rank |
| Expletive opener ("There are three options") | put the subject first ("Three options exist") |
| Statement that leads with the reader ("You can store files online") | start with the verb ("Store files online") |
| Hollow "you can" ("You can set the retry limit in config") | cut it ("Set the retry limit in config") |
| Link text that says nothing ("click here"), or directional-only reference ("above", "on the left") | describe the destination, name the thing |
| Significance inflation ("stands as a testament", "marks a pivotal moment") | state the plain fact, drop the importance claim |
| Inflated copula ("boasts", "serves as", "features" where "is" or "has" fits) | restore the plain verb |
| Vague authority ("studies show", "experts agree") | name the source, or cut the claim |
| Participle-chain tail ("..., further cementing its legacy") | end the sentence at the fact |
| False inclusivity ("Whether you're a beginner or an expert") | say who it is actually for |
| Chatbot scaffolding ("Let's dive in", "As you can see", "Happy coding!") | delete, start and end at the content |
| Negative-space hype ("Say goodbye to X", "Gone are the days of Y") | state what the thing does |

The verb-first and hollow-"you can" rows come from the Microsoft Writing Style Guide, like the expletive opener. Those adopted mechanics apply in every mode, they are not house-style extras; the full set with the serial-comma and heading rules is in [microsoft-style.md](./references/microsoft-style.md) and [formatting.md](./references/formatting.md).

When you cut a vague phrase, replace it with a fact, not a quieter adjective; a hedged rewrite is the same slop at lower volume. Do not dodge a listed word into something more contorted, rephrase the sentence instead.

## Modes

**Strict** for procedures, runbooks, install and migration steps, error and log messages, and deprecation notices. Every STE rule, 20-word cap, contractions expand. **Flavored** is the default everywhere else: keep the sentence, verb, and paragraph discipline, cap at 25 words, contractions and the register stay. **House-style** when the destination has an established style, most often the Microsoft guide. The house wins on contractions, em dashes, and warmth; every other tell and every pass above stays in force. Pick it for the destination, never because the text is technical.

## Pass 5, check the draft

Read once against the passes above. Then lint (resolve `slop-lint.mjs` next to this SKILL.md):

```sh
node slop-lint.mjs README.md              # a file, flavored mode
node slop-lint.mjs --strict runbook.md    # procedures, 20-word cap
echo "$draft" | node slop-lint.mjs        # prose not yet written to a file
```

Lint before and after an edit and report the delta. The score is violations per 100 words and only means something against another version of the same text; under about 50 words it is noise. Skip it for a one-liner, or when `node` is unavailable. The linter sees words and sentences only. Structure (pass 1) and the two naming rules (one name for one thing, one meaning per word) stay a human read.

## Beyond prose

The register and the passes apply wherever you write. Per-surface tells and rewrites:

- **Formatting** (headings, bold, lists, emoji, badges, smart quotes): [formatting.md](./references/formatting.md).
- **Code comments** that narrate the diff: [code-comments.md](./references/code-comments.md). `comment-stinky` is the deep version, use it when the task is the comments themselves.
- **Commit messages and PR descriptions** that restate the diff instead of the reason: [commits-and-prs.md](./references/commits-and-prs.md).
- **Strings in code** (test names, error and log messages): [code-strings.md](./references/code-strings.md).
- **Prose that breaks for assistive technology or excludes a reader**: [inclusive-and-accessible.md](./references/inclusive-and-accessible.md). Neither reads as slop, both are defects.
- **Sentence-level before/after rewrites** for every tell: [prose.md](./references/prose.md).

## Don't over-correct

The rules remove warmth and structure that were not earned. They do not require coldness or shapelessness.

- **Load-bearing structure stays.** An API reference earns its many headings, a spec its numbered sections, a mandated PR template its scaffold. Restructure the bloat, not the contract.
- **Clipped to the point of robotic.** Vary sentence length; a run of five-word sentences is its own tell.
- **A worse word to dodge a listed one.** "Strong" is fine when you mean strong. The rule targets "robust" as a reflex, not the idea behind it.
- **Cutting a transition doing real work.** Drop filler, keep the connective the reader needs to follow the logic.
- **Banning contrast itself.** A real contrast sometimes needs "but". The target is the inflated cadence, not the word.
- **Strict STE where it does not belong.** Outside procedures it reads stiff rather than precise. Default to flavored.
- **Chasing the score.** Zero violations can still say nothing. These rules fix the form of slop, never the substance.

When in doubt, read it aloud. If it sounds like a person explaining something they understand, keep it. If it sounds like a brochure, fix it.
