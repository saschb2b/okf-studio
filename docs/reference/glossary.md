---
type: Glossary
title: Glossary
description: Terms used across the OKF Studio bundle.
tags: [reference, glossary]
generated: { by: claude/unrecorded, at: 2026-07-13T19:21:18Z }
---

# Terms

- **Backlink ("Cited by")**: The reverse of a cross-link: the set of concepts that link *to* a given concept. See [Concept Reader](../features/concept-reader.md).
- **Barnes–Hut approximation**: An n-body optimization that treats distant node clusters as a single mass, making the force-directed layout scale to larger graphs. See [Performance](../architecture/performance.md).
- **Bundle**: A self-contained directory of OKF markdown files. It is the unit OKF Studio opens and renders. See [Bundle Detection](../architecture/bundle-detection.md).
- **Bundle root**: The top directory of a bundle, optionally declaring `okf_version` in its `index.md`.
- **Capability**: A Tauri v2 permission grant: a `capabilities/` config that allows specific commands and paths, scoped to a window. See [IPC & Security](../architecture/ipc-and-security.md).
- **Command palette**: A keyboard-driven launcher for navigating to concepts and running actions without the mouse. See [Command Palette](../features/command-palette.md).
- **Concept**: One unit of knowledge: a single non-reserved `.md` file with frontmatter and a markdown body. Rendered as one [graph](../features/graph-view.md) node.
- **Concept ID**: A concept's identity: its file path within the bundle with `.md` removed (`tables/orders.md` → `tables/orders`). The join key for links, backlinks, and selection.
- **Conformance**: Whether a bundle satisfies the OKF hard rule (a `type` on every concept). Surfaced by [Validation](../features/validation.md).
- **Cross-link**: A markdown link from one concept to another, asserting a relationship. It becomes a directed [graph](../features/graph-view.md) edge.
- **Debounce**: Coalescing a burst of filesystem watch events into a single reload so rapid edits don't thrash the view. See [Live Reload](../features/live-reload.md).
- **Degree**: The number of links touching a concept. It sizes [graph](../features/graph-view.md) nodes, so well-connected concepts read larger. See also the [data model](../architecture/data-model.md).
- **Force-directed graph (layout)**: A graph drawing where nodes repel and links attract, so clusters emerge from the link structure rather than a fixed grid. See [Graph View](../features/graph-view.md).
- **Frontmatter**: The leading `---`-fenced YAML block of a concept. It carries `type` (required) and recommended fields, and keeps unknown keys.
- **`okf_version`**: A `<major>.<minor>` version string declared only in the bundle-root `index.md`, e.g. `"0.1"`. See [OKF Spec Summary](okf-spec-summary.md).
- **Persona**: A representative user archetype the product targets, used to ground feature decisions. See [Personas](../product/personas.md).
- **Progressive disclosure**: Navigating via `index.md` files, revealing detail on demand rather than reading everything. See [Navigation](../features/navigation.md).
- **Reference concept**: A concept that mirrors external material (a webpage, tool, or spec), authored with `type: Reference` and the source URL in `resource`. Used throughout this section.
- **Reserved file**: `index.md` (directory listing / progressive disclosure) or `log.md` (dated change history). Never a concept.
- **Scope**: The canonical active bundle root used by Studio's mediated reads and reviewed writes. Source, export, and destination pickers authorize separate operations. The bundle scope does not confine external ACP processes. See [IPC & Security](../architecture/ipc-and-security.md).
- **Tolerant consumer**: A reader that never rejects a bundle for soft issues (missing fields, unknown types, broken links). A core [principle](../product/principles.md) and a spec requirement.
- **Type**: The kind of a concept (`Feature`, `Reference`, `Metric`, …). Open-ended. It drives node [color](../ux/theming.md) and [filters](../features/search-and-filter.md). The only field OKF requires.
