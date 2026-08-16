import { describe, it, expect } from "vitest";
import { louvain, type CommunityEdge } from "@/features/viz/graph/community.ts";

describe("louvain community detection", () => {
  it("splits two cliques joined by a single bridge", () => {
    // {0,1,2} and {3,4,5} are triangles; one bridge edge 2–3.
    const edges: CommunityEdge[] = [
      { a: 0, b: 1 },
      { a: 1, b: 2 },
      { a: 0, b: 2 },
      { a: 3, b: 4 },
      { a: 4, b: 5 },
      { a: 3, b: 5 },
      { a: 2, b: 3 }, // bridge
    ];
    const comm = louvain(6, edges);
    expect(comm[0]).toBe(comm[1]);
    expect(comm[1]).toBe(comm[2]);
    expect(comm[3]).toBe(comm[4]);
    expect(comm[4]).toBe(comm[5]);
    expect(comm[0]).not.toBe(comm[3]); // the two cliques are different communities
  });

  it("is deterministic and dense (0..k-1, largest first)", () => {
    const edges: CommunityEdge[] = [
      { a: 0, b: 1 },
      { a: 1, b: 2 },
      { a: 0, b: 2 },
      { a: 3, b: 4 },
    ];
    const a = louvain(5, edges);
    // louvain walks a Map, so a shift in iteration order would move a node
    // between communities. Naming the assignment is what catches that.
    expect(a).toEqual([0, 0, 0, 1, 1]);
    const max = Math.max(...a);
    expect(new Set(a).size).toBe(max + 1); // dense indices
    expect(a[0]).toBe(0); // largest community (the triangle) is index 0
  });

  it("gives every node its own community when there are no edges", () => {
    const comm = louvain(4, []);
    expect(new Set(comm).size).toBe(4);
  });
});
