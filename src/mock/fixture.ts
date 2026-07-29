// A tiny in-memory OKF bundle so the UI renders (and tests run) without the
// Rust backend. Mirrors the shape the core produces; backlinks/degree derived.

import type { Bundle, BundleRoot, Concept, RecentBundle } from "@/shared/types.ts";

export const MOCK_FOLDER = "/mock/workspace";

// The v0.2 provenance families are optional here and defaulted in `finalize`,
// so a fixture entry stays about the knowledge it models. A fixture that is
// exercising trust or staleness sets them explicitly.
type RawConcept = Omit<
  Concept,
  | "citedBy"
  | "degree"
  | "brokenLinks"
  | "sources"
  | "usageWindow"
  | "generated"
  | "verified"
  | "status"
  | "staleAfter"
  | "computation"
> &
  Partial<
    Pick<
      Concept,
      | "brokenLinks"
      | "sources"
      | "usageWindow"
      | "generated"
      | "verified"
      | "status"
      | "staleAfter"
      | "computation"
    >
  >;

const raw: RawConcept[] = [
  // An OKF v0.2 Attested Computation that stores its computation in a file
  // rather than inline. Present so the browser build and the story and
  // integration suites exercise the path that used to render nothing at all:
  // promoting the contract fields out of `extra` made them invisible, and a
  // file-based computation had no route to the page.
  {
    id: "metrics/recognized-revenue",
    type: "Attested Computation",
    title: "Recognized revenue",
    description: "Revenue recognized in a fiscal year, from the sanctioned query.",
    tags: ["metric", "finance"],
    timestamp: "2026-07-02T00:00:00Z",
    resource: null,
    extra: {},
    computation: {
      runtime: "bigquery",
      parameters: [
        { name: "fiscal_year", type: "integer", required: true },
        { name: "region", type: "string", required: false },
      ],
      computation: "computations/recognized-revenue.sql",
      executor: {
        resource: "references/skills/run-on-bigquery.md",
        receipt: ["job_id", "executed_sql", "result"],
      },
      attester: { resource: "references/attesters/sql-equality.py" },
    },
    verified: [{ by: "human:sascha", at: "2026-07-02T00:00:00Z" }],
    links: [],
    externalLinks: [],
    body: [
      "# Recognized revenue",
      "",
      "Revenue recognized in a fiscal year, net of refunds and intercompany.",
      "An agent may supply `fiscal_year` and `region`. It must not write the query.",
    ].join("\n"),
  },
  {
    id: "product/overview",
    type: "Product",
    title: "Overview",
    description: "What OKF Studio is and who it's for.",
    tags: ["product", "vision"],
    timestamp: "2026-06-28T00:00:00Z",
    resource: null,
    extra: {
      stable_id: "okf-studio-product-overview",
      lifecycle: "active",
      language: "en",
      sidecars: {
        "assets/example.notebook": {
          media_type: "application/x-ipynb+json",
        },
      },
      confidence: 1,
      review_after: "2026-10-01",
      audience: ["engineering", "release partners"],
      sensitivity: "internal",
      handling_notes: "Share cited measurements only after review.",
      relationships: {
        "com.example.knowledge": {
          supports: ["features/graph-view"],
          "producer-relation": ["reference/glossary"],
        },
      },
      provenance: {
        "okf-repository": {
          title: "Google knowledge-catalog repository",
          uri: "https://github.com/GoogleCloudPlatform/knowledge-catalog",
          observed_at: "2026-07-23T00:00:00Z",
          source_digest: `sha256-${"8".repeat(64)}`,
          evidence_digest: `sha256-${"9".repeat(64)}`,
          adapter: { id: "html", version: 1 },
          discovery: "url",
          media_type: "text/html",
          locator: "Repository overview",
        },
      },
      evidence: {
        "okf-repository": {
          provenance_id: "okf-repository",
          locator: "Repository overview",
          last_checked_at: "2026-07-22T12:00:00Z",
          last_status: "available",
          last_fingerprint: `sha256-${"8".repeat(64)}`,
        },
      },
    },
    body:
      "## What it is\n\n" +
      "A local-first desktop workspace that renders [OKF](../reference/glossary.md) bundles as a [graph](/features/graph-view.md) and reader, with optional agent assistance for researching the active bundle.[^okf-repository]\n\n" +
      "> [!NOTE]\n> Studio requires no account. Opening a folder stays read-only; agent processes and network actions start only when you choose them.\n\n" +
      "## How it works\n\n" +
      "Open a folder to find every bundle inside and render each as an interactive graph alongside this reader. Connect an agent only when you want to research the active bundle with explicit context.\n\n" +
      "### Pipeline\n\n" +
      "1. Scan the folder for bundles\n2. Parse each concept and its links\n3. Render the graph and the reader\n\n" +
      "```ts\nconst bundle = await readBundle(root);\nrenderGraph(bundle);\n```\n\n" +
      "### At a glance\n\n" +
      "| Stage | Runs in |\n| --- | --- |\n| Scan | Rust core |\n| Parse | Rust core |\n| Render | Frontend |\n\n" +
      "> [!WARNING]\n> Broken cross-links are surfaced, never hidden — Studio is a tolerant consumer.\n\n" +
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
    body: "# What it does\n\nRenders a concept's markdown body alongside its frontmatter and its `Cited by` backlinks, so you always know what points here. Links show where they lead: an [in-bundle link](graph-view.md) opens in the reader, a [section link](../architecture/) opens that part of the bundle, an [external link](https://github.com/GoogleCloudPlatform/knowledge-catalog) opens in your browser, and a [broken link](does-not-exist.md) is marked unresolved. Code blocks and tables are styled to match the surrounding theme.\n\n# Math\n\nInline math like $e^{i\\pi} + 1 = 0$ sits in the prose, subscripts $x_1, x_2$ stay literal, and currency ($5 and $10) is left alone. Display math gets its own block:\n\n$$\n\\operatorname{softmax}(z)_i = \\frac{e^{z_i}}{\\sum_{j=1}^{K} e^{z_j}}\n$$\n\n# Diagrams\n\nA ```` ```mermaid ```` fence renders as a diagram, themed to match the app:\n\n```mermaid\nflowchart LR\n  Folder[Point at a folder] --> Scan[Rust core scans]\n  Scan --> Graph[Graph view]\n  Scan --> Reader[Concept reader]\n  Reader -->|links| Graph\n```\n\n# Embedded HTML\n\nRaw HTML works inline: press <kbd>Ctrl</kbd>+<kbd>K</kbd> to search, <mark>highlight</mark> a phrase, abbreviate <abbr title=\"Open Knowledge Format\">OKF</abbr>, or write x<sup>2</sup> and H<sub>2</sub>O. Unsafe markup (scripts, iframes, handlers) is stripped on render.\n\n<details>\n<summary>Collapsible sections work too</summary>\n\nAnything inside renders as normal markdown — **bold**, `code`, [links](graph-view.md).\n\n</details>\n\n# Lists, terms, notes :sparkles:\n\nTask lists track progress:\n\n- [x] parse the bundle\n- [x] render the graph\n- [ ] read everything\n\nDefinition lists explain terms:\n\nBundle\n: A directory of OKF concept files sharing an index and a changelog.\nBacklink\n: The reverse of a cross-link, listed under *Cited by*.\n\nAnd claims can carry footnotes[^spec] that link both ways.\n\n[^spec]: See the [OKF spec summary](graph-view.md) for the full rules.",
    links: ["features/graph-view"],
    externalLinks: ["https://github.com/GoogleCloudPlatform/knowledge-catalog"],
    brokenLinks: ["features/does-not-exist"],
  },
  {
    // Long enough to actually pace: the speed reader needs several substantial
    // paragraphs plus a code fence and a table to exercise both the word stream
    // and the stops. See docs/features/speed-reading.md.
    id: "features/speed-reading",
    type: "Feature",
    title: "Speed Reading",
    description: "Paces a concept word by word, with rereading kept in reach.",
    tags: ["feature", "reader", "reading"],
    timestamp: "2026-07-28T00:00:00Z",
    resource: null,
    extra: {},
    body:
      "# What it does\n\n" +
      "Speed reading paces this concept instead of leaving you to scroll it. The focus player clears the screen and shows one word at a time, holding each word's optimal recognition point at a fixed position so your eye never has to travel to find where the next word begins. That is the whole mechanical trick behind presenting text serially: ordinary reading spends a large share of its time on the small jumps between words, and a player that keeps the landing point still gives that time back.\n\n" +
      "The catch is well documented and worth stating plainly. Reading is not a one-way process. A substantial share of eye movements during normal reading go backwards, and most of those regressions exist to repair a sentence that was misparsed the first time. A player that only ever moves forward removes the repair mechanism along with the wasted travel, which is why studies of serial presentation measure a comprehension cost that grows with the rate.\n\n" +
      "# How this player answers that\n\n" +
      "The sentence you are inside stays printed beneath the word, so a word that failed to land can be recovered with a glance instead of a restart. The left and right arrows step a word at a time and the up and down arrows step a sentence at a time, both of which pause the player, because a deliberate move backwards should not be fighting a clock. Pausing and resuming rewinds a few words rather than dropping you exactly where attention lapsed.\n\n" +
      "Pace defaults to three hundred words per minute, which sits inside the band where comprehension generally holds. Past roughly five hundred the player says so rather than letting the number climb quietly.\n\n" +
      "```ts\n" +
      "const stream = buildReadingStream(concept.body, { chunk: 1 });\n" +
      "const ms = durationFor(stream.tokens[0], 300);\n" +
      "```\n\n" +
      "# What it refuses to do\n\n" +
      "One word at a time cannot show a table, a code fence, an equation, or a diagram, so the player does not pretend otherwise. It stops at each of them and renders the block as itself, and you continue when you are ready.\n\n" +
      "| Mode | Shows | Best for |\n" +
      "| --- | --- | --- |\n" +
      "| Focus | One word, centred | A first pass over prose |\n" +
      "| Guided | The page, with a marker | Dense or technical material |\n\n" +
      "Guided pacing is the second mode and the more forgiving one. The concept stays exactly where it is and a marker sweeps through the real text at the same rate, so every sentence around the current one is still on screen. Nothing here starts on its own: both modes begin with a press, and both can be paused at any moment.",
    links: ["features/concept-reader"],
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
      sources: c.sources ?? [],
      usageWindow: c.usageWindow ?? null,
      generated: c.generated ?? null,
      verified: c.verified ?? [],
      status: c.status ?? "stable",
      staleAfter: c.staleAfter ?? null,
      computation: c.computation ?? null,
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
      "# Roles\n\n" +
      "| Token | Value | Role |\n| --- | --- | --- |\n" +
      "| `fgColor-default` | `#1f2328` | Primary text. |\n" +
      "| `fgColor-accent` | `#0969da` | Links and accents. |\n" +
      "| `bgColor-success-emphasis` | `#1f883d` | The green primary button. |\n\n" +
      "# Border\n\n`borderColor-default` (#d1d9e0) hairlines · `borderColor-muted` (translucent) in-surface dividers · `borderColor-accent` (#0969da) focused edges.\n\n" +
      "# Diagram\n\n![Color model](diagram.svg)\n\nA remote reference (opened in the browser, never auto-fetched): ![Brand logo](https://example.com/logo.png)\n\n" +
      "# Usage\n\nAlways pair a foreground role with its intended background so contrast stays AA in both themes. The runnable projection lives in [`styles/tokens.css`](../styles/tokens.css).",
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
      "The primary button is **green** (`{colors.bgColor-success-emphasis}`) — every variant resolves to functional [color](color.md) tokens, so the set re-themes with no markup change. Styled by [`styles/components.css`](../styles/components.css).\n\n" +
      "# Anatomy\n\nA `<button>` with base `.btn` plus an optional variant modifier.\n\n" +
      "# Variants & States\n\n| Variant | Use |\n| --- | --- |\n| `.btn` | Default neutral action. |\n| `.btn-primary` | The one affirmative action (green). |\n| `.btn-danger` | Destructive action. |\n\n" +
      "# Examples\n\n- [button.example.html](button.example.html) — every variant, rendered live.",
    links: ["design/color"],
    externalLinks: [],
  },
];

export const MOCK_BUNDLE: Bundle = {
  root: `${MOCK_FOLDER}/docs`,
  name: "OKF Studio (sample)",
  okfVersion: "0.1",
  odsfVersion: "0.1",
  extra: {
    profiles: {
      "com.example.knowledge": {
        version: "1.2.0",
        descriptor: "profiles/com.example.knowledge.json",
        mode: "advisory",
      },
    },
    producer: { name: "OKF Studio fixture", channel: "development" },
  },
  concepts: finalize([...raw, ...designSystem, ...generated()]),
  indexes: [
    {
      dir: "",
      title: "OKF Studio (sample)",
      intro:
        "This is the built-in **sample bundle** — Studio dogfooding itself. " +
        "It renders the [OKF](reference/glossary.md) concepts in this folder as a graph you can browse, " +
        "search, and read. Start anywhere: the sidebar mirrors this index, and every folder is a door.",
      synthesized: false,
      sections: [
        {
          heading: "Product",
          entries: [
            {
              title: "Overview",
              target: "product/overview",
              description: "What OKF Studio is and who it's for.",
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
            {
              title: "Speed Reading",
              target: "features/speed-reading",
              description: "Paces a concept word by word.",
              kind: "concept",
            },
          ],
        },
        {
          heading: "Design system",
          entries: [
            {
              title: "design/",
              target: "design",
              description: "The ODSF sample: tokens, components, guidelines.",
              kind: "directory",
            },
            {
              title: "styles/",
              target: "styles",
              description: "Companion stylesheets (assets, not concepts).",
              kind: "directory",
            },
          ],
        },
        {
          // A hand-written "Subdirectories" listing whose only entry (product/)
          // is already a clickable section heading — the renderer drops this whole
          // section as redundant, without touching the source bundle.
          heading: "Subdirectories",
          entries: [
            {
              title: "product/",
              target: "product",
              description: "Vision, audience, principles, and scope.",
              kind: "directory",
            },
          ],
        },
      ],
    },
    {
      // A real subfolder index (docs/product/index.md) with its own prose, so
      // the root "Product" section heading becomes a door to this folder home.
      dir: "product",
      title: "Product",
      intro: "Vision, audience, principles, and scope for OKF Studio.",
      synthesized: false,
      sections: [
        {
          heading: "",
          entries: [
            {
              title: "Overview",
              target: "product/overview",
              description: "What OKF Studio is and who it's for.",
              kind: "concept",
            },
          ],
        },
      ],
    },
    {
      dir: "features",
      title: "Features",
      intro: "Capabilities for exploring and improving connected knowledge.",
      synthesized: false,
      sections: [
        {
          heading: "Open and explore",
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
            {
              title: "Speed Reading",
              target: "features/speed-reading",
              description: "Paces a concept word by word.",
              kind: "concept",
            },
          ],
        },
      ],
    },
    {
      // An asset-only directory (the Primer bundle's styles/ case): the core
      // synthesizes an index for it, but it holds no concepts — the tree must
      // explain the empty expansion instead of silently adding zero rows.
      dir: "styles",
      title: "Styles",
      intro: "",
      synthesized: true,
      sections: [],
    },
    {
      // A synthesized per-directory index (no index.md in design/), so the
      // tree's expandable directory rows, concept counts, and the synthesized
      // marker all render off-Tauri.
      dir: "design",
      title: "Design",
      intro: "",
      synthesized: true,
      sections: [
        {
          heading: "",
          entries: [
            {
              title: "Button",
              target: "design/button",
              description: "Default, primary, and danger variants.",
              kind: "concept",
            },
            {
              title: "Color",
              target: "design/color",
              description: "Functional color roles.",
              kind: "concept",
            },
            {
              title: "Typography",
              target: "design/typography",
              description: "Type scale and faces.",
              kind: "concept",
            },
          ],
        },
        {
          // The "Weiter" / "See also" tail every hand-written folder index
          // grows: a link back up to the parent's index.md, which the core
          // reads as a directory entry. Parent and child then point at each
          // other, so the tree has a cycle to survive.
          heading: "More",
          entries: [
            {
              title: "OKF Studio (sample)",
              target: "",
              description: "Back to the bundle root.",
              kind: "directory",
            },
          ],
        },
      ],
    },
  ],
  log: [
    {
      date: "2026-06-28",
      entries: [
        "**Update**: Expanded the sample to 45 concepts across 20 types — foundations, components, and guidelines with live examples and design tokens.",
        "**Fix**: The [Graph View](features/graph-view.md) sample now carries orphan and broken-link states, so defect surfacing renders off-Tauri.",
      ],
    },
    {
      date: "2026-06-27",
      entries: [
        "**Creation**: Sample bundle for Studio's empty-handed dev mode. Starts with the [Concept Reader](features/concept-reader.md) and the [OKF spec](https://github.com/GoogleCloudPlatform/knowledge-catalog).",
      ],
    },
  ],
  issues: [
    // Mirrors what the core's validate() reports for this fixture's broken
    // cross-link (see crates/okf-core/src/validate.rs), so the status bar's
    // amber state and the validation panel render off-Tauri too.
    {
      conceptId: "features/concept-reader",
      level: "warning",
      message:
        "features/concept-reader.md: link target not found -> features/does-not-exist",
    },
  ],
  confidence: "confident",
};

/**
 * Companion assets (ODSF example HTML / CSS) keyed by bundle-relative path, so
 * the design-system renderer's previews resolve off-Tauri (browser + tests)
 * exactly as `read_asset` serves them in the desktop app. The button example
 * links its stylesheets relatively (`../styles/...`), which the preview inlines.
 */
export const MOCK_ASSETS: Record<string, string> = {
  // The sanctioned computation for `metrics/recognized-revenue`. Served through
  // the declaration-scoped door, not the extension allowlist — `.sql` is
  // deliberately not a permitted text asset, and that is the point: a
  // computation is whatever its runtime takes.
  "computations/recognized-revenue.sql": [
    "-- Recognized revenue for one fiscal year.",
    "SELECT",
    "  SUM(o.amount_usd) AS recognized_revenue",
    "FROM `finance.orders` AS o",
    "WHERE o.fiscal_year = @fiscal_year",
    "  AND (@region IS NULL OR o.region = @region)",
    "  AND o.status = 'recognized'",
  ].join("\n"),
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
  "design/diagram.svg":
    '<svg xmlns="http://www.w3.org/2000/svg" width="280" height="120">' +
    '<rect width="280" height="120" rx="8" fill="#0969da"/>' +
    '<text x="24" y="70" fill="#ffffff" font-family="sans-serif" font-size="26" font-weight="600">Color model</text>' +
    "</svg>",
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

/**
 * Seed recents from *other* folders so the Bundle Switcher's recent rows —
 * pins, hover actions, the Pinned group — render off-Tauri (browser + tests).
 * One pinned and one plain entry; fixed timestamps keep runs deterministic.
 */
export const MOCK_RECENTS: RecentBundle[] = [
  {
    root: "/mock/primer/design-system",
    folder: "/mock/primer",
    name: "Primer design system",
    conceptCount: 60,
    types: ["Color", "Component", "Elevation", "Guideline", "Motion", "Pattern", "Shape", "Typography"],
    ts: 1750000000000,
    pinned: true,
  },
  {
    root: "/mock/handbook",
    folder: "/mock/handbook",
    name: "Team Handbook",
    conceptCount: 202,
    types: ["Guide", "Policy", "Runbook", "Template"],
    ts: 1749000000000,
  },
];
