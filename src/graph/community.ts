// Louvain community detection (modularity maximization) for coloring the graph
// by emergent cluster. Dependency-free and deterministic: communities are moved
// in node-index order with no random tie-breaks, so the same graph always yields
// the same grouping (and therefore stable colors run to run). Leiden is the
// known upgrade for Louvain's badly-connected-community edge case; Louvain is
// plenty for a personal-knowledge-graph's node counts. See
// docs/features/graph-view.md.

export interface CommunityEdge {
  a: number;
  b: number;
}

type Adj = Map<number, number>[]; // adj[i]: neighbor -> summed weight

/** Weighted degree of each node: incident edge weight + twice its self-loops. */
function degrees(n: number, adj: Adj, selfW: number[]): number[] {
  const k = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    let s = 2 * selfW[i];
    for (const w of adj[i].values()) s += w;
    k[i] = s;
  }
  return k;
}

/**
 * One Louvain level: greedily move each node to the neighboring community that
 * maximizes modularity gain, until stable. Returns the per-node community
 * (renumbered 0..c-1) and whether any move improved the partition.
 */
function oneLevel(
  n: number,
  adj: Adj,
  selfW: number[],
  m2: number,
): { comm: number[]; improved: boolean } {
  const comm = Array.from({ length: n }, (_, i) => i);
  const k = degrees(n, adj, selfW);
  const sigmaTot = k.slice(); // each node starts alone
  let improvedAny = false;

  let moved = true;
  let guard = 0;
  while (moved && guard++ < 100) {
    moved = false;
    for (let i = 0; i < n; i++) {
      const ci = comm[i];
      // Summed edge weight from i to each neighboring community.
      const wTo = new Map<number, number>();
      for (const [j, w] of adj[i]) {
        const cj = comm[j];
        wTo.set(cj, (wTo.get(cj) ?? 0) + w);
      }
      // Take i out of its community, then pick the community with the best gain
      // (ΔQ ∝ w_to(c) − sigmaTot[c]·k_i / 2m); staying is the baseline.
      sigmaTot[ci] -= k[i];
      let best = ci;
      let bestDelta = (wTo.get(ci) ?? 0) - (sigmaTot[ci] * k[i]) / m2;
      for (const [c, w] of wTo) {
        if (c === ci) continue;
        const delta = w - (sigmaTot[c] * k[i]) / m2;
        if (delta > bestDelta) {
          bestDelta = delta;
          best = c;
        }
      }
      sigmaTot[best] += k[i];
      if (best !== ci) {
        comm[i] = best;
        moved = true;
        improvedAny = true;
      }
    }
  }

  // Renumber communities to a dense 0..c-1.
  const map = new Map<number, number>();
  let next = 0;
  for (let i = 0; i < n; i++) {
    const c = comm[i];
    let mapped = map.get(c);
    if (mapped === undefined) {
      mapped = next++;
      map.set(c, mapped);
    }
    comm[i] = mapped;
  }
  return { comm, improved: improvedAny };
}

/** Collapse each community into a super-node, summing inter/intra edge weights. */
function aggregate(
  n: number,
  adj: Adj,
  selfW: number[],
  comm: number[],
  count: number,
): { adj: Adj; selfW: number[] } {
  const newAdj: Adj = Array.from({ length: count }, () => new Map<number, number>());
  const newSelf = new Array<number>(count).fill(0);
  for (let i = 0; i < n; i++) {
    const ci = comm[i];
    newSelf[ci] += selfW[i];
    for (const [j, w] of adj[i]) {
      const cj = comm[j];
      if (ci === cj) {
        if (i < j) newSelf[ci] += w; // intra-community edge → self-loop (once)
      } else {
        newAdj[ci].set(cj, (newAdj[ci].get(cj) ?? 0) + w);
      }
    }
  }
  return { adj: newAdj, selfW: newSelf };
}

/** Final pass: renumber communities by descending size (stable color order). */
function renumberBySize(membership: number[]): number[] {
  const size = new Map<number, number>();
  for (const c of membership) size.set(c, (size.get(c) ?? 0) + 1);
  const order = [...size.keys()].sort(
    (x, y) => (size.get(y) ?? 0) - (size.get(x) ?? 0) || x - y,
  );
  const map = new Map<number, number>();
  order.forEach((c, i) => map.set(c, i));
  return membership.map((c) => map.get(c) ?? 0);
}

/**
 * Assign each of `n` nodes (0..n-1) a community index by Louvain modularity
 * optimization over the undirected, unit-weight `edges`. With no edges every
 * node is its own community. Result indices are 0..k-1, largest community first.
 */
export function louvain(n: number, edges: CommunityEdge[]): number[] {
  if (n === 0) return [];

  let nodes = n;
  let adj: Adj = Array.from({ length: n }, () => new Map<number, number>());
  let selfW = new Array<number>(n).fill(0);
  let m2 = 0; // 2 * total edge weight
  for (const { a, b } of edges) {
    if (a < 0 || b < 0 || a >= n || b >= n) continue;
    if (a === b) {
      selfW[a] += 1;
      m2 += 2;
      continue;
    }
    adj[a].set(b, (adj[a].get(b) ?? 0) + 1);
    adj[b].set(a, (adj[b].get(a) ?? 0) + 1);
    m2 += 2;
  }
  // No edges → no structure: each node its own community.
  if (m2 === 0) return renumberBySize(Array.from({ length: n }, (_, i) => i));

  const membership = Array.from({ length: n }, (_, i) => i);
  let guard = 0;
  for (;;) {
    const { comm, improved } = oneLevel(nodes, adj, selfW, m2);
    for (let i = 0; i < n; i++) membership[i] = comm[membership[i]];
    const count = Math.max(...comm) + 1;
    if (!improved || count === nodes || guard++ > 50) break;
    ({ adj, selfW } = aggregate(nodes, adj, selfW, comm, count));
    nodes = count;
  }
  return renumberBySize(membership);
}
