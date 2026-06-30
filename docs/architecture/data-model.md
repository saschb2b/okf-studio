---
type: Reference
title: Data Model
description: The Bundle, Concept, graph, index, and log shapes the Rust core computes and the frontend renders.
tags: [architecture, data-model, schema]
timestamp: 2026-06-30T12:00:00Z
---

# Shapes

The [Rust core](tech-stack.md) computes these from [parsing](okf-parsing.md) and serializes them across the [IPC boundary](ipc-and-security.md) as JSON. These are the shared TypeScript types — the [React + TypeScript frontend](frontend-architecture.md) consumes that JSON directly against them:

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

// Parsed (or synthesized) index.md, one per directory, mirroring the tree for navigation.
interface IndexNode {
  dir: string;               // directory path relative to root ("" = bundle root)
  title: string;             // index.md H1, else the directory name
  synthesized: boolean;      // true if no index.md existed and the core built one
  sections: IndexSection[];  // the index's headed groups, in document order
}
interface IndexSection { heading: string; entries: IndexEntry[]; }
interface IndexEntry {
  title: string;             // link text
  target: string;            // Concept ID, or a subdirectory path for a directory entry
  description: string;       // the short blurb after the link, if any
  kind: "concept" | "directory";
}

// One date-grouped block of a parsed log.md, in file order (newest first).
interface LogEntry {
  date: string;              // the "## " heading verbatim, even if not ISO YYYY-MM-DD
  entries: string[];         // the bullet lines under that date, as raw markdown
}
```

# Notes

- **`extra` preserves unknown keys** rather than dropping them, per the spec's extension contract — including **nested maps and lists in author order** (an [ODSF](../reference/okf-spec-summary.md) `tokens:` tree arrives as an ordered object), which is what a design-aware consumer surfaces. The [parser](okf-parsing.md) is indentation-aware for exactly this.
- The frontend derives the **edge list** and the **type → color** map from `concepts`; the core does not dictate presentation (see [Frontend Architecture](frontend-architecture.md) for these derived/computed stores).
- IDs are the join key everywhere: links, backlinks, selection, and [navigation history](../features/navigation.md) all reference Concept IDs.
- **`indexes` carry `synthesized`** so the [navigation](../features/navigation.md) sidebar can mark which listings the core built for directories that lacked an `index.md` — the spec permits synthesizing one on the fly.
- **`log` preserves each date heading verbatim**, even a non-ISO one, so the [Log View](../features/log-view.md) renders it while [Validation](../features/validation.md) warns separately; tolerance and reporting stay decoupled.
