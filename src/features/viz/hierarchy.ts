// Shared hierarchy model for the space-filling visualizations (Treemap,
// Sunburst, Circle Packing). Concept ids provide the directory tree; authored
// index sections can add presentation groups inside a directory without
// changing concept identity. All three views consume the same tree, so
// drilling into "design" means the same thing everywhere. See
// docs/features/viz-views.md.

import type { Bundle, Concept } from "@/shared/types.ts";

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
  /** Authored order within an index section. Unauthored nodes sort after it. */
  order?: number;
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

  addIndexSectionGroups(root.node, bundle);
  sortTree(root.node);
  return root.node;
}

/**
 * Add semantic groups from authored index headings without changing paths.
 * Only direct concept children of that index directory are eligible. Nested
 * concepts stay inside their physical subdirectory, cross-directory entries
 * remain references, and a one-item heading does not add a redundant ring.
 * The first heading commonly repeats the index title; it describes the
 * directory itself and must not become a same-name child generation.
 */
function addIndexSectionGroups(root: VizNode, bundle: Bundle): void {
  const usedIds = new Set(bundle.concepts.map((concept) => concept.id));

  for (const index of bundle.indexes) {
    const dir = index.dir === "." ? "" : index.dir;
    const parent = findVizNode(root, dir);
    if (!parent?.children) continue;

    const directLeaves = new Map(
      parent.children
        .filter((child) => !child.children && parentDir(child.id) === dir)
        .map((child) => [child.id, child]),
    );
    const claimed = new Set<string>();
    const groups: VizNode[] = [];

    for (const [sectionIndex, section] of index.sections.entries()) {
      const heading = section.heading.trim();
      if (!heading || sameLabel(heading, index.title)) continue;

      const entries = section.entries.flatMap((entry, entryIndex) => {
        if (
          entry.kind !== "concept" ||
          claimed.has(entry.target) ||
          parentDir(entry.target) !== dir
        ) {
          return [];
        }
        const leaf = directLeaves.get(entry.target);
        return leaf ? [{ leaf, entryIndex }] : [];
      });
      if (entries.length < 2) continue;

      const sectionId = uniqueSectionId(dir, sectionIndex, usedIds);
      const children = entries.map(({ leaf, entryIndex }) => {
        claimed.add(leaf.id);
        return { ...leaf, order: entryIndex };
      });
      groups.push({
        id: sectionId,
        name: heading,
        order: sectionIndex,
        children,
      });
    }

    if (groups.length > 0) {
      parent.children = [
        ...groups,
        ...parent.children.filter((child) => !claimed.has(child.id)),
      ];
    }
  }
}

function sameLabel(a: string, b: string): boolean {
  const normalize = (value: string) =>
    value.trim().replace(/\s+/g, " ").toLowerCase();
  return normalize(a) === normalize(b);
}

function parentDir(id: string): string {
  const slash = id.lastIndexOf("/");
  return slash < 0 ? "" : id.slice(0, slash);
}

function uniqueSectionId(
  dir: string,
  sectionIndex: number,
  usedIds: Set<string>,
): string {
  const base = `@index-section/${dir || "root"}/${sectionIndex}`;
  let id = base;
  let suffix = 2;
  while (usedIds.has(id)) {
    id = `${base}/${suffix}`;
    suffix += 1;
  }
  usedIds.add(id);
  return id;
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
    const ao = a.order ?? Number.MAX_SAFE_INTEGER;
    const bo = b.order ?? Number.MAX_SAFE_INTEGER;
    if (ao !== bo) return ao - bo;
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
