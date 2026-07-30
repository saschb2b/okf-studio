---
type: Reference
title: "no-slop: formatting"
description: "Slop you can see before you read a word."
tags: [writing, ai-slop, style, editing]
generated: { by: claude-code/unversioned, at: 2026-07-29T00:00:00Z }
---
# no-slop: formatting

Slop you can see before you read a word. These apply to anything rendered, a README, a doc, a PR body, a wiki page. Match the file's house style first: if a repo already uses emoji headers everywhere, that is its voice, not slop to strip.

## The tells

| Tell | Fix |
|---|---|
| Title Case In Every Heading | sentence case ("Key benefits", not "Key Benefits") |
| Capitalizing Ordinary Nouns mid-sentence for importance | lowercase them |
| Bold on every notable term | remove bold except where one term truly needs it |
| Bulleted list where every item is "**Label**. a sentence" | prose, or plain bullets without the bold-label scaffold |
| Emoji as section markers or bullet decoration | delete unless they carry information |
| Badge wall at the top of a README | keep only badges a reader acts on, like CI status or version |
| Smart/curly quotes and apostrophes in code, CLI, or config | normalize to straight quotes |
| An H3 for every two-sentence subtopic | headings only where a reader needs to jump |
| A period or colon ending a heading or title | drop it, headings take no end punctuation |
| Missing serial comma ("Android, iOS and Windows") | comma before the conjunction |

## Title and sentence case

Before: `## Key Benefits And Core Features`
After: `## Key benefits`

Headings are not titles. Use sentence case. The same goes mid-sentence: "improves Developer Productivity" should be "improves developer productivity".

## Bold-keyword spam

Before: Our **platform** uses **machine learning** to deliver **real-time** insights with **enterprise-grade** security.
After: The platform uses machine learning for real-time insights.

Bold everything and you emphasize nothing. Reserve it for the rare term a reader must not miss.

## Bold-label colon lists

Before:

> - **Performance**: It's fast.
> - **Scalability**: It scales well.
> - **Reliability**: It's reliable.

After:

> The service holds sub-10ms reads as traffic grows.

The repeated "**Label**: sentence" shape is a signature LLM list. When the items restate each other or form one causal chain, write the sentence. Keep the list only for genuinely parallel items, and for the one case [ste.md](ste.md) actively requires a list, a sequence of actions the reader performs.

## Emoji and badges

Before: `## 🚀 Features`, `## 📦 Installation`, plus eight shields.io badges on an internal tool.
After: `## Features`, `## Installation`, badges trimmed to CI and version.

Emoji headers and badge walls signal a generated README. Strip both unless the project already uses them and a badge tells the reader something they act on.

## Smart quotes

Before: `const x = "hello"` (curly quotes)
After: `const x = "hello"` (straight quotes)

Curly quotes and apostrophes break code blocks, CLI examples, and config snippets. Normalize them to straight ASCII in anything a machine reads.

## Don't over-correct

A real reference doc earns many headings, and a status badge a maintainer checks daily earns its place. The target is decoration that signals effort without adding information, not structure a reader uses.
