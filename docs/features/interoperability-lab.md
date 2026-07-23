---
type: Feature
title: Interoperability Lab
description: Inspect and exercise multilingual, external-reference, JSON-LD, and sidecar conventions without making them core OKF.
tags: [feature, interoperability, experiments, multilingual, json-ld, sidecars]
timestamp: 2026-07-23T23:30:00Z
language: en
sidecars:
  assets/interop-sample.json:
    media_type: application/json
    digest: sha256:fff42913a3d9a5d5aa9efc1c8a0a8aca21b217b2955ea08e77a85dfa33ad1268
---

# User job and value

A bundle producer needs to test exchange conventions with real files and real Studio behavior before asking every OKF consumer to support them. The root folder home therefore exposes an **Interoperability Lab** when it finds a declaration from one of four bounded experiments.

The lab is advisory. Its results do not enter `Bundle.issues`, change OKF validation, fetch on open, execute bundle content, or write to the open bundle.

# Multilingual variants

Studio inventories three observed conventions:

| Convention | What Studio reads | Current value | Known gap |
| --- | --- | --- | --- |
| Frontmatter | `language` on a concept | Stable filenames and searchable authored language | A language alone does not identify siblings |
| Filename suffix | A final language-shaped suffix such as `.de` | Visible without frontmatter parsing | A base rename can split the set |
| Translation reference | `language` plus `translation_of` | Explicit base identity with ordinary concept files | Safe Move does not rewrite this producer field |

The lab groups candidate variants and opens each concept in the existing reader. Search and retrieval continue to see every variant as an ordinary concept. Projection evaluates every selected variant independently. Studio does not choose a default language convention because link, rename, and complete projection behavior have not passed the adoption gate together.

The built-in bundle dogfoods the translation-reference form through the German [Interoperabilitätslabor](interoperability-lab.de.md).

# External bundle registry

The root extension is a map keyed by a local alias:

```yaml
external_bundles:
  google-okf:
    url: https://github.com/GoogleCloudPlatform/knowledge-catalog
    digest: okf-health-revision-0123456789abcdef # optional cached revision
    cache: external/google-okf                  # optional existing local cache
```

Opening a bundle only inspects this declaration. It makes no request. **Review resolution** places the URL in the existing Open-from-URL dialog, where the user sees and confirms the supported GitHub or archive source before Rust fetches it.

A local cache path must be a real contained directory. Studio parses it read-only and compares its bundle revision with the optional digest. External concept identity begins with `external:<alias>:` and cannot collide with a local concept ID.

# Semantic-web exchange

**Export JSON-LD** projects the subset of profile-typed relationships that also have a portable Markdown link and an existing local target. The document contains source and target concept IDs, profile namespace, relationship type, bundle revision, and a loss report. It does not turn JSON-LD into an alternate OKF syntax.

**Preview JSON-LD import** reads at most 2 MiB from an explicit native file choice. It accepts only that declared relationship subset, reports malformed or unsupported items with JSON paths, and writes nothing. An imported preview must later enter a separately designed reviewed authoring transaction before it can change Markdown.

Exports cannot be saved inside the open bundle. The round-trip fixture proves that the declared subset survives and every rejected construct remains visible.

# Sidecar resources

A concept may declare a path-keyed map:

```yaml
sidecars:
  assets/analysis.ipynb:
    media_type: application/x-ipynb+json
    digest: sha256:0123456789abcdef
```

Rust accepts only normal bundle-relative paths whose canonical file remains inside the granted root. It reads at most 64 MiB, computes a SHA-256 digest, compares an optional authored digest, records media type and size, and assigns one of two policies:

- **safe-preview** means the media type can use an existing inert Studio preview path;
- **download-only** means Studio will never execute it or render it as trusted HTML.

Every ready sidecar can be copied through an explicit native save dialog outside the open bundle. Missing, oversize, invalid, escaping, or digest-mismatched files cannot be exported.

# Bounds and non-goals

The report accepts at most 2,048 language variants, 64 external references, 4,096 semantic-web items, and 2,048 sidecars. Unknown fields remain preserved in bundle metadata. Reaching a bound makes the report incomplete rather than silently successful.

This package does not establish a language standard, background federation, RDF reasoning, OWL support, notebook execution, trusted HTML rendering, or a new required OKF field.

Research records: [Multilingual Variants](../reference/multilingual-variants-experiment.md), [External Bundle References](../reference/external-bundle-references-experiment.md), [Semantic-Web Exchange](../reference/semantic-web-exchange-experiment.md), and [Sidecar Resources](../reference/sidecar-resources-experiment.md). Security details: [IPC and Security](../architecture/ipc-and-security.md).
