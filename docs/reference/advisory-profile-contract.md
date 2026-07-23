---
type: Reference
title: Advisory Profile Contract
description: The local, version-pinned descriptor contract for optional bundle conventions and diagnostics.
tags: [reference, profiles, extensions, validation, security]
timestamp: 2026-07-23T14:45:00Z
---

# Purpose

An advisory profile lets a team name recommended or profile-required metadata, a relationship vocabulary, and deterministic health checks without adding requirements to core OKF. Studio keeps profile diagnostics separate from OKF validation. A missing, malformed, or unsupported profile leaves the bundle open and its unknown metadata visible.

# Root declaration

The root `index.md` declares profiles as a map keyed by a reverse-domain namespace. Every declaration pins an exact semantic version and points to a JSON file inside the bundle:

```yaml
profiles:
  com.example.knowledge:
    version: "1.2.0"
    descriptor: profiles/com.example.knowledge.json
```

Studio accepts at most 16 declarations. A namespace uses dot-separated lowercase identifiers. A version is an exact three-part semantic version, not a range. A descriptor path uses forward slashes, ends in `.json`, contains only normal relative path components, and must resolve inside the authorized bundle even when symbolic links are present.

Unknown declaration values remain in `Bundle.extra` and in the profile report, but have no behavior.

# Descriptor

A descriptor is UTF-8 JSON no larger than 256 KiB:

```json
{
  "schemaVersion": 1,
  "namespace": "com.example.knowledge",
  "version": "1.2.0",
  "title": "Team knowledge",
  "description": "Advisory conventions for maintained team guidance.",
  "fields": [
    {
      "id": "owner",
      "scope": "concept",
      "key": "owner",
      "label": "Owner",
      "valueType": "string",
      "expectation": "recommended",
      "conceptTypes": ["Guide"],
      "examples": ["Docs"]
    }
  ],
  "relationships": [
    {
      "id": "supports",
      "label": "Supports",
      "inverse": "supported-by",
      "description": "This concept provides evidence or implementation support."
    }
  ],
  "checks": [
    {
      "kind": "field-present",
      "id": "owner-present",
      "scope": "concept",
      "field": "owner",
      "conceptTypes": ["Guide"],
      "level": "recommendation",
      "message": "Name the team responsible for this guide."
    }
  ]
}
```

`scope` is `bundle` or `concept`. Field value types are `string`, `number`, `boolean`, `array`, or `object`. An expectation is `recommended` or `required`; both belong to the profile and neither is an OKF requirement.

Schema version 1 has two executable meanings, both deterministic data checks:

- `field-present` reports a missing or empty value.
- `field-one-of` reports a value outside the descriptor's literal `values` list.

Checks may apply to all concepts or to the listed `conceptTypes`. Levels are `information`, `recommendation`, and `warning`. Unknown descriptor keys are retained for inspection but never interpreted. Limits are 128 fields, 128 relationships, and 256 checks. IDs, field paths, labels, descriptions, and messages are bounded and validated before a profile becomes active.

# Typed relationship annotations

A concept can annotate an ordinary Markdown link with a relationship defined by an active profile:

```yaml
relationships:
  com.example.knowledge:
    supports: [features/graph-view, reference/glossary]
```

The map path is `relationships.<profile namespace>.<relationship type>`. A type accepts one bundle concept ID or an array of IDs. The concept body remains the portable source of the graph edge, so it also links to each target with ordinary Markdown. The annotation adds a label and optional inverse from the active descriptor; it never creates a core OKF edge by itself.

The profile report returns every structurally valid annotation with its source, target, namespace, type, label, inverse, recognition state, target state, and portable-link state. An unavailable profile or unknown type stays visible under its authored identifier. Missing targets, missing prose links, duplicates, malformed maps, and limits produce profile diagnostics, not OKF issues. Studio reads at most 64 annotations per concept and 4,096 per report.

# Resolution and failure states

The Rust core resolves descriptors from the open bundle only. It does not search registries, follow URLs, load libraries, evaluate expressions, or run hooks. Each declaration becomes either:

- **Active** — identity and version match, the descriptor passes structural checks, and its advisory diagnostics are available.
- **Unavailable** — the report names the exact declaration problem, missing file, containment failure, size limit, parse failure, unsupported schema, identity mismatch, or invalid descriptor item.

An unavailable profile produces no profile diagnostics because Studio cannot claim its rules are understood. Its declaration and all producer metadata remain available through the [Metadata Inspector](../features/metadata-inspector.md).

# Security and conformance boundary

Profile resolution uses the existing bundle grant and rejects path traversal and symbolic-link escapes. It performs local reads only. Descriptor content cannot start network work or code execution. A profile report is a separate diagnostic contract and never enters `Bundle.issues`, suppresses an OKF issue, hides an unknown field or relationship type, or changes whether the bundle is conformant.

Related contracts: [Data Model](../architecture/data-model.md), [IPC and Security](../architecture/ipc-and-security.md), [Validation](../features/validation.md), and the [OKF Ecosystem Response](../product/okf-ecosystem-response-roadmap.md).
