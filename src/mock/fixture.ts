// A tiny in-memory OKF bundle so the UI renders (and tests run) without the
// Rust backend. Mirrors the shape the core produces; backlinks/degree derived.

import type { Bundle, BundleRoot, Concept } from "../types.ts";

export const MOCK_FOLDER = "/mock/workspace";

type RawConcept = Omit<Concept, "citedBy" | "degree" | "brokenLinks"> &
  Partial<Pick<Concept, "brokenLinks">>;

const raw: RawConcept[] = [
  {
    id: "product/overview",
    type: "Product",
    title: "Overview",
    description: "What OKF Viewer is and who it's for.",
    tags: ["product", "vision"],
    timestamp: "2026-06-28T00:00:00Z",
    resource: null,
    extra: {},
    body:
      "## What it is\n\n" +
      "A desktop app that renders [OKF](../reference/glossary.md) bundles as a [graph](../features/graph-view.md). It is built for the analyst who keeps a folder of markdown notes and wants to traverse the cross-links offline, without a server.\n\n" +
      "> [!NOTE]\n> Everything ships in one binary — no signup, no telemetry, nothing leaves your machine.\n\n" +
      "## How it works\n\n" +
      "Point it at a folder; it finds every bundle inside and renders each as an interactive graph alongside this reader.\n\n" +
      "### Pipeline\n\n" +
      "1. Scan the folder for bundles\n2. Parse each concept and its links\n3. Render the graph and the reader\n\n" +
      "```ts\nconst bundle = await readBundle(root);\nrenderGraph(bundle);\n```\n\n" +
      "### At a glance\n\n" +
      "| Stage | Runs in |\n| --- | --- |\n| Scan | Rust core |\n| Parse | Rust core |\n| Render | Frontend |\n\n" +
      "> [!WARNING]\n> Broken cross-links are surfaced, never hidden — the viewer is a tolerant consumer.\n\n" +
      "## Who it's for\n\n" +
      "Engineers and agent builders who keep knowledge in their repos and want to *read* it, not just grep it.",
    links: ["features/graph-view", "reference/glossary"],
    externalLinks: [],
  },
  {
    id: "features/graph-view",
    type: "Feature",
    title: "Graph View",
    description: "Force-directed graph of concepts, colored by type.",
    tags: ["feature", "graph"],
    timestamp: "2026-06-28T00:00:00Z",
    resource: null,
    extra: {},
    body: "# What it does\n\nRenders the bundle as a force-directed graph and colors each node by its concept type. Dragging a node nudges its neighbors; clicking one opens it in the [reader](concept-reader.md). The simulation settles quickly even for large bundles, and the layout is deterministic so the picture is stable between runs. Shapes derive from the [data model](../architecture/data-model.md).",
    links: ["features/concept-reader", "architecture/data-model"],
    externalLinks: [],
  },
  {
    id: "features/concept-reader",
    type: "Feature",
    title: "Concept Reader",
    description: "Rendered markdown with frontmatter and backlinks.",
    tags: ["feature", "reader"],
    timestamp: "2026-06-28T00:00:00Z",
    resource: null,
    extra: {},
    body: "# What it does\n\nRenders a concept's markdown body alongside its frontmatter and its `Cited by` backlinks, so you always know what points here. Internal links resolve to other concepts and open in place; external links open in the system browser. Code blocks and tables are styled to match the surrounding theme.",
    links: ["features/graph-view"],
    externalLinks: [],
  },
  {
    id: "architecture/data-model",
    type: "Reference",
    title: "Data Model",
    description: "Bundle, Concept, and Graph shapes shared across IPC.",
    tags: ["architecture", "schema"],
    timestamp: "2026-06-28T00:00:00Z",
    resource: null,
    extra: {},
    body: "# Shapes\n\nThe Rust core parses each bundle, computes backlinks and node degree, and serializes the result as camelCase JSON across the IPC boundary. The frontend treats that payload as read-only and never mutates concepts in place. Keeping a single source of truth here means the graph, reader, and search all agree on what exists.",
    links: ["reference/glossary"],
    externalLinks: [],
  },
  {
    id: "reference/glossary",
    type: "Glossary",
    title: "Glossary",
    description: "Terms used across the bundle.",
    tags: ["reference"],
    timestamp: "2026-06-28T00:00:00Z",
    resource: "https://github.com/GoogleCloudPlatform/knowledge-catalog",
    extra: {},
    body: "# Terms\n\n- **Bundle** — a directory of OKF concept files that share an index and a changelog.\n- **Concept** — one `.md` file with YAML frontmatter and a markdown body; the atomic unit an agent reads.\n- **Backlink** — the reverse of a cross-link, listed under `Cited by` so you can navigate in both directions.\n- **Confidence** — whether a bundle is a confirmed OKF bundle or merely a candidate folder.",
    links: [],
    externalLinks: ["https://github.com/GoogleCloudPlatform/knowledge-catalog"],
  },
];

function finalize(items: RawConcept[]): Concept[] {
  const citedBy = new Map<string, string[]>();
  for (const c of items) {
    for (const t of c.links) {
      const list = citedBy.get(t) ?? [];
      list.push(c.id);
      citedBy.set(t, list);
    }
  }
  return items.map((c) => {
    const back = citedBy.get(c.id) ?? [];
    return {
      ...c,
      brokenLinks: c.brokenLinks ?? [],
      citedBy: back,
      degree: c.links.length + back.length,
    };
  });
}

/** Title-case the last path segment ("tables/orders" → "Orders"). */
function prettify(id: string): string {
  const seg = id.split("/").pop() ?? id;
  return seg.replace(/[-_]+/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

// A few typed hub-and-spoke clusters wired into the hand-written core above, so
// the dev/test graph resembles a real knowledge bundle (multiple clusters, hubs
// with fanned leaves, cross-links) rather than a five-node toy. This is what the
// Graph View's spread/level-of-detail tuning is exercised against.
function generated(): RawConcept[] {
  const clusters = [
    { hub: "tables/orders", type: "Table", leaf: "Column", n: 8, into: "architecture/data-model" },
    { hub: "metrics/revenue", type: "Metric", leaf: "Dimension", n: 7, into: "tables/orders" },
    { hub: "runbooks/on-call", type: "Runbook", leaf: "Step", n: 6, into: "features/graph-view" },
    { hub: "api/gateway", type: "API", leaf: "Endpoint", n: 7, into: "runbooks/on-call" },
  ];
  const out: RawConcept[] = [];
  for (const c of clusters) {
    for (let i = 1; i <= c.n; i++) {
      const id = `${c.hub}-${String(i).padStart(2, "0")}`;
      out.push({
        id,
        type: c.leaf,
        title: `${prettify(c.hub)} ${i}`,
        description: "",
        tags: [],
        timestamp: null,
        resource: null,
        extra: {},
        body: `# ${prettify(c.hub)} ${i}\n\nA sample ${c.leaf.toLowerCase()}.`,
        links: [c.hub],
        externalLinks: [],
      });
    }
    out.push({
      id: c.hub,
      type: c.type,
      title: prettify(c.hub),
      description: `A sample ${c.type.toLowerCase()}.`,
      tags: [c.type.toLowerCase()],
      timestamp: null,
      resource: null,
      extra: {},
      body: `# ${prettify(c.hub)}\n\nA sample ${c.type.toLowerCase()} with ${c.n} related concepts.`,
      links: [c.into],
      externalLinks: [],
    });
  }
  return out;
}

export const MOCK_BUNDLE: Bundle = {
  root: `${MOCK_FOLDER}/docs`,
  name: "OKF Viewer (sample)",
  okfVersion: "0.1",
  concepts: finalize([...raw, ...generated()]),
  indexes: [
    {
      dir: "",
      title: "OKF Viewer (sample)",
      synthesized: false,
      sections: [
        {
          heading: "Product",
          entries: [
            {
              title: "Overview",
              target: "product/overview",
              description: "What OKF Viewer is and who it's for.",
              kind: "concept",
            },
          ],
        },
        {
          heading: "Features",
          entries: [
            {
              title: "Graph View",
              target: "features/graph-view",
              description: "Force-directed graph of concepts.",
              kind: "concept",
            },
            {
              title: "Concept Reader",
              target: "features/concept-reader",
              description: "Rendered markdown with backlinks.",
              kind: "concept",
            },
          ],
        },
      ],
    },
  ],
  log: [
    { date: "2026-06-28", entries: ["**Creation**: Sample bundle for the viewer's empty-handed dev mode."] },
  ],
  issues: [],
  confidence: "confident",
};

/**
 * Companion assets (ODSF example HTML / CSS) keyed by bundle-relative path, so
 * the design-system renderer's previews resolve off-Tauri (browser + tests)
 * exactly as `read_asset` serves them in the desktop app. Populated alongside
 * the sample design-system concepts the previews reference.
 */
export const MOCK_ASSETS: Record<string, string> = {};

export const MOCK_ROOTS: BundleRoot[] = [
  {
    root: MOCK_BUNDLE.root,
    name: MOCK_BUNDLE.name,
    relPath: "docs",
    okfVersion: "0.1",
    confidence: "confident",
    conceptCount: MOCK_BUNDLE.concepts.length,
    types: [...new Set(MOCK_BUNDLE.concepts.map((c) => c.type))].sort(),
  },
];
