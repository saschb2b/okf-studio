// Traversal derivations for the Lineage panel — pure functions over the parsed
// data model, bounded and cycle-safe so a dense bundle stays fast. See
// docs/proposals/lineage-and-traversal.md.

import type { Bundle, Concept } from "@/shared/types.ts";

/** How deep a lineage tree descends before it stops (a hop cap). */
export const MAX_LINEAGE_DEPTH = 6;

/** "up" follows a concept's links (its dependencies); "down" follows citedBy
 *  (its dependents). */
export type LineageDir = "up" | "down";

export interface LineageNode {
  id: string;
  /** The concept's title, or the id itself when the link is dangling. */
  title: string;
  /** The concept's type, or "" when dangling (no concept for this id). */
  type: string;
  children: LineageNode[];
  /** True when this node has further neighbors not shown (depth cap hit). */
  truncated?: boolean;
}

/**
 * A spanning tree of transitive relatives of `rootId` in one direction. Each
 * concept appears once (first reached wins), so cycles and diamonds can't
 * explode it; `maxDepth` bounds the descent. Returns null if the root is absent.
 */
export function lineageTree(
  bundle: Bundle | null,
  rootId: string | null,
  dir: LineageDir,
  maxDepth = MAX_LINEAGE_DEPTH,
): LineageNode | null {
  if (!bundle || !rootId) return null;
  const byId = new Map(bundle.concepts.map((c) => [c.id, c] as const));
  if (!byId.has(rootId)) return null;

  const visited = new Set<string>([rootId]);
  const build = (id: string, depth: number): LineageNode => {
    const c = byId.get(id);
    const node: LineageNode = {
      id,
      title: c?.title ?? id,
      type: c?.type ?? "",
      children: [],
    };
    if (!c) return node;
    const neighbors = dir === "up" ? c.links : c.citedBy;
    const fresh = neighbors.filter((n) => !visited.has(n));
    if (fresh.length === 0) return node;
    if (depth >= maxDepth) {
      node.truncated = true;
      return node;
    }
    for (const n of fresh) {
      visited.add(n);
      node.children.push(build(n, depth + 1));
    }
    return node;
  };
  return build(rootId, 0);
}

/** Flattened count of nodes under (and including) a lineage node. */
export function lineageSize(node: LineageNode | null): number {
  if (!node) return 0;
  return 1 + node.children.reduce((n, ch) => n + lineageSize(ch), 0);
}

/**
 * Shortest path between two concepts over the *undirected* link set
 * (links ∪ citedBy), as an inclusive list of ids, or null if unconnected or
 * either endpoint is missing. BFS, so the first path found is shortest.
 */
export function pathBetween(
  bundle: Bundle | null,
  aId: string,
  bId: string,
): string[] | null {
  if (!bundle) return null;
  const byId = new Map(bundle.concepts.map((c) => [c.id, c] as const));
  if (!byId.has(aId) || !byId.has(bId)) return null;
  if (aId === bId) return [aId];

  const prev = new Map<string, string | null>([[aId, null]]);
  const queue: string[] = [aId];
  while (queue.length) {
    const cur = queue.shift();
    if (cur === undefined) break;
    if (cur === bId) break;
    const c = byId.get(cur);
    if (!c) continue;
    for (const nb of [...c.links, ...c.citedBy]) {
      if (!prev.has(nb)) {
        prev.set(nb, cur);
        queue.push(nb);
      }
    }
  }
  if (!prev.has(bId)) return null;

  const path: string[] = [];
  let cur: string | null = bId;
  while (cur !== null) {
    path.unshift(cur);
    cur = prev.get(cur) ?? null;
  }
  return path;
}

/** Minimum title length considered for an unlinked mention (avoids short-word noise). */
const MIN_MENTION_LEN = 4;

/** Escape a string for use as a literal inside a RegExp. */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Concept ids whose title appears in `concept`'s description/body text but which
 * it does not link — the "unlinked mentions" discovery signal. Whole-word,
 * case-insensitive; excludes the concept itself and anything it already links.
 */
export function unlinkedMentions(bundle: Bundle | null, concept: Concept | null): string[] {
  if (!bundle || !concept) return [];
  const text = `${concept.description} ${concept.body}`.toLowerCase();
  if (!text.trim()) return [];
  const linked = new Set(concept.links);
  const out: string[] = [];
  for (const c of bundle.concepts) {
    if (c.id === concept.id || linked.has(c.id)) continue;
    const title = c.title.trim().toLowerCase();
    if (title.length < MIN_MENTION_LEN) continue;
    // Whole-word match: the title not flanked by alphanumerics (so "Order"
    // doesn't match "Orders").
    const re = new RegExp(`(?<![a-z0-9])${escapeRegExp(title)}(?![a-z0-9])`);
    if (re.test(text)) out.push(c.id);
  }
  return out;
}
