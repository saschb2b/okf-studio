---
type: Reference
title: OKF Sample Bundles
description: The three browsable OKF sample bundles, covering GA4 e-commerce, Stack Overflow, and Bitcoin. They are real-world fixtures for exercising OKF Studio beyond this self-describing docs bundle.
resource: https://github.com/GoogleCloudPlatform/knowledge-catalog/tree/main/okf/bundles
tags: [reference, okf, samples, fixtures, external]
generated: { by: claude/unrecorded, at: 2026-07-22T23:58:00Z }
sources:
  - resource: "https://github.com/GoogleCloudPlatform/knowledge-catalog/tree/main/okf/bundles"
    title: OKF sample bundles directory
  - resource: okf-spec-summary.md
    title: OKF Spec Summary
---

# Summary

The OKF reference repository ships three browsable sample bundles under `bundles/`, each paired with a `samples/` recipe that reproduces it from source data. Google's own producer authored them, and they stand as the canonical examples of conformant OKF. This is a dated snapshot for implementers. The canonical bundles are in the `resource` above.

# The bundles

- GA4 e-commerce: a Google Analytics 4 e-commerce dataset, modeled as concepts for tables, columns, and metrics.
- Stack Overflow: the public Stack Overflow dataset as interlinked concepts.
- Bitcoin: the Bitcoin blockchain dataset, including web-pass [reference concepts](okf-reference-visualizer.md) minted from seed URLs.

Each bundle carries a `samples/` recipe, the reproducible procedure that regenerates it. The examples are therefore re-derivable rather than frozen.

# Value to OKF Studio

This `docs/` bundle is self-describing: it documents Studio using Studio's own format. That makes it a good first fixture but a narrow one. The sample bundles add real-world fixtures that exercise paths the self-describing bundle does not:

- Diverse `type` values: table, column, metric, and reference types beyond this bundle's vocabulary, stressing type-colored nodes and [filters](../features/search-and-filter.md).
- Larger graphs: more nodes and denser link structure, exercising layout and rendering at scale.
- Tolerant-consumer paths: independently authored bundles surface the soft issues (unknown types, missing optional fields, broken links) that [Validation](../features/validation.md) must tolerate rather than reject.

For that reason [Testing](../architecture/testing.md) keeps reduced, licensed excerpts from all three bundles in the pure parser corpus. The excerpts pin to Google commit `d44368c15e38e7c92481c5992e4f9b5b421a801d`. Their manifest freezes graph, validation, type, and extension expectations without making test execution depend on GitHub. Testing also validates [Folder Autodetect](../features/folder-autodetect.md) against a folder holding several bundles at once. Together these checks keep Studio honest against bundles it did not author. See the [OKF Spec Summary](okf-spec-summary.md) for the rules these bundles conform to.
