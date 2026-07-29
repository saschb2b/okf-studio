---
type: Feature
title: Bundle Connections
description: Resolve external knowledge, exchange portable relationships, and inspect optional conventions from the surface where each task is used.
tags: [feature, interoperability, connections, multilingual, json-ld, sidecars]
generated: { by: claude/unrecorded, at: 2026-07-23T21:24:41+02:00 }
language: en
sidecars:
  assets/interop-sample.json:
    media_type: application/json
    digest: sha256:fff42913a3d9a5d5aa9efc1c8a0a8aca21b217b2955ea08e77a85dfa33ad1268
---

# User job and placement

A bundle producer needs to connect external knowledge and test exchange conventions without turning the bundle home into a technical dashboard. Studio places each capability where its result can be acted on:

- **Bundle details** has a compact Connections summary and opens the full workspace.
- **Bundle connections** separates External sources, Relationship exchange, and Diagnostics into focused tabs. It opens from Bundle details or the command launcher.
- The **Concept Reader** shows a language selector and companion resources only for the active concept.

The former root-level Interoperability Lab is removed. [Bundle Home](bundle-home.md) stays on activity, resumption, validation, links, and repository work.

# Demand-driven inspection

The full connection report rereads the bundle, analyzes profile relationships, and verifies declared sidecar files. Studio does not run that work while opening Bundle Home, a folder home, or an ordinary concept. It runs when the user opens Bundle connections or reads a concept whose own fields or translated siblings require contextual controls. One in-flight result is shared by the requesting surfaces for the current bundle revision.

This keeps normal navigation responsive and preserves the safety boundary: report generation makes no network request, executes no bundle content, and writes nothing.

# External sources

The root extension is a map keyed by a local alias:

```yaml
external_bundles:
  google-okf:
    url: https://github.com/GoogleCloudPlatform/knowledge-catalog
    digest: okf-health-revision-0123456789abcdef # optional cached revision
    cache: external/google-okf                  # optional existing local cache
```

Opening a bundle only preserves this declaration. The External sources tab shows its local state and provides **Resolve source** or **Review source**. Resolution then places the URL in the existing Open-from-URL dialog, where the user confirms the supported GitHub or archive source before Rust fetches it.

A local cache path must be a real contained directory. Studio parses it read-only and compares its bundle revision with the optional digest. External concept identity begins with `external:<alias>:` and cannot collide with a local concept ID.

# Relationship exchange

The Relationship exchange tab reports the portable and unsupported subsets before offering two explicit actions.

**Export JSON-LD** projects the subset of profile-typed relationships that also have a portable Markdown link and an existing local target. The document contains source and target concept IDs, profile namespace, relationship type, bundle revision, and a loss report. It does not turn JSON-LD into an alternate OKF syntax.

**Preview JSON-LD import** reads at most 2 MiB from an explicit native file choice. It accepts only that declared relationship subset, reports malformed or unsupported items with JSON paths, and writes nothing. A later import that changes Markdown requires a separately designed reviewed authoring transaction.

Exports cannot be saved inside the open bundle. The round-trip fixture proves that the declared subset survives and every rejected construct remains visible.

# Language variants in the reader

Studio inventories three observed conventions:

| Convention | What Studio reads | Current value | Known gap |
| --- | --- | --- | --- |
| Frontmatter | `language` on a concept | Stable filenames and searchable authored language | A language alone does not identify siblings |
| Filename suffix | A final language-shaped suffix such as `.de` | Visible without frontmatter parsing | A base rename can split the set |
| Translation reference | `language` plus `translation_of` | Explicit base identity with ordinary concept files | Safe Move does not rewrite this producer field |

When the active concept belongs to a detected set, its reader header shows a language selector that opens the chosen sibling through ordinary concept navigation. Search, retrieval, projection, and every other consumer continue to treat each variant as an ordinary concept. Studio does not select a default convention because link, rename, and complete projection behavior have not passed the adoption gate together.

The built-in bundle dogfoods the translation-reference form through the German [Interoperabilitätslabor](interoperability-lab.de.md).

# Companion resources in the reader

A concept may declare a path-keyed map:

```yaml
sidecars:
  assets/analysis.ipynb:
    media_type: application/x-ipynb+json
    digest: sha256:0123456789abcdef
```

The active concept's reader rail lists only its resources, including integrity state, media type, size, and a **Save copy** action when the file is eligible.

Rust accepts only normal bundle-relative paths whose canonical file remains inside the granted root. It reads at most 64 MiB, computes a SHA-256 digest, compares an optional authored digest, records media type and size, and assigns one of two policies:

- **safe-preview** means the media type can use an existing inert Studio preview path
- **download-only** means Studio will never execute it or render it as trusted HTML.

Every ready resource can be copied through an explicit native save dialog outside the open bundle. Missing, oversize, invalid, escaping, or digest-mismatched files cannot be exported.

# Diagnostics and bounds

The Diagnostics tab keeps technical evidence for optional conventions separate from [OKF validation](validation.md). It compares detected language conventions, reports external declaration state, explains relationship portability, and lists resource integrity findings.

The report accepts at most 2,048 language variants, 64 external references, 4,096 semantic-web items, and 2,048 resources. Unknown fields remain preserved in bundle metadata. Reaching a bound makes the report incomplete rather than silently successful.

This feature does not establish a language standard, background federation, RDF reasoning, OWL support, notebook execution, trusted HTML rendering, or a new required OKF field.

Research records: [Multilingual Variants](../reference/multilingual-variants-experiment.md), [External Bundle References](../reference/external-bundle-references-experiment.md), [Semantic-Web Exchange](../reference/semantic-web-exchange-experiment.md), and [Sidecar Resources](../reference/sidecar-resources-experiment.md). Security details: [IPC and Security](../architecture/ipc-and-security.md).
