---
type: Feature
title: Metadata Inspector
description: Inspect producer-defined bundle and concept fields safely without requiring a custom renderer.
tags: [feature, metadata, extensions, reader, portability]
timestamp: 2026-07-23T19:58:47+02:00
---

# What it does

The Metadata Inspector renders preserved producer fields from the bundle root and the active concept. Bundle metadata appears in **Bundle details**, opened from the bundle's format label in the persistent [status bar](../ux/browsing-layout.md). The dialog keeps the declared format, concept count, root location, metadata, [ignore rules](ignore-rules.md), and [advisory profiles](advisory-profiles.md) together without turning the root overview into an administration page. Concept metadata stays in the Concept Reader context rail with its bundle-relative Markdown file as the source.

Keys, scalar values, objects, and arrays render as React text. Metadata never becomes HTML. Each scalar and top-level branch has a copy action; copied objects use the same bounded representation shown by the inspector. The source label and dotted path make a copied or reported value traceable to its authored location.

# Bounds

The inspector renders at most 64 children per object or array, five nested levels, 256 substantive nodes, and 2,048 characters per scalar. Copy output is capped at 65,536 characters. Every reached limit produces an explicit omission or truncation label. Collapsible branches keep ordinary metadata compact, and the limits prevent a large or hostile extension tree from blocking the reader.

These are presentation limits only. The complete parsed value remains in the [data model](../architecture/data-model.md), crosses typed IPC, and remains available to bounded agent inventory. An omitted display branch is not deleted from the bundle.

# Profile-specific rendering

Recognized ODSF keys remain owned by [Design-System Rendering](design-system-rendering.md): `tokens`, `examples`, `status`, and `applies_to` do not repeat in the generic concept inspector. Unknown keys stay visible. Future advisory profiles may add their own renderer, but absence of one never hides the preserved field.

# Security and conformance

Opening or expanding metadata performs no filesystem write, network request, or code execution. Copy uses the ordinary browser clipboard only after a named user action. Producer metadata remains advisory and cannot alter [Validation](validation.md).

Related behavior: [Concept Reader](concept-reader.md), [Compatibility Clinic](compatibility-clinic.md), and [OKF Parsing](../architecture/okf-parsing.md).
