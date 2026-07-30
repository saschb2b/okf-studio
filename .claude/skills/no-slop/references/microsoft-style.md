---
type: Reference
title: "no-slop: Microsoft style"
description: "The mechanics no-slop adopts from the Microsoft Writing Style Guide, the three places its brand voice contradicts no-slop, and the house-style mode that resolves them."
tags: [writing, ai-slop, style, editing, house-style, documentation]
generated: { by: claude-code/unversioned, at: 2026-07-30T00:00:00Z }
sources:
  - id: ms-welcome
    resource: https://learn.microsoft.com/en-us/style-guide/welcome/
    title: "Microsoft Writing Style Guide"
  - id: ms-top10
    resource: https://learn.microsoft.com/en-us/style-guide/top-10-tips-style-voice
    title: "Top 10 tips for Microsoft style and voice"
  - id: ms-voice
    resource: https://learn.microsoft.com/en-us/style-guide/brand-voice-above-all-simple-human
    title: "Microsoft's brand voice; above all, simple and human"
  - id: ms-word-choice
    resource: https://learn.microsoft.com/en-us/style-guide/word-choice/
    title: "Word choice"
---

# no-slop: Microsoft style

The Microsoft Writing Style Guide is the house style for one of the largest documentation estates in software. It is worth mining, and it is not a drop-in. Its mechanics sharpen no-slop. Its brand voice points the other way. Microsoft writes consumer product UI for a global audience, and no-slop targets a reserved professional register.

Read this page for the mechanics no-slop adopts and for the boundary. The accessibility and inclusive-language guidance from the same source is large enough to live on its own page, in [inclusive-and-accessible.md](inclusive-and-accessible.md).

## What no-slop adopts

These are compatible with the register and add something the tells table did not have.

| Rule | Write this | Not this |
|---|---|---|
| No expletive opener | "Three options exist." | "There are three options." |
| Start the statement with a verb | "Store files online and share them." | "You can store files online, and you get sharing." |
| Cut a hollow "you can" | "Set the retry limit in config." | "You can set the retry limit in config." |
| No end punctuation on a heading | "Move a tile" | "Move a tile." |
| Serial comma in a list of three | "Android, iOS, and Windows" | "Android, iOS and Windows" |
| One space after a period | "Done. Next." | "Done.  Next." |

The expletive rule is the sharpest of these. "There is", "there are", and "there were" push the real subject to the back of the sentence and cost a verb. Generated prose reaches for them constantly.

## Where Microsoft and no-slop already agree

Two rules arrived at the same place from different directions, which is worth knowing when someone cites Microsoft at you.

Microsoft says "if you mean the same thing, use the same word." That is the one-name-for-one-thing rule in [ste.md](ste.md) and the elegant variation tell in [prose.md](prose.md). Microsoft reaches it from readability, STE from ambiguity.

Microsoft defaults to sentence-style capitalization and rejects title case in headings. [formatting.md](formatting.md) already carries that rule.

Both documents also lead with the same instruction. Get to the point fast, front-load what matters, prune every excess word.

## Where they conflict

| Item | Microsoft | no-slop | Which applies |
|---|---|---|---|
| Em dash | recommended, unspaced | banned | no-slop wins by default. Microsoft's own example ("Use pipelines—logical groups of activities—to consolidate") is the loudest generated-text marker there is. |
| Contractions | required, to project friendliness | permitted in flavored, expanded in strict | no-slop wins by default. Microsoft's rule exists to sound warm, which is the thing the register declines. |
| Warmth | "warm and relaxed", "less head, more heart", occasionally fun | reserved rather than enthusiastic | no-slop wins by default. This is the whole disagreement, and the other two follow from it. |

The conflict is real rather than a misreading. Microsoft optimizes for a consumer who needs reassurance from a dialog box. no-slop optimizes for a reader who wants the fact and finds decoration irritating. Neither is wrong for its audience.

## House-style mode

no-slop already says to match the surrounding text and never to override a house style the user follows. Microsoft style is the most common such house style in software documentation, so it gets an explicit mode.

Use house-style mode when the text ships into a Microsoft-ecosystem surface. Learn articles, docs following the Microsoft guide, a product UI whose strings already use contractions, or any repo whose contributing guide names the guide. In that mode the three conflicts in the table invert. Use contractions and em dashes, and let the voice warm, because matching the house beats holding the register.

Everything else on this page still applies in house-style mode, as does every tell except those three. Marketing adjectives, hedging, chatbot scaffolding, significance inflation, and list-itis are slop in any house.

Do not reach for this mode because the text is technical or because it is documentation. Reach for it when the destination has a house style and that style is this one. When in doubt, ask, or stay in flavored mode.
