import { describe, it, expect } from "vitest";
import {
  step,
  DEFAULT_PARAMS,
  ALPHA_DECAY,
  ALPHA_MIN,
  type SimNode,
  type SimEdge,
} from "./forceSim.ts";

function ring(n: number): SimNode[] {
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return {
      id: String(i),
      x: Math.cos(a) * 200,
      y: Math.sin(a) * 200,
      vx: 0,
      vy: 0,
      r: 8,
      fx: null,
      fy: null,
    };
  });
}

describe("forceSim", () => {
  it("cools to rest with bounded, finite positions (no explosion)", () => {
    const nodes = ring(40);
    const edges: SimEdge[] = [];
    for (let i = 1; i < 40; i++) edges.push({ a: 0, b: i }); // a hub
    for (let i = 1; i < 40; i++) edges.push({ a: i, b: (i % 39) + 1 }); // a ring

    let alpha = 1;
    let energy = Infinity;
    let ticks = 0;
    while (alpha > ALPHA_MIN && ticks < 5000) {
      energy = step(nodes, edges, DEFAULT_PARAMS, alpha);
      alpha += (0 - alpha) * ALPHA_DECAY;
      ticks++;
    }

    // The cooling schedule reaches rest in a few hundred ticks.
    expect(ticks).toBeLessThan(1000);
    // Settled: negligible residual kinetic energy.
    expect(energy).toBeLessThan(0.5);
    // Never flew off to infinity.
    for (const n of nodes) {
      expect(Number.isFinite(n.x)).toBe(true);
      expect(Number.isFinite(n.y)).toBe(true);
      expect(Math.hypot(n.x, n.y)).toBeLessThan(5000);
    }
  });

  it("respects the speed cap even with fully coincident nodes", () => {
    // Worst case: every node stacked on the origin → maximal repulsion spike.
    const nodes: SimNode[] = Array.from({ length: 20 }, (_, i) => ({
      id: String(i),
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      r: 8,
      fx: null,
      fy: null,
    }));
    step(nodes, [], DEFAULT_PARAMS, 1);
    for (const n of nodes) {
      expect(Math.hypot(n.vx, n.vy)).toBeLessThanOrEqual(DEFAULT_PARAMS.maxSpeed + 1e-6);
    }
  });
});
