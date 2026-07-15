// Shared hierarchy model for the space-filling visualizations (Treemap,
// Sunburst, Circle Packing). Concept ids are slash-separated paths
// ("design/color"), so the folder structure *is* the bundle's hierarchy; the
// bundle's index nodes supply human titles for the directories. All three
// views consume the same tree, so drilling into "design" means the same thing
// everywhere. See docs/features/viz-views.md.

import type { Bundle, Concept } from "@/types.ts";

export interface VizNode {
  /** Directory path for groups (""=root), concept id for leaves. Unique. */
  id: string;
  /** Display label: index title for a directory, concept title for a leaf. */
  name: string;
  /** Concept type — leaves only; drives the fill color. */
  type?: string;
  /** Size metric — leaves only (groups sum their children in the layout).
   *  Word count of the body, floored at 1 so empty stubs stay visible. */
  value?: number;
  children?: VizNode[];
}

/** Size metric for a leaf: body word count, floored so stubs stay visible. */
export function conceptWeight(c: Concept): number {
  if (!c.body) return 1;
  return Math.max(1, c.body.trim().split(/\s+/).length);
}

/**
 * Build the nested tree from a set of concepts. Intermediate directories are
 * synthesized from id path segments even when no index documents them; when
 * `bundle.indexes` has a node for a directory, its title labels the group.
 * Children are sorted groups-first, then by name, so all three layouts present
 * the same stable order.
 */
export function buildVizTree(bundle: Bundle, concepts: Concept[]): VizNode {
  const dirTitles = new Map<string, string>();
  for (const idx of bundle.indexes) {
    if (idx.dir) dirTitles.set(idx.dir, idx.title);
  }

  interface Builder {
    node: VizNode;
    children: VizNode[]; // same array as node.children, non-optional here
    dirs: Map<string, Builder>;
  }
  function makeBuilder(id: string, name: string): Builder {
    const children: VizNode[] = [];
    return { node: { id, name, children }, children, dirs: new Map() };
  }
  const root = makeBuilder("", bundle.name || "Bundle");

  for (const c of concepts) {
    const segments = c.id.split("/");
    let cur = root;
    // Walk/create the directory chain (all segments but the last).
    for (let i = 0; i < segments.length - 1; i++) {
      const dir = segments.slice(0, i + 1).join("/");
      let next = cur.dirs.get(dir);
      if (!next) {
        next = makeBuilder(
          dir,
          dirTitles.get(dir) ?? prettifySegment(segments[i]),
        );
        cur.dirs.set(dir, next);
        cur.children.push(next.node);
      }
      cur = next;
    }
    cur.children.push({
      id: c.id,
      name: c.title || segments[segments.length - 1],
      type: c.type,
      value: conceptWeight(c),
    });
  }

  sortTree(root.node);
  return root.node;
}

/** How buildVizTreeAuto grouped the bundle: by id paths (the normal case), by
 *  concept type (flat ids), or not at all (flat ids, one type). */
export type VizGrouping = "path" | "type" | "flat";

/**
 * Build the tree with a tolerant fallback for bundles whose concept ids carry
 * no path structure (no `/` in any id): group leaves by concept `type` when
 * there are at least two types, else render one flat level. Callers surface
 * the fallback as a quiet hint, never an error.
 */
export function buildVizTreeAuto(
  bundle: Bundle,
  concepts: Concept[],
): { tree: VizNode; grouping: VizGrouping } {
  if (concepts.some((c) => c.id.includes("/"))) {
    return { tree: buildVizTree(bundle, concepts), grouping: "path" };
  }
  const types = new Set(concepts.map((c) => c.type).filter(Boolean));
  if (types.size < 2) {
    return { tree: buildVizTree(bundle, concepts), grouping: "flat" };
  }
  const rootChildren: VizNode[] = [];
  const root: VizNode = {
    id: "",
    name: bundle.name || "Bundle",
    children: rootChildren,
  };
  const groups = new Map<string, VizNode[]>();
  for (const c of concepts) {
    const type = c.type || "untyped";
    // Prefix group ids so a group can never collide with a concept id.
    let g = groups.get(type);
    if (!g) {
      g = [];
      groups.set(type, g);
      rootChildren.push({
        id: `type:${type}`,
        name: prettifySegment(type),
        children: g,
      });
    }
    g.push({
      id: c.id,
      name: c.title || c.id,
      type: c.type,
      value: conceptWeight(c),
    });
  }
  sortTree(root);
  return { tree: root, grouping: "type" };
}

/** "graph-view" → "Graph view" — fallback label for an undocumented directory. */
function prettifySegment(seg: string): string {
  const words = seg.replace(/[-_]+/g, " ").trim();
  return words ? words[0].toUpperCase() + words.slice(1) : seg;
}

function sortTree(node: VizNode): void {
  if (!node.children) return;
  node.children.sort((a, b) => {
    const ag = a.children ? 0 : 1;
    const bg = b.children ? 0 : 1;
    if (ag !== bg) return ag - bg;
    return a.name.localeCompare(b.name);
  });
  for (const c of node.children) sortTree(c);
}

/** Locate a node by id (a drill-down target); null when filtered away. */
export function findVizNode(root: VizNode, id: string): VizNode | null {
  if (root.id === id) return root;
  for (const c of root.children ?? []) {
    const hit = findVizNode(c, id);
    if (hit) return hit;
  }
  return null;
}

/** Ancestor chain root→…→id for breadcrumbs; null when the id is absent. */
export function vizPath(root: VizNode, id: string): VizNode[] | null {
  if (root.id === id) return [root];
  for (const c of root.children ?? []) {
    const sub = vizPath(c, id);
    if (sub) return [root, ...sub];
  }
  return null;
}
