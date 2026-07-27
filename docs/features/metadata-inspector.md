---
type: Feature
title: Metadata Inspector
description: Inspect producer-defined bundle and concept fields safely without requiring a custom renderer.
tags: [feature, metadata, extensions, reader, portability]
generated: { by: claude/unrecorded, at: 2026-07-23T21:24:41+02:00 }
---

# What it does

The Metadata Inspector renders preserved producer fields from the bundle root and the active concept. Bundle metadata has its own view in **Bundle details**, opened from the Info action beside Share in the persistent [title bar](../ux/browsing-layout.md). The dialog keeps bundle identity, format, concept count, [OKF conformance](validation.md), root metadata, [ignore rules](ignore-rules.md), and [advisory profiles](advisory-profiles.md) together without turning Bundle Home into an administration page. Its Connections view is a compact summary that opens the dedicated [Bundle Connections](interoperability-lab.md) workspace instead of fitting operational controls into the About dialog. Concept metadata stays in the Concept Reader context rail with its bundle-relative Markdown file as the source.

Keys, scalar values, objects, and arrays render as React text. Metadata never becomes HTML. Each scalar and top-level branch has a copy action; copied objects use the same bounded representation shown by the inspector. The source label and dotted path make a copied or reported value traceable to its authored location.

# Bounds

The inspector renders at most 64 children per object or array, five nested levels, 256 substantive nodes, and 2,048 characters per scalar. Copy output is capped at 65,536 characters. Every reached limit produces an explicit omission or truncation label. Collapsible branches keep ordinary metadata compact, and the limits prevent a large or hostile extension tree from blocking the reader.

These are presentation limits only. The complete parsed value remains in the [data model](../architecture/data-model.md), crosses typed IPC, and remains available to bounded agent inventory. An omitted display branch is not deleted from the bundle.

# Profile-specific rendering

Recognized ODSF keys remain owned by [Design-System Rendering](design-system-rendering.md): `tokens`, `examples`, `status`, and `applies_to` do not repeat in the generic concept inspector. Unknown keys stay visible. Future advisory profiles may add their own renderer, but absence of one never hides the preserved field.

# Security and conformance

Opening or expanding metadata performs no filesystem write, network request, or code execution. Copy uses the ordinary browser clipboard only after a named user action. Producer metadata remains advisory and cannot alter [Validation](validation.md).

Related behavior: [Concept Reader](concept-reader.md), [Compatibility Clinic](compatibility-clinic.md), and [OKF Parsing](../architecture/okf-parsing.md).
