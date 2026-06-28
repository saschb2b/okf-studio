---
type: Reference
title: Data Model
description: The Bundle, Concept, and Graph shapes the Rust core computes and the frontend renders.
tags: [architecture, data-model, schema]
timestamp: 2026-06-28T12:00:00Z
---

# Shapes

The [Rust core](tech-stack.md) computes these from [parsing](okf-parsing.md) and serializes them across the [IPC boundary](ipc-and-security.md) as JSON. Illustrative TypeScript:

```ts
interface Bundle {
  root: string;            // absolute path of the bundle root
  name: string;            // from root index.md H1, else dir name
  okfVersion: string | null;
  concepts: Concept[];
  indexes: IndexNode[];    // parsed/synthesized index.md tree (navigation)
  log: LogEntry[];         // parsed log.md, newest first
  issues: Issue[];         // validation results
  confidence: "confident" | "candidate";
}

interface Concept {
  id: string;              // path minus .md, relative to root, e.g. "tables/orders"
  type: string;            // required by OKF; "" only on a non-conformant concept
  title: string;           // frontmatter title, else derived from id
  description: string;
  tags: string[];
  timestamp: string | null;
  resource: string | null;
  extra: Record<string, unknown>;  // any other frontmatter keys, preserved
  body: string;            // raw markdown (rendered in the frontend)
  links: string[];         // resolved intra-bundle target Concept IDs
  externalLinks: string[]; // http(s)/mailto targets
  brokenLinks: string[];   // intra-bundle hrefs that resolve to no concept
  citedBy: string[];       // reverse of links (backlinks)
  degree: number;          // links.length + citedBy.length, for node sizing
}

interface GraphEdge { source: string; target: string; }  // derived from concepts[].links
interface Issue { conceptId: string | null; level: "error" | "warning"; message: string; }
```

# Notes

- **`extra` preserves unknown keys** rather than dropping them, per the spec's extension contract — useful for domain-specific frontmatter a future feature might surface.
- The frontend derives the **edge list** and the **type → color** map from `concepts`; the core does not dictate presentation (see [Frontend Architecture](frontend-architecture.md) for these derived/computed stores).
- IDs are the join key everywhere: links, backlinks, selection, and [navigation history](../features/navigation.md) all reference Concept IDs.
