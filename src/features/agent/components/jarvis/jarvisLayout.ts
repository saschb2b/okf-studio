// A 3D force-directed layout of the bundle's concept graph.
//
// The first version of the field scattered points by hashing the concept id,
// which is a starfield wearing a graph's name: no edge was drawn and no
// position meant anything. This lays the real graph out from the real links, so
// hubs sit central, clusters hold together, and an isolated concept looks
// isolated.
//
// Stepped rather than solved: the caller advances it a few ticks per frame, so
// the graph visibly assembles while the sweep plays instead of blocking the
// first paint on a settled layout.
//
// Constrained to a spherical shell rather than left free. A pure force layout
// settles into a lumpy blob; holding the nodes near one radius makes the graph
// read as a globe with structure on its surface, which is the shape that reads
// as a brain rather than as scattered debris. Links still pull neighbours
// together, so clusters form *on* the shell instead of collapsing inward.

export interface LayoutNode {
  id: string;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
}

export interface LayoutEdge {
  source: number;
  target: number;
}

export interface GraphLayout {
  nodes: LayoutNode[];
  edges: LayoutEdge[];
  indexById: Map<string, number>;
  step: () => void;
}

/** Beyond this the O(n²) repulsion stops being free. Bundles this large are
 *  rare, and the field is a backdrop rather than an analysis surface. */
export const MAX_LAYOUT_NODES = 420;

const REPULSION = 4.6;
const SPRING = 0.02;
const SPRING_LENGTH = 1.6;
const DAMPING = 0.8;
/** How hard a node is held to the shell. Strong enough to hold the sphere,
 *  weak enough that a dense cluster can still dimple it. */
const SHELL = 0.055;
/** The shell radius the graph settles onto. */
export const SHELL_RADIUS = 8.4;

/** Deterministic 0..1, so the same bundle always settles the same way. A random
 *  seed would make every turn's field unrecognizable from the last. */
function seeded(text: string, salt: number): number {
  let hash = salt * 2654435761;
  for (let index = 0; index < text.length; index += 1) {
    hash = Math.imul(hash ^ text.charCodeAt(index), 2246822519);
    hash = (hash << 13) | (hash >>> 19);
  }
  return ((hash >>> 0) % 100000) / 100000;
}

export function buildLayout(
  concepts: readonly { id: string; links?: readonly string[] }[],
  seedRadius = 7,
): GraphLayout {
  const used = concepts.slice(0, MAX_LAYOUT_NODES);
  const indexById = new Map<string, number>();
  used.forEach((concept, index) => indexById.set(concept.id, index));

  const nodes: LayoutNode[] = used.map((concept) => {
    // Seeded on a sphere shell, then pulled into shape by the forces below.
    const theta = seeded(concept.id, 1) * Math.PI * 2;
    const phi = Math.acos(2 * seeded(concept.id, 2) - 1);
    const radius = seedRadius * (0.6 + seeded(concept.id, 3) * 0.6);
    return {
      id: concept.id,
      x: radius * Math.sin(phi) * Math.cos(theta),
      y: radius * Math.sin(phi) * Math.sin(theta),
      z: radius * Math.cos(phi),
      vx: 0,
      vy: 0,
      vz: 0,
    };
  });

  // Only edges whose both ends are laid out. A link to a concept outside the
  // cap, or a broken link, has no line to draw.
  const edges: LayoutEdge[] = [];
  for (const concept of used) {
    const source = indexById.get(concept.id);
    if (source === undefined) continue;
    for (const target of concept.links ?? []) {
      const targetIndex = indexById.get(target);
      if (targetIndex === undefined || targetIndex === source) continue;
      edges.push({ source, target: targetIndex });
    }
  }

  const step = () => {
    // Repulsion. O(n²), which is why the node count is capped.
    for (let a = 0; a < nodes.length; a += 1) {
      const left = nodes[a];
      for (let b = a + 1; b < nodes.length; b += 1) {
        const right = nodes[b];
        const dx = left.x - right.x;
        const dy = left.y - right.y;
        const dz = left.z - right.z;
        const distanceSquared = dx * dx + dy * dy + dz * dz || 0.01;
        const distance = Math.sqrt(distanceSquared);
        const force = REPULSION / distanceSquared;
        const nx = (dx / distance) * force;
        const ny = (dy / distance) * force;
        const nz = (dz / distance) * force;
        left.vx += nx;
        left.vy += ny;
        left.vz += nz;
        right.vx -= nx;
        right.vy -= ny;
        right.vz -= nz;
      }
    }

    // Springs along real links. This is what turns a cloud into a graph.
    for (const edge of edges) {
      const source = nodes[edge.source];
      const target = nodes[edge.target];
      const dx = target.x - source.x;
      const dy = target.y - source.y;
      const dz = target.z - source.z;
      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz) || 0.01;
      const force = (distance - SPRING_LENGTH) * SPRING;
      const nx = (dx / distance) * force;
      const ny = (dy / distance) * force;
      const nz = (dz / distance) * force;
      source.vx += nx;
      source.vy += ny;
      source.vz += nz;
      target.vx -= nx;
      target.vy -= ny;
      target.vz -= nz;
    }

    // Hold every node near the shell. This is what turns the layout from a blob
    // into a globe, and it also keeps the graph in frame without a separate
    // centering force pulling everything into a knot at the origin.
    for (const node of nodes) {
      const radius = Math.sqrt(node.x * node.x + node.y * node.y + node.z * node.z) || 0.01;
      const pull = (SHELL_RADIUS - radius) * SHELL;
      node.vx += (node.x / radius) * pull;
      node.vy += (node.y / radius) * pull;
      node.vz += (node.z / radius) * pull;
      node.vx *= DAMPING;
      node.vy *= DAMPING;
      node.vz *= DAMPING;
      node.x += node.vx;
      node.y += node.vy;
      node.z += node.vz;
    }
  };

  return { nodes, edges, indexById, step };
}
