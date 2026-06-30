import { describe, expect, it } from "vitest";
import { graphBackbone, maxPerNodeFor, type IdxEdge } from "./backbone.ts";

/** Count connected components over `n` nodes given undirected edges. */
function components(n: number, edges: IdxEdge[]): number {
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  for (const e of edges) parent[find(e.a)] = find(e.b);
  return new Set(Array.from({ length: n }, (_, i) => find(i))).size;
}

const key = (e: IdxEdge) => `${Math.min(e.a, e.b)}|${Math.max(e.a, e.b)}`;

// A hub (0) linked one-way to two tight, mutually-linked triangles
// {1,2,3} and {4,5,6}. The full graph is one dense component; the hub's
// star edges are the "noise" a backbone should shed.
function hubAndTriangles() {
  const directed: IdxEdge[] = [];
  const mutual = (a: number, b: number) => {
    directed.push({ a, b }, { a: b, b: a });
  };
  mutual(1, 2);
  mutual(1, 3);
  mutual(2, 3);
  mutual(4, 5);
  mutual(4, 6);
  mutual(5, 6);
  for (const leaf of [1, 2, 3, 4, 5, 6]) directed.push({ a: 0, b: leaf }); // one-way hub spokes
  const tags = [[], ["a"], ["a"], ["a"], ["b"], ["b"], ["b"]];
  return { n: 7, directed, tags };
}

describe("graphBackbone", () => {
  it("draws every undirected edge when density is 'all'", () => {
    const g = hubAndTriangles();
    const all = graphBackbone({ ...g, maxPerNode: maxPerNodeFor("all") });
    // 6 intra-triangle + 6 hub spokes = 12 unique undirected edges.
    expect(all.length).toBe(12);
  });

  it("prunes the hub starburst but keeps the cluster structure", () => {
    const g = hubAndTriangles();
    const kept = graphBackbone({ ...g, maxPerNode: 2 });
    const keys = new Set(kept.map(key));

    // All six within-cluster edges survive — they are the strongest.
    for (const e of [
      { a: 1, b: 2 },
      { a: 1, b: 3 },
      { a: 2, b: 3 },
      { a: 4, b: 5 },
      { a: 4, b: 6 },
      { a: 5, b: 6 },
    ]) {
      expect(keys.has(key(e))).toBe(true);
    }

    // Most hub spokes are dropped (the clusters no longer rank them top-k);
    // only a couple remain to keep the graph connected.
    const hubSpokes = kept.filter((e) => e.a === 0 || e.b === 0);
    expect(hubSpokes.length).toBeLessThan(6);
    expect(kept.length).toBeLessThan(12);
  });

  it("never disconnects a graph the full edge set connected", () => {
    const g = hubAndTriangles();
    expect(components(g.n, graphBackbone({ ...g, maxPerNode: maxPerNodeFor("all") }))).toBe(1);
    // The spanning-forest overlay preserves that single component after pruning.
    expect(components(g.n, graphBackbone({ ...g, maxPerNode: 2 }))).toBe(1);
    expect(components(g.n, graphBackbone({ ...g, maxPerNode: maxPerNodeFor("sparse") }))).toBe(1);
  });

  it("is deterministic", () => {
    const g = hubAndTriangles();
    const a = graphBackbone({ ...g, maxPerNode: 2 }).map(key).sort();
    const b = graphBackbone({ ...g, maxPerNode: 2 }).map(key).sort();
    expect(a).toEqual(b);
  });

  it("leaves a small graph untouched (nothing to prune)", () => {
    // A single triangle: every node already has degree 2 ≤ n-1.
    const directed: IdxEdge[] = [
      { a: 0, b: 1 },
      { a: 1, b: 2 },
      { a: 2, b: 0 },
    ];
    const kept = graphBackbone({ n: 3, directed, tags: [[], [], []], maxPerNode: 2 });
    expect(kept.length).toBe(3);
  });
});
