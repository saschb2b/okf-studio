---
type: Research
title: Multilingual Variants Experiment
description: Source, hypothesis, tested conventions, and adoption gate for language variants.
tags: [research, interoperability, multilingual, experiment]
generated: { by: claude/unrecorded, at: 2026-07-23T23:30:00Z }
---

# Source record

- Demand signal: [GoogleCloudPlatform/knowledge-catalog issue #49, “Multilingual knowledge support”](https://github.com/GoogleCloudPlatform/knowledge-catalog/issues/49)
- Retrieved: 2026-07-23
- Local evidence: the English [Interoperability Lab](../features/interoperability-lab.md) and German [Interoperabilitätslabor](../features/interoperability-lab.de.md)

# Hypothesis and value

A reader should be able to find and choose a language variant without copying an entire bundle or hiding other authored languages. The experiment compares frontmatter language, filename suffix, and explicit translation-reference conventions while every file remains an ordinary concept.

# Result

Studio can inventory and open all three forms. Existing search and retrieval see their content because they remain concepts. A projection treats each selected file independently. None is ready for adoption: language-only metadata does not group siblings, suffixes couple language to path, and `translation_of` is not rewritten by Safe Move.

# Adoption gate

Do not select a default until a bilingual fixture passes portable links, search, retrieval, Safe Move, and recipient projection in both languages with one stable fallback rule. Until then the report says **Not OKF validation** and preserves unknown producer fields.

