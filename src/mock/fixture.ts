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
    body: "# What it is\n\nA desktop app that renders [OKF](../reference/glossary.md) bundles as a [graph](../features/graph-view.md).",
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
    body: "# What it does\n\nRenders the bundle as a graph. Opens a node in the [reader](concept-reader.md). Shapes derive from the [data model](../architecture/data-model.md).",
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
    body: "# What it does\n\nRenders a concept's markdown and its `Cited by` backlinks.",
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
    body: "# Shapes\n\nThe core computes these and the frontend renders them.",
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
    body: "# Terms\n\n- **Bundle** — a directory of OKF concept files.\n- **Concept** — one `.md` file with frontmatter.",
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

export const MOCK_BUNDLE: Bundle = {
  root: `${MOCK_FOLDER}/docs`,
  name: "OKF Viewer (sample)",
  okfVersion: "0.1",
  concepts: finalize(raw),
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
