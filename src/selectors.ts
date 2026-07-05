// Pure derivations over the parsed data model. With the React Compiler enabled,
// components call these in render and the results are auto-memoized.

import type { Bundle, Concept, GraphEdge } from "./types.ts";
import { parseQuery, matchesCompiled, type CompiledQuery } from "./query.ts";

/** Distinct concept types present in a bundle, sorted. */
export function distinctTypes(bundle: Bundle | null): string[] {
  if (!bundle) return [];
  return [...new Set(bundle.concepts.map((c) => c.type).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b),
  );
}

/** Flatten concept links into directed {source, target} edges. */
export function buildEdges(concepts: Concept[]): GraphEdge[] {
  const edges: GraphEdge[] = [];
  for (const c of concepts) {
    for (const target of c.links) edges.push({ source: c.id, target });
  }
  return edges;
}

/** Synthesize a tag → concept-ids index by scanning frontmatter. */
export function buildTagIndex(concepts: Concept[]): Map<string, string[]> {
  const index = new Map<string, string[]>();
  for (const c of concepts) {
    for (const tag of c.tags) {
      const list = index.get(tag) ?? [];
      list.push(c.id);
      index.set(tag, list);
    }
  }
  return index;
}

export interface Filter {
  query: string;
  hiddenTypes: string[];
  activeTag: string | null;
}

// One-entry compile cache: a query string is parsed once, then tested against
// every concept in the render. The same string flows to all consumers in a
// frame, so a single slot hits ~100%.
let queryCache: { q: string; compiled: CompiledQuery } | null = null;
function compile(q: string): CompiledQuery {
  if (queryCache?.q !== q) queryCache = { q, compiled: parseQuery(q) };
  return queryCache.compiled;
}

/**
 * Does a concept match the query? The query is the [faceted grammar](./query.ts)
 * — `type:`, `tag:`, `degree>N`, `is:orphan`, `has:broken`, and full-text —
 * falling back to plain substring for bare words.
 */
export function matchesQuery(c: Concept, q: string): boolean {
  if (!q) return true;
  return matchesCompiled(c, compile(q));
}

/** Is a concept visible under the current type filter and tag selection? */
export function isVisible(c: Concept, f: Filter): boolean {
  if (f.hiddenTypes.includes(c.type)) return false;
  if (f.activeTag && !c.tags.includes(f.activeTag)) return false;
  return true;
}

/** Concept ids that pass both the filter and the text query. */
export function filteredConceptIds(bundle: Bundle | null, f: Filter): Set<string> {
  const ids = new Set<string>();
  if (!bundle) return ids;
  for (const c of bundle.concepts) {
    if (isVisible(c, f) && matchesQuery(c, f.query)) ids.add(c.id);
  }
  return ids;
}

/**
 * The ego neighborhood of `rootId`: the root plus every concept reachable in at
 * most `depth` hops over the *undirected* adjacency (links ∪ citedBy). Returns
 * an empty set if the root is missing. Tolerant of dangling ids — an id that
 * appears in `links`/`citedBy` but has no concept of its own is still walked
 * (it just contributes no further neighbors).
 */
export function egoIds(bundle: Bundle | null, rootId: string | null, depth: number): Set<string> {
  const result = new Set<string>();
  if (!bundle || !rootId) return result;
  const byId = new Map(bundle.concepts.map((c) => [c.id, c] as const));
  if (!byId.has(rootId)) return result;

  result.add(rootId);
  let frontier: string[] = [rootId];
  const hops = Math.max(0, Math.floor(depth));
  for (let d = 0; d < hops; d++) {
    const next: string[] = [];
    for (const id of frontier) {
      const c = byId.get(id);
      if (!c) continue;
      for (const nb of c.links) {
        if (!result.has(nb)) {
          result.add(nb);
          next.push(nb);
        }
      }
      for (const nb of c.citedBy) {
        if (!result.has(nb)) {
          result.add(nb);
          next.push(nb);
        }
      }
    }
    if (next.length === 0) break;
    frontier = next;
  }
  return result;
}

/** Ids of concepts with no relations at all (degree 0: no links and no citedBy). */
export function orphanIds(bundle: Bundle | null): string[] {
  if (!bundle) return [];
  return bundle.concepts
    .filter((c) => c.degree === 0 && c.links.length === 0 && c.citedBy.length === 0)
    .map((c) => c.id);
}

/** Look up a concept by id. */
export function conceptById(bundle: Bundle | null, id: string | null): Concept | null {
  if (!bundle || !id) return null;
  return bundle.concepts.find((c) => c.id === id) ?? null;
}

/** Derive a display title for a concept id (its title, else the id). */
export function titleOf(bundle: Bundle | null, id: string): string {
  return conceptById(bundle, id)?.title ?? id;
}
