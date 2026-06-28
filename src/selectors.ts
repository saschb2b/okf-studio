// Pure derivations over the parsed data model. With the React Compiler enabled,
// components call these in render and the results are auto-memoized.

import type { Bundle, Concept, GraphEdge } from "./types.ts";

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

/** Does a concept match the current text query (title, description, type, tags, body)? */
export function matchesQuery(c: Concept, q: string): boolean {
  if (!q) return true;
  const needle = q.toLowerCase();
  return (
    c.title.toLowerCase().includes(needle) ||
    c.description.toLowerCase().includes(needle) ||
    c.type.toLowerCase().includes(needle) ||
    c.id.toLowerCase().includes(needle) ||
    c.tags.some((t) => t.toLowerCase().includes(needle)) ||
    c.body.toLowerCase().includes(needle)
  );
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

/** Look up a concept by id. */
export function conceptById(bundle: Bundle | null, id: string | null): Concept | null {
  if (!bundle || !id) return null;
  return bundle.concepts.find((c) => c.id === id) ?? null;
}

/** Derive a display title for a concept id (its title, else the id). */
export function titleOf(bundle: Bundle | null, id: string): string {
  return conceptById(bundle, id)?.title ?? id;
}
