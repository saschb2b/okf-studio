---
type: Reference
title: Data Model
description: The Bundle, Concept, graph, index, and log shapes the Rust core computes and the frontend renders.
tags: [architecture, data-model, schema]
generated: { by: claude/unrecorded, at: 2026-07-23T00:28:00Z }
---

# Shapes

The [Rust core](tech-stack.md) computes these from [parsing](okf-parsing.md) and serializes them across the [IPC boundary](ipc-and-security.md) as JSON. These are the shared TypeScript types. The [React + TypeScript frontend](frontend-architecture.md) consumes that JSON directly against them:

```ts
interface Bundle {
  root: string;            // absolute path of the bundle root
  name: string;            // from root index.md H1, else dir name
  okfVersion: string | null;
  odsfVersion: string | null;  // ODSF profile version, if the root declares one
  extra: Record<string, unknown>;  // other root index frontmatter, preserved
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
  timestamp: string | null;  // v0.1's authored-at; read via authoredAt(), not directly
  resource: string | null;

  // OKF v0.2: provenance, trust and lifecycle. Always present in the payload —
  // an absent family is [] or null — so a consumer never branches on undefined.
  sources: Source[];               // where claims came from, with credibility signals
  usageWindow: UsageWindow | null; // frames every sources[].usageCount
  generated: Attribution | null;   // who wrote it, and when
  verified: Attribution[];         // who has since confirmed it; trust tier derives from this
  status: "draft" | "stable" | "experimental" | "deprecated";  // absent means stable
  staleAfter: string | null;       // absolute YYYY-MM-DD; stale on or after
  computation: ComputationContract | null;  // only on type: Attested Computation

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

- **Studio reads two v0.1 fields through accessors, never directly.** OKF v0.2 replaced `timestamp` with `generated: { by, at }`, and the `# Citations` body section with `sources` frontmatter. The spec permits a consumer to fall back to the older form. `authoredAt()` prefers `generated.at` and falls back to `timestamp`. The parser reads a legacy `# Citations` list into `sources` when `sources` is absent, and invents no credibility signals it does not have. Everything downstream reads one field and never learns which spec version a bundle targets. That is what keeps the tolerant-consumer contract out of every surface.
- **Studio derives trust and staleness rather than storing them.** A bundle cannot declare itself trusted. It records who confirmed it in `verified`. Studio computes the tier (unverified, machine-confirmed, human-reviewed) from the `human:` prefix in the actor convention. `generated` is authorship, not confirmation. A concept with full provenance and no `verified` stays unverified. Collapsing the two would lose the only signal that separates reviewed knowledge from generated knowledge. The staleness check takes the date as an argument rather than reading the clock, so it stays a comparison a test can pin.
- **`status` is a spec field, not a producer key.** OKF v0.2 claimed it with `draft | stable | deprecated`. ODSF v0.1 had defined it as `stable | experimental | deprecated`. ODSF v0.2 makes OKF's set normative and keeps `experimental` as a profile extension. Studio reads ODSF tokens, so it recognizes all four. Absent means `stable`.
- **A computation contract belongs to its type.** The parser assembles `runtime`, `parameters`, `executor` and `attester` into `Concept.computation` only for `type: Attested Computation`. On any other concept they stay ordinary producer keys, and promoting them would invent a computation the bundle never declared. See [OKF parsing](okf-parsing.md) for what Studio checks about a run.
- **`extra` preserves producer keys** rather than dropping them, per the spec's extension contract. `Bundle.extra` contains every parsed root `index.md` field except the promoted `okf_version` and `odsf_version`. `Concept.extra` contains every field except the promoted concept keys. Nested maps and lists retain their parsed order. This distinction matters because a field such as `title` is recognized on a concept but remains producer metadata at the bundle root.
- The frontend derives the edge list and the type-to-color map from `concepts`. The core does not dictate presentation (see [Frontend Architecture](frontend-architecture.md) for these derived/computed stores).
- IDs are the join key everywhere: links, backlinks, selection, and [navigation history](../features/navigation.md) all reference Concept IDs.
- **`indexes` carry `synthesized`** so the [navigation](../features/navigation.md) sidebar can mark which listings the core built for directories that lacked an `index.md`. The spec permits synthesizing one on the fly.
- **`log` preserves each date heading verbatim**, even a non-ISO one, so the [Log View](../features/log-view.md) renders it while [Validation](../features/validation.md) warns separately. Tolerance and reporting stay decoupled.
