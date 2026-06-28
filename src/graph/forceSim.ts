// A small force-directed layout used by the Graph View. It is deliberately
// dependency-free and mutation-based: nodes carry their own x/y/vx/vy and a step
// advances the whole system in place. The renderer drives it from a
// requestAnimationFrame loop (or runs a fixed number of steps synchronously when
// reduce-motion is on), keeping layout work out of React's render path.
//
// Stability (this is what keeps the graph from exploding and makes it settle):
//  - `alpha` is a cooling factor in [0, 1] the caller decays toward 0 each tick;
//    every force is scaled by it, so the system loses energy and comes to rest.
//  - velocities are damped each step and hard-capped, so a close-range repulsion
//    spike can never blow a node off to infinity.
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
  /** Per-step velocity multiplier (0..1); lower = more damping. */
  damping: number;
  /** Max distance considered for repulsion (perf guard). */
  maxRepulsionDist: number;
  /** Hard cap on per-step speed — the safety net against close-range spikes. */
  maxSpeed: number;
}

export const DEFAULT_PARAMS: SimParams = {
  repulsion: 5200,
  springK: 0.08,
  springLength: 90,
  centering: 0.045,
  damping: 0.6,
  maxRepulsionDist: 700,
  maxSpeed: 45,
};

// Cooling schedule (mirrors d3-force's defaults). The renderer owns the current
// alpha; these describe how it decays and when the layout is considered at rest.
export const ALPHA_DECAY = 0.0228;
export const ALPHA_MIN = 0.001;
/** Alpha to warm back up to on an interaction (e.g. a drag). */
export const REHEAT_ALPHA = 0.3;

/**
 * Advance the system one step, mutating node positions/velocities in place.
 * All forces are scaled by `alpha` (the cooling factor), so as the caller decays
 * alpha toward zero the graph settles and stops moving. Returns total kinetic
 * energy (useful for diagnostics; the caller stops on alpha, not energy).
 */
export function step(
  nodes: SimNode[],
  edges: SimEdge[],
  params: SimParams = DEFAULT_PARAMS,
  alpha = 1,
): number {
  const n = nodes.length;
  if (n === 0) return 0;

  // Pairwise repulsion (O(n^2)), scaled by alpha.
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
      const force = (params.repulsion * alpha) / d2;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      a.vx += fx;
      a.vy += fy;
      b.vx -= fx;
      b.vy -= fy;
    }
  }

  // Spring attraction along edges, scaled by alpha.
  for (const e of edges) {
    const a = nodes[e.a];
    const b = nodes[e.b];
    if (!a || !b) continue;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1e-4;
    const disp = dist - params.springLength;
    const force = params.springK * disp * alpha;
    const fx = (dx / dist) * force;
    const fy = (dy / dist) * force;
    a.vx += fx;
    a.vy += fy;
    b.vx -= fx;
    b.vy -= fy;
  }

  // Mild centering (scaled by alpha so it too fades), damp, cap, integrate.
  const maxSpeed = params.maxSpeed;
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
    node.vx -= node.x * params.centering * alpha;
    node.vy -= node.y * params.centering * alpha;
    node.vx *= params.damping;
    node.vy *= params.damping;
    // Hard speed cap: no single step can fling a node away.
    const speed = Math.sqrt(node.vx * node.vx + node.vy * node.vy);
    if (speed > maxSpeed) {
      const s = maxSpeed / speed;
      node.vx *= s;
      node.vy *= s;
    }
    node.x += node.vx;
    node.y += node.vy;
    energy += node.vx * node.vx + node.vy * node.vy;
  }
  return energy;
}
