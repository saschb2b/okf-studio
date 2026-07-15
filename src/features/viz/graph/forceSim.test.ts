import { describe, it, expect } from "vitest";
import {
  step,
  DEFAULT_PARAMS,
  ALPHA_DECAY,
  ALPHA_MIN,
  type SimNode,
  type SimEdge,
} from "@/features/viz/graph/forceSim.ts";

// All fixtures are deterministic: positions are derived from the node index
// (no Math.random), so a run is fully reproducible.

function makeNode(i: number, x: number, y: number, r = 8): SimNode {
  return { id: String(i), x, y, vx: 0, vy: 0, r, fx: null, fy: null };
}

// A deterministic pseudo-random in [-1, 1) derived from an integer seed. Used to
// scatter starting positions without Math.random (LCG-style hash).
function seeded(i: number): number {
  const h = Math.sin(i * 12.9898) * 43758.5453;
  return (h - Math.floor(h)) * 2 - 1;
}

// A ~60-node graph: a hub (node 0), a ring around it, and the rest scattered by
// a per-index seed. Edges wire the hub to everything plus a ring of links.
function hubRingScatter(n: number): { nodes: SimNode[]; edges: SimEdge[] } {
  const nodes: SimNode[] = [];
  nodes.push(makeNode(0, 0, 0)); // hub at origin
  const ringCount = Math.floor(n / 2);
  for (let i = 1; i <= ringCount; i++) {
    const a = (i / ringCount) * Math.PI * 2;
    nodes.push(makeNode(i, Math.cos(a) * 200, Math.sin(a) * 200));
  }
  for (let i = ringCount + 1; i < n; i++) {
    nodes.push(makeNode(i, seeded(i) * 300, seeded(i + 1000) * 300));
  }

  const edges: SimEdge[] = [];
  for (let i = 1; i < n; i++) edges.push({ a: 0, b: i }); // hub spokes
  for (let i = 1; i < ringCount; i++) edges.push({ a: i, b: i + 1 }); // ring chain
  if (ringCount > 1) edges.push({ a: ringCount, b: 1 }); // close the ring
  return { nodes, edges };
}

describe("forceSim", () => {
  it("cools to rest with bounded, finite positions (no explosion)", () => {
    const { nodes, edges } = hubRingScatter(60);

    let alpha = 1;
    let energy = Infinity;
    let ticks = 0;
    while (alpha > ALPHA_MIN && ticks < 1500) {
      energy = step(nodes, edges, DEFAULT_PARAMS, alpha);
      alpha += (0 - alpha) * ALPHA_DECAY;
      ticks++;
    }

    // The cooling schedule reaches rest well within the tick budget.
    expect(ticks).toBeLessThan(1500);
    // Settled: negligible residual kinetic energy.
    expect(energy).toBeLessThan(0.5);
    // Never flew off to infinity, and stayed within a sane bound.
    for (const node of nodes) {
      expect(Number.isFinite(node.x)).toBe(true);
      expect(Number.isFinite(node.y)).toBe(true);
      expect(Math.hypot(node.x, node.y)).toBeLessThan(20000);
    }
  });

  it("leaves no overlapping nodes once at rest (collision worked)", () => {
    const { nodes, edges } = hubRingScatter(60);

    let alpha = 1;
    let ticks = 0;
    while (alpha > ALPHA_MIN && ticks < 1500) {
      step(nodes, edges, DEFAULT_PARAMS, alpha);
      alpha += (0 - alpha) * ALPHA_DECAY;
      ticks++;
    }

    // Every pair is at least (r_a + r_b - 1) apart: collision separated them.
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const dist = Math.hypot(nodes[i].x - nodes[j].x, nodes[i].y - nodes[j].y);
        expect(dist).toBeGreaterThanOrEqual(nodes[i].r + nodes[j].r - 1);
      }
    }
  });

  it("respects the speed cap even with fully coincident nodes", () => {
    // Worst case: every node stacked on the origin → maximal repulsion spike.
    const nodes: SimNode[] = Array.from({ length: 20 }, (_, i) => makeNode(i, 0, 0));
    step(nodes, [], DEFAULT_PARAMS, 1);
    for (const node of nodes) {
      expect(Math.hypot(node.vx, node.vy)).toBeLessThanOrEqual(
        DEFAULT_PARAMS.maxSpeed + 1e-6,
      );
    }
  });

  it("repels more strongly from heavier (higher-degree) nodes", () => {
    // T sits between a heavy node H (left) and a light node L (right), equidistant.
    // With degree-weighted mass, H pushes T harder than L, so T drifts right (+x);
    // with unit mass the two would cancel. No edges/overlap to interfere.
    const T: SimNode = { id: "T", x: 0, y: 0, vx: 0, vy: 0, r: 8, mass: 1, fx: null, fy: null };
    const H: SimNode = { id: "H", x: -100, y: 0, vx: 0, vy: 0, r: 8, mass: 10, fx: null, fy: null };
    const L: SimNode = { id: "L", x: 100, y: 0, vx: 0, vy: 0, r: 8, mass: 1, fx: null, fy: null };
    step([T, H, L], [], DEFAULT_PARAMS, 1);
    expect(T.vx).toBeGreaterThan(0);
  });

  it("pulls same-cluster nodes toward their shared centroid (cluster gravity)", () => {
    // Two 3-node communities far apart, no edges, all other forces off — only
    // cluster gravity acts. Each community should contract around its own
    // centroid while the two groups do not attract each other.
    const mk = (i: number, x: number, y: number, cluster: number): SimNode => ({
      ...makeNode(i, x, y),
      cluster,
    });
    const nodes = [
      mk(0, -500, -60, 0), mk(1, -400, 60, 0), mk(2, -300, 0, 0),
      mk(3, 300, 0, 1), mk(4, 400, -60, 1), mk(5, 500, 60, 1),
    ];
    const params = {
      ...DEFAULT_PARAMS,
      repulsion: 0,
      springK: 0,
      centering: 0,
      collision: 0,
      clusterStrength: 0.2,
    };
    const spread = (ids: number[]) => {
      const cx = ids.reduce((s, i) => s + nodes[i].x, 0) / ids.length;
      return ids.reduce((s, i) => s + Math.abs(nodes[i].x - cx), 0);
    };
    const before0 = spread([0, 1, 2]);
    const before1 = spread([3, 4, 5]);
    const gapBefore = nodes[3].x - nodes[2].x;
    for (let s = 0; s < 20; s++) step(nodes, [], params, 1);
    expect(spread([0, 1, 2])).toBeLessThan(before0);
    expect(spread([3, 4, 5])).toBeLessThan(before1);
    // The two communities have no cross-pull; the gap must not shrink.
    expect(nodes[3].x - nodes[2].x).toBeGreaterThanOrEqual(gapBefore * 0.99);
  });

  it("pushes overlapping communities apart (cluster separation)", () => {
    // Two 4-node communities whose centroids start close together (interleaved).
    // Only the cluster force is active; separation should grow the gap between
    // the two centroids while gravity keeps each community tight.
    const mk = (i: number, x: number, y: number, cluster: number): SimNode => ({
      ...makeNode(i, x, y),
      cluster,
    });
    const nodes = [
      mk(0, -30, -20, 0), mk(1, -20, 20, 0), mk(2, -40, 0, 0), mk(3, -25, 5, 0),
      mk(4, 30, -20, 1), mk(5, 20, 20, 1), mk(6, 40, 0, 1), mk(7, 25, 5, 1),
    ];
    const params = {
      ...DEFAULT_PARAMS,
      repulsion: 0,
      springK: 0,
      centering: 0,
      collision: 0,
      clusterStrength: 0.2,
    };
    const centroidX = (ids: number[]) =>
      ids.reduce((s, i) => s + nodes[i].x, 0) / ids.length;
    const gapBefore = centroidX([4, 5, 6, 7]) - centroidX([0, 1, 2, 3]);
    for (let s = 0; s < 40; s++) step(nodes, [], params, 1);
    const gapAfter = centroidX([4, 5, 6, 7]) - centroidX([0, 1, 2, 3]);
    expect(gapAfter).toBeGreaterThan(gapBefore * 1.5);
    for (const node of nodes) {
      expect(Number.isFinite(node.x)).toBe(true);
    }
  });

  it("scales to many nodes without blowing up (Barnes-Hut smoke test)", () => {
    const N = 1500;
    const nodes: SimNode[] = Array.from({ length: N }, (_, i) =>
      // Spread on a wide grid-ish layout derived purely from the index.
      makeNode(i, (i % 50) * 30 - 750, Math.floor(i / 50) * 30 - 450),
    );
    const edges: SimEdge[] = [];
    for (let i = 0; i < 40; i++) edges.push({ a: i, b: (i * 37 + 11) % N });

    for (let s = 0; s < 5; s++) step(nodes, edges, DEFAULT_PARAMS, 1);

    for (const node of nodes) {
      expect(Number.isFinite(node.x)).toBe(true);
      expect(Number.isFinite(node.y)).toBe(true);
    }
  });
});
