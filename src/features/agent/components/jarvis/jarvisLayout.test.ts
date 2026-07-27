// The field claims to draw the bundle's graph. These check that the claim is
// true: edges come from authored links, and position carries meaning.

import { describe, expect, it } from "vitest";
import { buildLayout, MAX_LAYOUT_NODES, SHELL_RADIUS } from "./jarvisLayout.ts";

function distance(a: { x: number; y: number; z: number }, b: typeof a): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

describe("buildLayout", () => {
  it("draws an edge for each authored link between laid-out concepts", () => {
    const layout = buildLayout([
      { id: "a", links: ["b", "c"] },
      { id: "b", links: ["c"] },
      { id: "c", links: [] },
    ]);
    expect(layout.edges).toHaveLength(3);
  });

  it("drops a link whose target is not in the graph", () => {
    // A broken link, or one to a concept past the node cap, has no line to draw.
    const layout = buildLayout([{ id: "a", links: ["missing"] }]);
    expect(layout.edges).toHaveLength(0);
  });

  it("ignores a self-link rather than drawing a degenerate edge", () => {
    const layout = buildLayout([{ id: "a", links: ["a"] }]);
    expect(layout.edges).toHaveLength(0);
  });

  it("pulls linked concepts closer than unlinked ones", () => {
    // The property that makes this a graph rather than a scatter: after the
    // simulation runs, structure is visible in the positions.
    const layout = buildLayout([
      { id: "a", links: ["b"] },
      { id: "b", links: ["a"] },
      { id: "lonely", links: [] },
    ]);
    for (let tick = 0; tick < 400; tick += 1) layout.step();

    const [a, b, lonely] = layout.nodes;
    expect(distance(a, b)).toBeLessThan(distance(a, lonely));
    expect(distance(a, b)).toBeLessThan(distance(b, lonely));
  });

  it("settles rather than flying apart", () => {
    const layout = buildLayout(
      Array.from({ length: 40 }, (_, index) => ({
        id: `c${index}`,
        links: index > 0 ? [`c${index - 1}`] : [],
      })),
    );
    for (let tick = 0; tick < 600; tick += 1) layout.step();

    // Every node stays in frame. Without centering and damping a force layout
    // drifts off camera and the field renders as an empty screen.
    for (const node of layout.nodes) {
      expect(Number.isFinite(node.x)).toBe(true);
      expect(Math.hypot(node.x, node.y, node.z)).toBeLessThan(60);
    }
  });

  it("is deterministic, so the same bundle always looks the same", () => {
    const concepts = [
      { id: "a", links: ["b"] },
      { id: "b", links: [] },
    ];
    const first = buildLayout(concepts);
    const second = buildLayout(concepts);
    for (let tick = 0; tick < 50; tick += 1) {
      first.step();
      second.step();
    }
    expect(first.nodes.map((n) => n.x)).toEqual(second.nodes.map((n) => n.x));
  });

  it("caps the node count so a large bundle cannot stall the frame", () => {
    const concepts = Array.from({ length: MAX_LAYOUT_NODES + 120 }, (_, i) => ({
      id: `c${i}`,
      links: [],
    }));
    expect(buildLayout(concepts).nodes).toHaveLength(MAX_LAYOUT_NODES);
  });
});

describe("the shell", () => {
  it("settles the graph onto a sphere rather than a blob", () => {
    // The property the reference look depends on: a ball with structure on its
    // surface, not a lumpy cloud. Without the shell force a plain force layout
    // settles into an irregular mass and stops reading as one object.
    const layout = buildLayout(
      Array.from({ length: 60 }, (_, index) => ({
        id: `c${index}`,
        links: index % 3 === 0 && index > 0 ? [`c${index - 3}`] : [],
      })),
    );
    for (let tick = 0; tick < 800; tick += 1) layout.step();

    const radii = layout.nodes.map((node) => Math.hypot(node.x, node.y, node.z));
    const mean = radii.reduce((total, radius) => total + radius, 0) / radii.length;
    expect(mean).toBeGreaterThan(SHELL_RADIUS * 0.6);

    // Tightly enough grouped to read as a shell. A blob spreads its radii wide.
    const spread = Math.max(...radii) - Math.min(...radii);
    expect(spread).toBeLessThan(SHELL_RADIUS);
  });
});
