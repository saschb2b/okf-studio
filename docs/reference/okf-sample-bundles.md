---
type: Reference
title: OKF Sample Bundles
description: The three browsable OKF sample bundles — GA4 e-commerce, Stack Overflow, and Bitcoin — that serve as real-world fixtures for exercising OKF Studio beyond this self-describing docs bundle.
resource: https://github.com/GoogleCloudPlatform/knowledge-catalog/tree/main/okf/bundles
tags: [reference, okf, samples, fixtures, external]
timestamp: 2026-07-22T23:58:00Z
---

# Summary

The OKF reference repository ships three browsable **sample bundles** under `bundles/`, each paired with a `samples/` recipe that reproduces it from source data. They are authored by Google's own producer and stand as the canonical examples of conformant OKF. This is a dated snapshot for implementers; the canonical bundles are in the `resource` above.

# The bundles

- **GA4 e-commerce** — a Google Analytics 4 e-commerce dataset, modeled as concepts for tables, columns, and metrics.
- **Stack Overflow** — the public Stack Overflow dataset as interlinked concepts.
- **Bitcoin** — the Bitcoin blockchain dataset, including web-pass [reference concepts](okf-reference-visualizer.md) minted from seed URLs.

Each is accompanied by a `samples/` recipe — the reproducible procedure that regenerates the bundle, so the examples are not frozen artifacts but living, re-derivable ones.

# Value to OKF Studio

This `docs/` bundle is **self-describing** — it documents Studio using Studio's own format. That makes it a good first fixture but a narrow one. The sample bundles add **real-world fixtures** that exercise paths the self-describing bundle does not:

- **Diverse `type` values** — table, column, metric, and reference types beyond this bundle's vocabulary, stressing type-colored nodes and [filters](../features/search-and-filter.md).
- **Larger graphs** — more nodes and denser link structure, exercising layout and rendering at scale.
- **Tolerant-consumer paths** — independently authored bundles surface the soft issues (unknown types, missing optional fields, broken links) that [Validation](../features/validation.md) must tolerate rather than reject.

For that reason [Testing](../architecture/testing.md) keeps reduced, licensed excerpts from all three bundles in the pure parser corpus. The excerpts are pinned to Google commit `d44368c15e38e7c92481c5992e4f9b5b421a801d`; their manifest freezes graph, validation, type, and extension expectations without making test execution depend on GitHub. [Folder Autodetect](../features/folder-autodetect.md) is also validated against a folder holding several bundles at once. Together these checks keep Studio honest against bundles it did not author. See the [OKF Spec Summary](okf-spec-summary.md) for the rules these bundles conform to.

# Citations

[1] [OKF sample bundles directory](https://github.com/GoogleCloudPlatform/knowledge-catalog/tree/main/okf/bundles)
[2] [OKF Spec Summary](okf-spec-summary.md)
