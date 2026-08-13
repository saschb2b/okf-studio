---
type: Reference
title: "no-slop: structural editing"
description: "The document-level pass. Reorder, merge, split, delete, and replace sections before any sentence gets polished."
tags: [writing, ai-slop, style, editing, structure]
generated: { by: claude-code/claude-fable-5, at: 2026-08-08T00:00:00Z }
---

# no-slop: structural editing

Generated text over-organizes before it over-writes. The scaffold arrives before the first sentence: an intro that previews, a Features list, a heading per two-sentence topic, a conclusion that recaps. Sentence rules cannot fix that, because every sentence can pass [ste.md](ste.md) while the document stays slop. So this pass runs first, and it is allowed to be destructive. Deleting a section removes more slop than a hundred word fixes, and it is the one edit a wording-only pass never dares to make.

## Start from the reader, not the draft

Before any move, answer two questions. Who reads this, and what do they do right after? The answers dictate the order: what the reader acts on comes first, background comes after the point it supports or gets cut. A README's reader decides "do I want this", then "how do I install it". A migration guide's reader wants the steps, not the history of the old system. A PR reviewer wants the problem and the user-visible effect before any file list.

If the draft's outline does not survive contact with those two answers, rebuild the outline first and pour the surviving text into it. Rewriting sentence by sentence inside a wrong outline is the expensive order.

## The moves

Six moves, largest first, each with the smell that triggers it.

| Move | Trigger |
|---|---|
| **Delete** a section | it restates another section, previews or recaps the body, or exists only because a template had a heading for it |
| **Merge** sections | two headings share one topic, or a section holds one real sentence that belongs elsewhere |
| **Split** a section | one heading covers two jobs, or one block mixes description with instruction |
| **Reorder** | the point sits under background, the condition follows the command, the common case follows the edge case |
| **Replace** the form | bullets carrying an argument become prose, prose hiding a sequence becomes a numbered list, a two-row table becomes a sentence |
| **Cut to size** | the document is twice as long as its content; half length is a normal outcome, not a failure |

## Worked example, a generated README

Before, the outline of a typical generated README:

> Overview / Features (eight bold-label bullets) / Why parseconf? / Getting Started / Prerequisites / Installation / Usage / Roadmap / Contributing / Conclusion

After:

> Two opening sentences with no heading (what it does, for whom) / Install / Usage / Configuration

The moves: Overview merged into the opening sentences. Features and "Why parseconf?" deleted, their one real claim (typed output) moved into the opening. Getting Started collapsed into Install, since Prerequisites was one line. Roadmap, Contributing, and Conclusion deleted; the project can add Contributing when it wants contributors. Ten sections became three plus an opening. Only then are the surviving sentences worth building right.

## Worked example, unburying the point

Before, a migration guide: Background (four paragraphs on the old auth system), Motivation (two more), Considerations, then Migration steps at the bottom.

After: Migration steps first, as numbered imperative items per the paragraph rules in [ste.md](ste.md). Then one section, "What changed and why", holding the single merged paragraph that survived Background and Motivation. Then the one consideration that is a real edge case, the rest deleted. The reader came to migrate; history survives only where it explains a step.

## Paragraphs

The same moves apply one level down. Merge paragraphs that share a topic, split one that hides an instruction inside description, reorder so the first sentence carries the point, delete the paragraph that repeats its own section heading. One topic per paragraph, six sentences maximum. [prose.md](prose.md) repairs the sentences that survive this pass.

## Report the moves

Structural edits change what an author said, not just how it sounds. Hand back a summary of the moves ("deleted Roadmap and Conclusion, merged Background into What changed, steps now lead"), so the author can veto a deletion. Silent restructuring of someone's draft is how real content gets lost. Your own generated draft needs no such ceremony; restructure it before anyone sees it.

## Don't over-correct

Structure a reader or a machine depends on is load-bearing, not slop. An API reference earns a heading per endpoint. A spec with numbered sections earns its numbers, because other documents cite them. A repo's mandated PR or issue template stays, filled honestly, per [commits-and-prs.md](commits-and-prs.md). Anchors other pages link to keep their names. A long document with real content earns its length. The target is the outline that signals effort without carrying information, the same decoration [formatting.md](formatting.md) strips at the visual level.
