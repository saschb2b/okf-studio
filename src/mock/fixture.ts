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

// A small ODSF (design-system) cluster so the rich-artifact rendering — token
// swatches, type specimens, spacing scales, the component token table, and the
// live example preview — has data to render off-Tauri (browser + tests). These
// are conformant OKF concepts that additionally carry ODSF `tokens`/`examples`
// in `extra`, exactly as the indentation-aware core parser produces them.
const designSystem: RawConcept[] = [
  {
    id: "design/color",
    type: "Color",
    title: "Color",
    description: "Functional foreground, background, and border roles.",
    tags: ["foundations", "color", "tokens"],
    timestamp: "2026-06-30T00:00:00Z",
    resource: null,
    extra: {
      status: "stable",
      tokens: {
        colors: {
          "fgColor-default": "#1f2328",
          "fgColor-muted": "#59636e",
          "fgColor-accent": "#0969da",
          "fgColor-success": "#1a7f37",
          "fgColor-danger": "#d1242f",
          "bgColor-default": "#ffffff",
          "bgColor-muted": "#f6f8fa",
          "bgColor-emphasis": "#25292e",
          "bgColor-success-emphasis": "#1f883d",
          "bgColor-danger-emphasis": "#cf222e",
          "borderColor-default": "#d1d9e0",
        },
      },
    },
    body:
      "Color is **functional**, not literal: a component references a role (`fgColor-accent` for a link), never a hex, so the whole UI re-themes by swapping the value behind each role.\n\n" +
      "# Roles\n\nForeground roles carry text and icons; background roles fill surfaces; border roles draw hairlines.\n\n" +
      "# Usage\n\nAlways pair a foreground role with its intended background so contrast stays AA in both themes.",
    links: [],
    externalLinks: [],
  },
  {
    id: "design/typography",
    type: "Typography",
    title: "Typography",
    description: "A compact type scale over a system font stack.",
    tags: ["foundations", "typography", "tokens"],
    timestamp: "2026-06-30T00:00:00Z",
    resource: null,
    extra: {
      status: "stable",
      tokens: {
        typography: {
          display: { fontSize: "40px", fontWeight: "400", lineHeight: "1.4" },
          "title-large": { fontSize: "32px", fontWeight: "600", lineHeight: "1.25" },
          "title-medium": { fontSize: "20px", fontWeight: "600", lineHeight: "1.3" },
          "body-medium": { fontSize: "14px", fontWeight: "400", lineHeight: "1.5" },
          "body-small": { fontSize: "12px", fontWeight: "400", lineHeight: "1.4" },
        },
      },
    },
    body:
      "A small set of text roles on a 14px product base.\n\n" +
      "# Usage\n\nReach for `body-medium` for UI text and the `title-*` roles for headings; `display` is for hero moments only.",
    links: [],
    externalLinks: [],
  },
  {
    id: "design/spacing",
    type: "Spacing",
    title: "Spacing",
    description: "The 4px-based spacing scale.",
    tags: ["foundations", "spacing", "tokens"],
    timestamp: "2026-06-30T00:00:00Z",
    resource: null,
    extra: {
      status: "stable",
      tokens: {
        spacing: {
          "1": "4px",
          "2": "8px",
          "3": "16px",
          "4": "24px",
          "5": "32px",
          "6": "48px",
          "7": "64px",
        },
      },
    },
    body:
      "Every gap, pad, and margin snaps to this scale so rhythm stays consistent.\n\n" +
      "# Usage\n\nPrefer a single `gap` on a container over per-child margins.",
    links: [],
    externalLinks: [],
  },
  {
    id: "design/shape",
    type: "Shape",
    title: "Shape",
    description: "A restrained corner-radius scale.",
    tags: ["foundations", "shape", "tokens"],
    timestamp: "2026-06-30T00:00:00Z",
    resource: null,
    extra: {
      status: "stable",
      tokens: {
        radius: { small: "3px", medium: "6px", large: "12px", full: "999px" },
      },
    },
    body: "Corners are gentle, never novelty-round.\n\n# Usage\n\n`full` is for pills and avatars only.",
    links: [],
    externalLinks: [],
  },
  {
    id: "design/elevation",
    type: "Elevation",
    title: "Elevation",
    description: "Layered, low-alpha shadows.",
    tags: ["foundations", "elevation", "tokens"],
    timestamp: "2026-06-30T00:00:00Z",
    resource: null,
    extra: {
      status: "experimental",
      tokens: {
        elevation: {
          low: "0 1px 3px rgba(31,35,40,0.12)",
          medium: "0 4px 12px rgba(31,35,40,0.15)",
          high: "0 12px 28px rgba(31,35,40,0.2)",
        },
      },
    },
    body: "Shadow signals layering, not decoration; deeper means closer to the user.",
    links: [],
    externalLinks: [],
  },
  {
    id: "design/motion",
    type: "Motion",
    title: "Motion",
    description: "Quick transitions; reduced-motion first.",
    tags: ["foundations", "motion", "tokens"],
    timestamp: "2026-06-30T00:00:00Z",
    resource: null,
    extra: {
      status: "stable",
      tokens: {
        motion: {
          fast: "120ms",
          base: "200ms",
          "easing-standard": "cubic-bezier(0.2, 0, 0, 1)",
        },
      },
    },
    body: "Transitions are short and purposeful, and always yield to a reduced-motion preference.",
    links: [],
    externalLinks: [],
  },
  {
    id: "design/color-not-alone",
    type: "Guideline",
    title: "Color is not the only signal",
    description: "Pair status color with an icon or text.",
    tags: ["guidelines", "accessibility"],
    timestamp: "2026-06-30T00:00:00Z",
    resource: null,
    extra: {
      status: "stable",
      examples: ["color-not-alone.do.html", "color-not-alone.dont.html"],
    },
    body:
      "# Rule\n\nNever rely on color alone to carry meaning.\n\n" +
      "# Why\n\nColor-blind users and grayscale contexts lose a color-only signal.\n\n" +
      "# Do\n\n- [color-not-alone.do.html](color-not-alone.do.html) — status with an icon and a word.\n\n" +
      "# Don't\n\n- [color-not-alone.dont.html](color-not-alone.dont.html) — a bare colored dot, no label.",
    links: ["design/color"],
    externalLinks: [],
  },
  {
    id: "design/button",
    type: "Component",
    title: "Button",
    description: "Default, the green primary, and danger variants.",
    tags: ["components", "button", "action"],
    timestamp: "2026-06-30T00:00:00Z",
    resource: null,
    extra: {
      status: "stable",
      applies_to: ["web"],
      examples: ["button.example.html"],
      tokens: {
        "button-default": {
          background: "{colors.bgColor-muted}",
          color: "{colors.fgColor-default}",
          border: "{colors.borderColor-default}",
        },
        "button-primary": {
          background: "{colors.bgColor-success-emphasis}",
          color: "#ffffff",
        },
        "button-danger": {
          color: "{colors.fgColor-danger}",
        },
      },
    },
    body:
      "The primary button is **green** — every variant resolves to functional [color](color.md) tokens, so the set re-themes with no markup change.\n\n" +
      "# Anatomy\n\nA `<button>` with base `.btn` plus an optional variant modifier.\n\n" +
      "# Variants & States\n\n| Variant | Use |\n| --- | --- |\n| `.btn` | Default neutral action. |\n| `.btn-primary` | The one affirmative action (green). |\n| `.btn-danger` | Destructive action. |\n\n" +
      "# Examples\n\n- [button.example.html](button.example.html) — every variant, rendered live.",
    links: ["design/color"],
    externalLinks: [],
  },
];

export const MOCK_BUNDLE: Bundle = {
  root: `${MOCK_FOLDER}/docs`,
  name: "OKF Viewer (sample)",
  okfVersion: "0.1",
  concepts: finalize([...raw, ...designSystem, ...generated()]),
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
 * exactly as `read_asset` serves them in the desktop app. The button example
 * links its stylesheets relatively (`../styles/...`), which the preview inlines.
 */
export const MOCK_ASSETS: Record<string, string> = {
  "styles/tokens.css": [
    ":root {",
    "  --bgColor-default: #ffffff;",
    "  --bgColor-muted: #f6f8fa;",
    "  --bgColor-success-emphasis: #1f883d;",
    "  --fgColor-default: #1f2328;",
    "  --fgColor-onEmphasis: #ffffff;",
    "  --fgColor-danger: #d1242f;",
    "  --borderColor-default: #d1d9e0;",
    "  --radius-medium: 6px;",
    "}",
  ].join("\n"),
  "styles/components.css": [
    "body { margin: 0; padding: 16px; background: var(--bgColor-default);",
    "  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;",
    "  display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }",
    ".btn { font: inherit; font-size: 14px; font-weight: 500; padding: 5px 16px;",
    "  border-radius: var(--radius-medium); border: 1px solid var(--borderColor-default);",
    "  background: var(--bgColor-muted); color: var(--fgColor-default); cursor: pointer; }",
    ".btn-primary { background: var(--bgColor-success-emphasis);",
    "  border-color: var(--bgColor-success-emphasis); color: var(--fgColor-onEmphasis); }",
    ".btn-danger { color: var(--fgColor-danger); }",
  ].join("\n"),
  "design/button.example.html": [
    "<!doctype html>",
    '<html lang="en">',
    '<head><meta charset="utf-8">',
    '<link rel="stylesheet" href="../styles/tokens.css">',
    '<link rel="stylesheet" href="../styles/components.css">',
    "</head>",
    "<body>",
    '  <button class="btn">Default</button>',
    '  <button class="btn btn-primary">Save changes</button>',
    '  <button class="btn btn-danger">Delete</button>',
    "</body>",
    "</html>",
  ].join("\n"),
  "design/color-not-alone.do.html": [
    "<!doctype html>",
    '<html lang="en"><head><meta charset="utf-8"><style>',
    "  body { margin: 0; padding: 16px; font-family: system-ui, sans-serif; }",
    "  .status { display: inline-flex; align-items: center; gap: 6px; color: #1a7f37; font-weight: 600; }",
    "</style></head><body>",
    '  <span class="status">✓ Merged</span>',
    "</body></html>",
  ].join("\n"),
  "design/color-not-alone.dont.html": [
    "<!doctype html>",
    '<html lang="en"><head><meta charset="utf-8"><style>',
    "  body { margin: 0; padding: 16px; font-family: system-ui, sans-serif; }",
    "  .dot { display: inline-block; width: 14px; height: 14px; border-radius: 999px; background: #1a7f37; }",
    "</style></head><body>",
    '  <span class="dot"></span>',
    "</body></html>",
  ].join("\n"),
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
