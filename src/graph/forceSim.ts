// A small force-directed layout used by the Graph View. It is deliberately
// dependency-free and mutation-based: nodes carry their own x/y/vx/vy and a step
// advances the whole system in place. The renderer drives it from a
// requestAnimationFrame loop (or runs a fixed number of steps synchronously when
// reduce-motion is on), keeping layout work out of React's render path.
//
// For a few hundred nodes the naive O(n^2) repulsion is fine; a Barnes-Hut
// quad-tree is the documented next step for larger bundles (see
// docs/architecture/performance.md).

export interface SimNode {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Visual radius, derived from degree by the renderer. */
  r: number;
  /** When set, the node is pinned to (fx, fy) — used while dragging. */
  fx: number | null;
  fy: number | null;
}

export interface SimEdge {
  /** Indices into the node array, resolved once before stepping. */
  a: number;
  b: number;
}

export interface SimParams {
  /** Coulomb-like node repulsion strength. */
  repulsion: number;
  /** Hooke spring stiffness along edges. */
  springK: number;
  /** Natural edge length. */
  springLength: number;
  /** Pull toward the origin so the graph does not drift off-screen. */
  centering: number;
  /** Per-step velocity damping (0..1). */
  damping: number;
  /** Max distance considered for repulsion (perf guard). */
  maxRepulsionDist: number;
}

export const DEFAULT_PARAMS: SimParams = {
  repulsion: 9000,
  springK: 0.02,
  springLength: 90,
  centering: 0.012,
  damping: 0.86,
  maxRepulsionDist: 600,
};

/**
 * Advance the system one step, mutating node positions/velocities in place.
 * Returns the total kinetic energy so callers can detect when the layout has
 * settled and stop the animation loop.
 */
export function step(
  nodes: SimNode[],
  edges: SimEdge[],
  params: SimParams = DEFAULT_PARAMS,
): number {
  const n = nodes.length;
  if (n === 0) return 0;

  // Pairwise repulsion (O(n^2)).
  const maxD2 = params.maxRepulsionDist * params.maxRepulsionDist;
  for (let i = 0; i < n; i++) {
    const a = nodes[i];
    for (let j = i + 1; j < n; j++) {
      const b = nodes[j];
      let dx = a.x - b.x;
      let dy = a.y - b.y;
      let d2 = dx * dx + dy * dy;
      if (d2 > maxD2) continue;
      if (d2 < 1e-4) {
        // Coincident nodes: nudge apart deterministically by index.
        dx = (i - j) * 0.5 + 0.5;
        dy = (j - i) * 0.5 + 0.5;
        d2 = dx * dx + dy * dy;
      }
      const dist = Math.sqrt(d2);
      const force = params.repulsion / d2;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      a.vx += fx;
      a.vy += fy;
      b.vx -= fx;
      b.vy -= fy;
    }
  }

  // Spring attraction along edges.
  for (const e of edges) {
    const a = nodes[e.a];
    const b = nodes[e.b];
    if (!a || !b) continue;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1e-4;
    const disp = dist - params.springLength;
    const force = params.springK * disp;
    const fx = (dx / dist) * force;
    const fy = (dy / dist) * force;
    a.vx += fx;
    a.vy += fy;
    b.vx -= fx;
    b.vy -= fy;
  }

  // Mild centering + integrate, accumulating kinetic energy.
  let energy = 0;
  for (let i = 0; i < n; i++) {
    const node = nodes[i];
    if (node.fx !== null && node.fy !== null) {
      // Pinned: snap to the fixed point, no velocity.
      node.x = node.fx;
      node.y = node.fy;
      node.vx = 0;
      node.vy = 0;
      continue;
    }
    node.vx -= node.x * params.centering;
    node.vy -= node.y * params.centering;
    node.vx *= params.damping;
    node.vy *= params.damping;
    node.x += node.vx;
    node.y += node.vy;
    energy += node.vx * node.vx + node.vy * node.vy;
  }
  return energy;
}
