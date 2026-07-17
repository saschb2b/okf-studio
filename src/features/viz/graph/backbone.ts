// Graph backbone extraction — turns a dense cross-link graph into a readable
// one by drawing only the structurally significant edges, instead of every link.
//
// Why: a knowledge bundle is richly cross-linked (good for navigation), so its
// raw graph is near-complete — our docs bundle averages ~14 edges/node at ~39%
// density. No force layout can untangle that; it reads as a hairball. The
// decades-old data-viz answer for dense networks is *edge filtering / backbone
// extraction*: keep the edges that reveal structure, drop the rest.
//
// Method: weight each undirected edge by how much it reveals relationship
// structure, then keep, per node, only its strongest few edges (a weighted
// k-nearest-neighbour graph), and overlay a maximum spanning forest so the
// graph never shatters into disconnected islands. We use weighted top-k rather
// than the better-known disparity filter (Serrano et al., PNAS 2009) because
// our near-binary edge weights make the disparity filter degenerate — it keeps
// either nothing or almost everything — whereas top-k is predictable and tunable.
//
// Edge weight = 1 (the link exists)
//             + 1 if reciprocal (A→B and B→A — a mutual relationship)
//             + 2 · Jaccard(neighbours(A), neighbours(B))  // shared structure → same cluster
//             + 1 · Jaccard(tags(A), tags(B))              // shared topic
// This rewards mutual links and within-cluster ties, and demotes the
// hub-to-leaf "starburst" edges that make the hairball.

/** An undirected edge as a pair of node indices, a ≤ b. */
export interface IdxEdge {
  a: number;
  b: number;
}

export interface BackboneInput {
  /** Node count. Nodes are referred to by index 0..n-1. */
  n: number;
  /** Directed cross-links as index pairs (source → target). */
  directed: IdxEdge[];
  /** Tags per node, by index. */
  tags: string[][];
  /**
   * Max strongest edges to keep per node (the k in k-NN). `Infinity` keeps
   * every edge (the raw, dense graph). The union is symmetric, so a node may
   * end up with more than `maxPerNode` edges if it is in others' top-k, and the
   * spanning-forest overlay can add a few more to preserve connectivity.
   */
  maxPerNode: number;
}

function jaccard(a: Set<number> | Set<string>, b: Set<number> | Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const x of a as Set<unknown>) if ((b as Set<unknown>).has(x)) inter++;
  const uni = a.size + b.size - inter;
  return uni ? inter / uni : 0;
}

interface WEdge extends IdxEdge {
  w: number;
}

/**
 * Returns the kept undirected edges (a ≤ b). With `maxPerNode === Infinity`
 * this is every undirected edge; otherwise it is the weighted top-k backbone
 * unioned with a maximum spanning forest.
 */
export function graphBackbone(input: BackboneInput): IdxEdge[] {
  const { n, directed, tags, maxPerNode } = input;

  // Build the directed lookup, undirected adjacency, and the deduped undirected
  // edge list in one pass.
  const dirKey = (a: number, b: number) => a * n + b;
  const dir = new Set<number>();
  for (const e of directed) dir.add(dirKey(e.a, e.b));

  const adj: Set<number>[] = Array.from({ length: n }, () => new Set<number>());
  const undKeys = new Set<number>();
  const und: IdxEdge[] = [];
  for (const e of directed) {
    if (e.a === e.b) continue;
    adj[e.a].add(e.b);
    adj[e.b].add(e.a);
    const lo = Math.min(e.a, e.b);
    const hi = Math.max(e.a, e.b);
    const k = lo * n + hi;
    if (!undKeys.has(k)) {
      undKeys.add(k);
      und.push({ a: lo, b: hi });
    }
  }

  // Everything (or a graph too small to prune) → draw all edges.
  if (!Number.isFinite(maxPerNode) || maxPerNode >= n - 1) return und;

  const tagSets = tags.map((t) => new Set(t));
  const weighted: WEdge[] = und.map((e) => {
    const recip = dir.has(dirKey(e.a, e.b)) && dir.has(dirKey(e.b, e.a)) ? 1 : 0;
    const nj = jaccard(adj[e.a], adj[e.b]);
    const tj = jaccard(tagSets[e.a], tagSets[e.b]);
    return { a: e.a, b: e.b, w: 1 + recip + 2 * nj + tj };
  });

  // Keep each node's strongest `maxPerNode` edges (symmetric union).
  const perNode: WEdge[][] = Array.from({ length: n }, () => []);
  for (const e of weighted) {
    perNode[e.a].push(e);
    perNode[e.b].push(e);
  }
  const kept = new Set<number>();
  const keptEdges: IdxEdge[] = [];
  const add = (e: IdxEdge) => {
    const k = e.a * n + e.b;
    if (kept.has(k)) return;
    kept.add(k);
    keptEdges.push({ a: e.a, b: e.b });
  };
  for (let i = 0; i < n; i++) {
    perNode[i].sort((x, y) => y.w - x.w);
    for (const e of perNode[i].slice(0, maxPerNode)) add(e);
  }

  // Maximum spanning forest (Kruskal on descending weight) so filtering never
  // disconnects nodes that the full graph connected.
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  const sorted = [...weighted].sort((x, y) => y.w - x.w);
  for (const e of sorted) {
    const ra = find(e.a);
    const rb = find(e.b);
    if (ra !== rb) {
      parent[ra] = rb;
      add(e);
    }
  }

  return keptEdges;
}

/** Map the user-facing density setting to the k of the k-NN backbone. */
export function maxPerNodeFor(density: "sparse" | "balanced" | "all"): number {
  switch (density) {
    case "sparse":
      return 2;
    case "balanced":
      return 3;
    case "all":
      return Infinity;
  }
}
