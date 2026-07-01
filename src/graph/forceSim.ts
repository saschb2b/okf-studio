// A force-directed layout used by the Graph View. It is deliberately
// dependency-free and mutation-based: nodes carry their own x/y/vx/vy and a step
// advances the whole system in place. The renderer drives it from a
// requestAnimationFrame loop (or runs a fixed number of steps synchronously when
// reduce-motion is on), keeping layout work out of React's render path.
//
// Stability (this is what keeps the graph from exploding and makes it settle):
//  - `alpha` is a cooling factor in [0, 1] the caller decays toward 0 each tick;
//    every *force* is scaled by it, so the system loses energy and comes to rest.
//  - velocities are damped each step and hard-capped, so a close-range repulsion
//    spike can never blow a node off to infinity.
//
// Scale (this is what lets it handle tens-to-hundreds of nodes, like Obsidian):
//  - many-body repulsion uses a Barnes-Hut quad-tree, O(n log n) instead of the
//    old O(n^2) all-pairs loop. Distant clusters are approximated by their
//    aggregate centre of mass.
//  - overlaps are resolved by a position-based collision pass over a uniform
//    spatial grid, so nodes never sit on top of each other. Collision acts only
//    on actual overlaps and is NOT scaled by alpha, so it keeps nodes apart even
//    after the layout has cooled — yet it never prevents the graph from settling.
//
// Determinism: there is no Math.random anywhere in this file. Coincident points
// are separated by a tiny index-derived offset, so the same input always yields
// the same layout (important for reproducible snapshots and tests).

export interface SimNode {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Visual radius, derived from degree by the renderer. */
  r: number;
  /**
   * Repulsive weight (the Barnes-Hut body mass), derived from degree by the
   * renderer (≈ degree + 1). Heavier hubs and denser clusters push others away
   * more — the ForceAtlas2 trick that gives the hub-and-spoke spread and lets
   * clusters separate for free. Defaults to 1 (unit mass) when unset.
   */
  mass?: number;
  /** When set, the node is pinned to (fx, fy) — used while dragging. */
  fx: number | null;
  fy: number | null;
  /**
   * Detected community id (Louvain), assigned by the renderer. When
   * `clusterStrength` > 0, same-cluster nodes are gently pulled toward their
   * shared centroid so the layout agrees with the detected clustering.
   */
  cluster?: number;
}

export interface SimEdge {
  /** Indices into the node array, resolved once before stepping. */
  a: number;
  b: number;
}

export interface SimParams {
  /** Barnes-Hut many-body charge strength (controls node spacing). */
  repulsion: number;
  /** Link (spring) stiffness along edges. */
  springK: number;
  /** Natural link distance. */
  springLength: number;
  /** Gravity toward the origin so the graph does not drift off-screen. */
  centering: number;
  /** Per-step velocity multiplier (0..1); lower = more damping. */
  damping: number;
  /** Collision response strength, 0..1 (0 disables the collision pass). */
  collision: number;
  /** Extra px beyond node radius for collision spacing. */
  collisionPadding: number;
  /** Barnes-Hut accuracy threshold; larger = faster but looser (e.g. 0.9). */
  theta: number;
  /** Hard cap on per-step speed — the safety net against close-range spikes. */
  maxSpeed: number;
  /**
   * Link attraction model. "spring" is Hooke toward `springLength` (the neutral
   * default; the sim tests use it). "linlog" is a gentle logarithmic pull
   * (ForceAtlas2's LinLog) that does NOT grow with distance, so connected
   * clusters aren't yanked tight — repulsion spreads them into a neatly
   * distributed, untangled layout instead of a central knot. Defaults to "spring".
   */
  linkModel?: "spring" | "linlog";
  /**
   * Cluster gravity (cosmos.gl's point-clustering force): pull strength toward
   * each node's detected-community centroid (see SimNode.cluster). Emergent
   * layout only *approximates* the communities Louvain detects; this makes the
   * geometry agree with them — tighter blobs, clearer separation. 0 (default)
   * disables the pass entirely.
   */
  clusterStrength?: number;
}

export const DEFAULT_PARAMS: SimParams = {
  repulsion: 900,
  springK: 0.05,
  springLength: 70,
  centering: 0.04,
  damping: 0.6,
  collision: 0.8,
  collisionPadding: 4,
  theta: 0.9,
  maxSpeed: 40,
  linkModel: "spring",
};

// Cooling schedule (mirrors d3-force's defaults). The renderer owns the current
// alpha; these describe how it decays and when the layout is considered at rest.
export const ALPHA_DECAY = 0.0228;
export const ALPHA_MIN = 0.001;
/** Alpha to warm back up to on an interaction (e.g. a drag). */
export const REHEAT_ALPHA = 0.3;

// ---------------------------------------------------------------------------
// Barnes-Hut quad-tree
// ---------------------------------------------------------------------------
//
// A region quad-tree over the node positions. Each internal cell aggregates the
// mass (node count, since every node is unit mass) and centre of mass of its
// subtree, so a distant cluster can be treated as a single body. Cells are
// stored in flat parallel arrays (struct-of-arrays) rather than objects to keep
// allocation cheap and traversal cache-friendly when there are many nodes.
//
// Each cell is one of:
//   - empty           (count === 0)
//   - a leaf body     (count === 1, holds one node index in `qLeaf`)
//   - an internal cell(count  >  1, has up to four `qChild` quadrants)
//
// Quadrant layout for a cell centred on (cx, cy):
//   index = (x >= cx ? 1 : 0) | (y >= cy ? 2 : 0)
//     0 = top-left, 1 = top-right, 2 = bottom-left, 3 = bottom-right.

// Maximum subdivision depth. Coincident (and effectively-coincident) nodes are
// merged into a shared leaf once this depth is reached, which bounds both tree
// depth and total cell count even for pathological clustered inputs.
const MAX_DEPTH = 40;

interface QuadTree {
  /** Subtree node count — used for structure and self-exclusion. */
  count: Int32Array;
  /** Aggregate repulsive mass of the subtree (sum of node masses). */
  mass: Float64Array;
  /** Aggregate (mass-weighted) centre of mass; for leaves it's the body position. */
  comX: Float64Array;
  comY: Float64Array;
  /** Cell centre and half-width of the square region it covers. */
  cx: Float64Array;
  cy: Float64Array;
  half: Float64Array;
  /**
   * For leaf cells: the index of one resident node, or -1 for internal cells.
   * Coincident nodes are merged into a single leaf (count > 1 but qLeaf set and
   * no children), so the tree depth is bounded even when points overlap.
   */
  qLeaf: Int32Array;
  /** Child cell ids for the four quadrants, or -1 when absent. */
  qChild: Int32Array;
  /** Number of cells currently allocated. */
  size: number;
}

function buildQuadTree(nodes: SimNode[]): QuadTree | null {
  const n = nodes.length;
  if (n === 0) return null;

  // Bounding square over all node positions, expanded to be strictly square so
  // every subdivision stays square (keeps cellSize/distance meaningful).
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < n; i++) {
    const nd = nodes[i];
    if (nd.x < minX) minX = nd.x;
    if (nd.y < minY) minY = nd.y;
    if (nd.x > maxX) maxX = nd.x;
    if (nd.y > maxY) maxY = nd.y;
  }
  const cx0 = (minX + maxX) / 2;
  const cy0 = (minY + maxY) / 2;
  // Half-width of the root square; guard against a zero/degenerate extent.
  let half = Math.max(maxX - minX, maxY - minY) / 2;
  if (!(half > 0)) half = 1;
  half *= 1.0000001; // tiny margin so points exactly on the edge stay inside.

  // Cell budget. A quad-tree over n distinct points needs O(n) cells, but a few
  // levels of subdivision per insertion add a constant factor; coincident nodes
  // are merged (not subdivided), so this bound holds even for stacked points.
  const cap = MAX_DEPTH * n + 16;
  const tree: QuadTree = {
    count: new Int32Array(cap),
    mass: new Float64Array(cap),
    comX: new Float64Array(cap),
    comY: new Float64Array(cap),
    cx: new Float64Array(cap),
    cy: new Float64Array(cap),
    half: new Float64Array(cap),
    qLeaf: new Int32Array(cap).fill(-1),
    qChild: new Int32Array(cap * 4).fill(-1),
    size: 0,
  };

  // Allocate the root cell.
  const root = allocCell(tree, cx0, cy0, half);

  for (let i = 0; i < n; i++) {
    insert(tree, root, i, nodes[i].x, nodes[i].y, nodes[i].mass ?? 1);
  }

  // Compute aggregate mass and centre of mass bottom-up. Because a child cell
  // always has a higher id than its parent (it is allocated during the parent's
  // subdivision), a single descending sweep lets parents read finished children.
  for (let c = tree.size - 1; c >= 0; c--) {
    // Skip empties and leaves (incl. merged coincident leaves, count > 1 but no
    // children) — their count/com are already final from insertion.
    if (tree.qLeaf[c] >= 0 || tree.count[c] === 0) continue;
    let cnt = 0;
    let mass = 0;
    let sx = 0;
    let sy = 0;
    const base = c * 4;
    for (let q = 0; q < 4; q++) {
      const child = tree.qChild[base + q];
      if (child < 0) continue;
      const cmass = tree.mass[child];
      cnt += tree.count[child];
      mass += cmass;
      sx += tree.comX[child] * cmass; // mass-weighted centre of mass
      sy += tree.comY[child] * cmass;
    }
    tree.count[c] = cnt;
    tree.mass[c] = mass;
    tree.comX[c] = sx / mass;
    tree.comY[c] = sy / mass;
  }

  return tree;
}

function allocCell(t: QuadTree, cx: number, cy: number, half: number): number {
  const id = t.size++;
  t.count[id] = 0;
  t.comX[id] = 0;
  t.comY[id] = 0;
  t.cx[id] = cx;
  t.cy[id] = cy;
  t.half[id] = half;
  t.qLeaf[id] = -1;
  const base = id * 4;
  t.qChild[base] = -1;
  t.qChild[base + 1] = -1;
  t.qChild[base + 2] = -1;
  t.qChild[base + 3] = -1;
  return id;
}

// Insert node `idx` (at x,y) into the subtree rooted at `cell`. Fully iterative
// (no recursion), so even deeply clustered inputs cannot overflow the stack.
//
// Empty cell        -> becomes a leaf holding this node.
// Leaf cell         -> if the resident is at the same point (or we hit the depth
//                      cap), merge the new node into it (count++, shared com);
//                      otherwise push the resident down one level and continue
//                      descending so both end up in separate sub-cells.
// Internal cell     -> descend into the matching quadrant and repeat.
function insert(
  t: QuadTree,
  cell: number,
  idx: number,
  x: number,
  y: number,
  m: number,
): void {
  let depth = 0;
  for (;;) {
    const c = t.count[cell];

    if (c === 0) {
      // Empty cell becomes a leaf holding this node.
      t.count[cell] = 1;
      t.mass[cell] = m;
      t.qLeaf[cell] = idx;
      t.comX[cell] = x;
      t.comY[cell] = y;
      return;
    }

    const leaf = t.qLeaf[cell];
    if (leaf >= 0) {
      // This is a leaf cell. Decide whether to merge or to split it.
      const rx = t.comX[cell];
      const ry = t.comY[cell];
      const same = Math.abs(rx - x) < 1e-9 && Math.abs(ry - y) < 1e-9;
      if (same || depth >= MAX_DEPTH) {
        // Coincident (or at the depth cap): merge into a shared leaf bucket.
        // Keep com as the (equal) position; just bump the count and accumulate
        // the mass. qLeaf stays set and no children are created, so it reads as a
        // single body of the combined mass.
        t.count[cell] = c + 1;
        t.mass[cell] += m;
        return;
      }
      // Split: push the resident node down into its child quadrant, turning this
      // cell internal. Then fall through to place the new node from here.
      const childHalf = t.half[cell] / 2;
      const cx = t.cx[cell];
      const cy = t.cy[cell];
      const rq = (rx >= cx ? 1 : 0) | (ry >= cy ? 2 : 0);
      const rChild = allocCell(
        t,
        cx + (rq & 1 ? childHalf : -childHalf),
        cy + (rq & 2 ? childHalf : -childHalf),
        childHalf,
      );
      t.qChild[cell * 4 + rq] = rChild;
      t.count[rChild] = 1;
      t.mass[rChild] = t.mass[cell]; // the resident keeps its own mass
      t.qLeaf[rChild] = leaf;
      t.comX[rChild] = rx;
      t.comY[rChild] = ry;
      // This cell is now internal: clear its leaf marker. (count/com are fixed
      // up in the bottom-up aggregation pass.)
      t.qLeaf[cell] = -1;
    }

    // Internal cell: descend into the matching quadrant, allocating on demand.
    const childHalf = t.half[cell] / 2;
    const cx = t.cx[cell];
    const cy = t.cy[cell];
    const q = (x >= cx ? 1 : 0) | (y >= cy ? 2 : 0);
    const base = cell * 4;
    let child = t.qChild[base + q];
    if (child < 0) {
      child = allocCell(
        t,
        cx + (q & 1 ? childHalf : -childHalf),
        cy + (q & 2 ? childHalf : -childHalf),
        childHalf,
      );
      t.qChild[base + q] = child;
    }
    cell = child;
    depth++;
  }
}

// Accumulate the Barnes-Hut repulsion on node `i` by traversing the tree. A cell
// is used as a single aggregate body when `cellSize / distance < theta`; closer
// cells are recursed into. Force is inverse-square, scaled by mass and alpha.
function applyRepulsion(
  t: QuadTree,
  root: number,
  i: number,
  node: SimNode,
  repAlpha: number,
  theta2: number,
  stack: Int32Array,
): void {
  const px = node.x;
  const py = node.y;
  let fvx = 0;
  let fvy = 0;
  let sp = 0;
  stack[sp++] = root;

  while (sp > 0) {
    const cell = stack[--sp];
    const cnt = t.count[cell];
    if (cnt === 0) continue;

    let dx = t.comX[cell] - px;
    let dy = t.comY[cell] - py;
    let d2 = dx * dx + dy * dy;

    const leaf = t.qLeaf[cell];
    if (leaf >= 0) {
      // A leaf is a single point that may hold several coincident nodes; its
      // mass is the combined body weight. Exclude this node's own contribution
      // if it lives here (subtract its mass).
      let bodies = t.mass[cell];
      const im = node.mass ?? 1;
      if (leaf === i || d2 < 1e-12) {
        // Either this leaf is exactly where node i sits (so it likely contains
        // i), or it is coincident with i. Drop i's own contribution.
        bodies -= im;
        if (bodies <= 1e-9) continue; // only this node here: nothing to apply.
        // Separate coincident points deterministically (no randomness).
        const o = leaf;
        dx = ((i - o) % 7) * 0.5 + 0.5;
        dy = ((o - i) % 5) * 0.5 + 0.5;
        d2 = dx * dx + dy * dy;
      }
      const dist = Math.sqrt(d2);
      const force = (repAlpha * bodies) / d2;
      fvx -= (dx / dist) * force;
      fvy -= (dy / dist) * force;
      continue;
    }

    // Internal cell. cellSize = full width = 2 * half.
    const size = t.half[cell] * 2;
    if (d2 > 1e-12 && (size * size) / d2 < theta2) {
      // Far enough: treat the whole subtree as one aggregate body.
      const dist = Math.sqrt(d2);
      const force = (repAlpha * t.mass[cell]) / d2;
      fvx -= (dx / dist) * force;
      fvy -= (dy / dist) * force;
    } else {
      // Too close (or coincident with the centre of mass): recurse.
      const base = cell * 4;
      for (let q = 0; q < 4; q++) {
        const child = t.qChild[base + q];
        if (child >= 0 && t.count[child] > 0) stack[sp++] = child;
      }
    }
  }

  // Repulsion pushes the node away from others (note the minus signs above mean
  // fvx/fvy already point away). Add into velocity.
  node.vx += fvx;
  node.vy += fvy;
}

// ---------------------------------------------------------------------------
// Collision (position-based, over a uniform spatial grid)
// ---------------------------------------------------------------------------
//
// After integration we resolve overlaps directly in position space so nodes
// never sit on top of one another. Two nodes overlap when their centre distance
// is less than r_a + r_b + collisionPadding; we push them apart along their
// connecting axis by `collision * overlap / 2` each (pinned nodes don't move).
//
// To stay near-linear we bucket nodes into a uniform grid whose cell size is the
// largest collision diameter, so each node only tests the 3x3 block of cells
// around it instead of all pairs.

function resolveCollisions(nodes: SimNode[], strength: number, padding: number): void {
  const n = nodes.length;
  if (n < 2 || strength <= 0) return;

  // Cell size = largest possible interaction diameter, so any colliding pair is
  // guaranteed to fall in adjacent cells.
  let maxR = 0;
  for (let i = 0; i < n; i++) if (nodes[i].r > maxR) maxR = nodes[i].r;
  const cellSize = Math.max(2 * maxR + padding, 1);

  // Run 2 relaxation iterations; this is enough to clear typical overlaps and is
  // cheap because it only ever acts on nodes that are actually overlapping.
  for (let iter = 0; iter < 2; iter++) {
    // Bucket nodes by grid cell. Map keyed by "gx,gy" -> list of node indices.
    const grid = new Map<number, number[]>();
    const invCell = 1 / cellSize;
    // Pack (gx, gy) into a single number key with a large stride; node coords are
    // bounded by the speed cap and centering, so this stays well within range.
    const STRIDE = 1 << 16;
    const cellKey = (gx: number, gy: number): number => (gx + STRIDE / 2) * STRIDE + (gy + STRIDE / 2);

    for (let i = 0; i < n; i++) {
      const nd = nodes[i];
      const gx = Math.floor(nd.x * invCell);
      const gy = Math.floor(nd.y * invCell);
      const key = cellKey(gx, gy);
      const bucket = grid.get(key);
      if (bucket) bucket.push(i);
      else grid.set(key, [i]);
    }

    // For each node, test against nodes in its own and neighbouring cells. To
    // avoid testing each pair twice we only look at neighbour cells with a
    // (dgx, dgy) ordering that is >= the current cell, and within a cell only
    // test j > i.
    for (let i = 0; i < n; i++) {
      const a = nodes[i];
      const gx = Math.floor(a.x * invCell);
      const gy = Math.floor(a.y * invCell);
      for (let dgx = -1; dgx <= 1; dgx++) {
        for (let dgy = -1; dgy <= 1; dgy++) {
          const bucket = grid.get(cellKey(gx + dgx, gy + dgy));
          if (!bucket) continue;
          for (const j of bucket) {
            if (j <= i) continue; // each unordered pair handled once.
            const b = nodes[j];
            let dx = b.x - a.x;
            let dy = b.y - a.y;
            const minDist = a.r + b.r + padding;
            let d2 = dx * dx + dy * dy;
            if (d2 >= minDist * minDist) continue; // not overlapping.
            if (d2 < 1e-9) {
              // Coincident: separate deterministically along an index axis.
              dx = ((i - j) % 7) * 0.5 + 0.5;
              dy = ((j - i) % 5) * 0.5 + 0.5;
              d2 = dx * dx + dy * dy;
            }
            const dist = Math.sqrt(d2);
            const overlap = minDist - dist;
            const ux = dx / dist;
            const uy = dy / dist;
            const push = (strength * overlap) / 2;
            const aPinned = a.fx !== null && a.fy !== null;
            const bPinned = b.fx !== null && b.fy !== null;
            if (aPinned && bPinned) continue;
            if (aPinned) {
              // Only b moves; give it the full correction.
              b.x += ux * push * 2;
              b.y += uy * push * 2;
            } else if (bPinned) {
              a.x -= ux * push * 2;
              a.y -= uy * push * 2;
            } else {
              a.x -= ux * push;
              a.y -= uy * push;
              b.x += ux * push;
              b.y += uy * push;
            }
          }
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Step
// ---------------------------------------------------------------------------

/**
 * Advance the system one step, mutating node positions/velocities in place.
 *
 * Forces (repulsion, springs, centering) are scaled by `alpha` (the cooling
 * factor), so as the caller decays alpha toward zero the graph settles and
 * stops. Collision is a position-based correction applied after integration and
 * is deliberately NOT scaled by alpha — it keeps nodes apart even once cooled,
 * yet only ever acts on real overlaps so it does not prevent settling.
 *
 * Returns total kinetic energy (sum of v^2 over unpinned nodes); the caller
 * stops on alpha, not energy, but this is handy for diagnostics/tests.
 */
export function step(
  nodes: SimNode[],
  edges: SimEdge[],
  params: SimParams = DEFAULT_PARAMS,
  alpha = 1,
): number {
  const n = nodes.length;
  if (n === 0) return 0;

  // 1. Barnes-Hut many-body repulsion, scaled by alpha (O(n log n)).
  const tree = buildQuadTree(nodes);
  if (tree) {
    const root = 0;
    const repAlpha = params.repulsion * alpha;
    const theta2 = params.theta * params.theta;
    // Reusable traversal stack; tree depth * 4 is a safe bound, but tree.size is
    // an absolute upper bound on cells we could push, so size it generously.
    const stack = new Int32Array(tree.size + 4);
    for (let i = 0; i < n; i++) {
      applyRepulsion(tree, root, i, nodes[i], repAlpha, theta2, stack);
    }
  }

  // 2. Link attraction along edges, scaled by alpha. Two models (see SimParams):
  //  - "spring": Hooke toward `springLength` — pulls harder the farther apart, so
  //    a dense graph collapses toward its hubs into a tangle.
  //  - "linlog": a gentle logarithmic pull that does not grow with distance, so
  //    repulsion can spread clusters apart for a neat, untangled distribution.
  const linlog = params.linkModel === "linlog";
  for (const e of edges) {
    const a = nodes[e.a];
    const b = nodes[e.b];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1e-4;
    const force = linlog
      ? params.springK * Math.log1p(dist) * alpha
      : params.springK * (dist - params.springLength) * alpha;
    const fx = (dx / dist) * force;
    const fy = (dy / dist) * force;
    a.vx += fx;
    a.vy += fy;
    b.vx -= fx;
    b.vy -= fy;
  }

  // 3. Cluster gravity: pull each node toward its detected community's
  // centroid (unweighted mean, recomputed per step — O(n)). Linear in
  // distance, like centering, and alpha-scaled so it fades as the layout
  // cools. Skipped entirely at strength 0; singleton clusters cancel out.
  const clusterK = (params.clusterStrength ?? 0) * alpha;
  if (clusterK > 0) {
    const sums = new Map<number, { x: number; y: number; n: number }>();
    for (const node of nodes) {
      if (node.cluster === undefined) continue;
      const s = sums.get(node.cluster);
      if (s) {
        s.x += node.x;
        s.y += node.y;
        s.n++;
      } else {
        sums.set(node.cluster, { x: node.x, y: node.y, n: 1 });
      }
    }
    for (const node of nodes) {
      if (node.cluster === undefined) continue;
      const s = sums.get(node.cluster);
      if (!s || s.n < 2) continue;
      node.vx += (s.x / s.n - node.x) * clusterK;
      node.vy += (s.y / s.n - node.y) * clusterK;
    }
  }

  // 4. Centering gravity toward the origin (scaled by alpha so it too fades),
  // 5. then integrate: damp, cap speed, move. Pinned nodes snap to (fx, fy).
  const maxSpeed = params.maxSpeed;
  const damping = params.damping;
  const centering = params.centering * alpha;
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
    // Centering pull.
    node.vx -= node.x * centering;
    node.vy -= node.y * centering;
    // Damp.
    node.vx *= damping;
    node.vy *= damping;
    // Hard speed cap: no single step can fling a node away.
    const speed = Math.sqrt(node.vx * node.vx + node.vy * node.vy);
    if (speed > maxSpeed) {
      const s = maxSpeed / speed;
      node.vx *= s;
      node.vy *= s;
    }
    // Integrate.
    node.x += node.vx;
    node.y += node.vy;
    energy += node.vx * node.vx + node.vy * node.vy;
  }

  // 6. Collision pass: resolve overlaps in position space (not velocity, not
  // alpha-scaled), so nodes never overlap even after the graph has cooled.
  resolveCollisions(nodes, params.collision, params.collisionPadding);

  return energy;
}
