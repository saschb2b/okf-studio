---
type: Reference
title: "no-slop: inclusive and accessible prose"
description: "Writing rules for readers using assistive technology and for language that excludes, drawn from the Microsoft accessibility and bias-free guidance."
tags: [writing, accessibility, inclusive-language, style, editing]
generated: { by: claude-code/unversioned, at: 2026-07-30T00:00:00Z }
sources:
  - id: ms-a11y
    resource: https://learn.microsoft.com/en-us/style-guide/accessibility/writing-all-abilities
    title: "Writing for all abilities"
  - id: ms-bias-free
    resource: https://learn.microsoft.com/en-us/style-guide/bias-free-communication
    title: "Bias-free communication"
  - id: lsa-inclusive
    resource: https://www.linguisticsociety.org/content/guidelines-inclusive-language
    title: "Linguistic Society of America, Guidelines for Inclusive Language"
---

# no-slop: inclusive and accessible prose

This page covers two failures the rest of the skill does not detect. Prose that breaks for a reader using a screen reader, and prose that excludes a reader by assuming who they are. Neither reads as slop. Both are defects, and an agent producing documentation at volume introduces them faster than a human would.

This page does not change the register. Every rule here holds in strict, flavored, and house-style mode.

## Writing for assistive technology

| Rule | Write this | Not this |
|---|---|---|
| No directional-only reference | "in the following list", "on the toolbar" | "above", "below", "on the left" |
| Link text that stands alone | "See the retry policy." | "Click here." |
| Spell out symbols in prose | "and", "plus", "about" | "&", "+", "~" |
| Input-neutral verbs in steps | "select", "choose", "enter" | "click", "swipe", "tap" |
| Hierarchy through heading levels | a real H3 | bold text acting as a heading |
| Parallel structure in a list | every item starts with a verb | items that switch shape midway |
| No forced line break inside a paragraph | let it wrap | a hard return to control width |

Directional language is the one that bites most often. "The button above" means nothing to someone whose reader moves linearly through the document. It breaks again when a layout reflows on a phone. Name the thing instead of its position.

Link text matters for the same reason. Assistive software can list a page's links out of context, so a page of "click here" becomes a list of identical entries. Describe the destination.

Aim for one verb per sentence, and read the text as a screen reader would say it. That is the same discipline [ste.md](ste.md) enforces for a non-native reader, arrived at for a different reason.

## Language that excludes

**Gender-neutral terms for roles and groups.**

| Use this | Not this |
|---|---|
| chair, moderator | chairman |
| humanity, people | mankind |
| workforce, staff, personnel | manpower |
| sales representative | salesman |
| synthetic, manufactured | manmade |
| operates, staffs | mans |

**No generic he or she.** Rewrite to second person ("if you have the rights"). Make the noun plural ("developers need access to their servers"). Use an article ("the document"), or name the role ("the reader"). Singular "they" is fine when none of those work. Never write "he/she" or "s/he".

When writing about a real person, use the pronouns that person uses. Gendered pronouns are also correct in direct quotations, in titles of works, and where gender is the subject.

**Terms carrying racial, militaristic, or ableist freight.**

| Use this | Not this |
|---|---|
| primary/subordinate | master/slave |
| perimeter network | demilitarized zone, DMZ |
| stop responding | hang |
| allowlist, blocklist | whitelist, blacklist |

**People first, disability second.** Write "readers who are blind or have low vision" and "customers with limited dexterity". Drop words implying pity, such as "stricken with" or "suffering from". Do not mention a disability unless it is relevant. Some communities prefer identity-first language, so follow a specific audience when you know its preference.

**In examples and fictitious scenarios**, vary names, roles, and settings, and avoid the assumption that the reader is Western or affluent. Do not generalize about a country, region, or culture, including favorably.

## What this is not

This page is not a compliance checklist and passing it does not make a document accessible. Structure, contrast, image alt text, and keyboard operation are product work that prose rules do not reach. Fix the sentences, and route the rest to whoever owns the page.
