# Log

## 2026-07-29

**Update.** Added [ste.md](ste.md), the ASD-STE100 Simplified Technical English construction layer, and linked it from the root index. The skill until now carried only a diagnostic tells table. That is the banned-word-list shape, which a first-party cross-model test measured as the least reliable fix, at a 3% slop reduction on Claude against 74% for the STE skill. The concept records the mechanical rule subset for words, verbs, sentences, and paragraphs. It also records the strict against STE-flavored mode split, the three rules where STE and no-slop disagree and which wins, the experiment table with its caveats, two real before-and-after model outputs, and the six-pass self-lint. Sources are the standard itself (cited, not reproduced, since it is free but copyrighted) and the kit that ran the experiment. No live-web crawl beyond those two. Same change added `slop-lint.mjs` at the skill root, an independent implementation of the machine-checkable subset, referenced from the self-lint section. Validated with `okf-validate --strict`.

## 2026-06-14

**Creation.** Bundle created with the per-surface guidance documents behind the skill. Prose before-and-after rewrites for each tell. Formatting tells, covering heading case, bold spam, bold-label lists, emoji, badges, and smart quotes. Code comments that narrate the diff. Commit messages and PR descriptions that restate it. Strings in code, meaning test names, error messages, and log lines.
