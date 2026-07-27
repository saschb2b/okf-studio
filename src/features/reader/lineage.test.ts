import { NO_PROVENANCE } from "@/mock/conceptFixtures.ts";
import { describe, it, expect } from "vitest";
import {
  explainedPathBetween,
  lineageSize,
  lineageTree,
  pathBetween,
  profileRelationFilterKey,
  unlinkedMentions,
} from "@/features/reader/lineage.ts";
import type { Bundle, Concept, ProfileReport } from "@/shared/types.ts";

function concept(partial: Partial<Concept> & { id: string }): Concept {
  return {
    type: "Note",
    title: partial.id,
    description: "",
    tags: [],
    timestamp: null,
    resource: null,
    extra: {},
    body: "",
    links: [],
    externalLinks: [],
    brokenLinks: [],
    citedBy: [],
    ...NO_PROVENANCE,
    degree: 0,
    ...partial,
  };
}

/** Build a bundle from concepts, deriving citedBy from links so both directions
 *  are consistent (as the real parser does). */
function bundleOf(concepts: Concept[]): Bundle {
  const byId = new Map(concepts.map((c) => [c.id, c]));
  for (const c of concepts) {
    for (const t of c.links) {
      const target = byId.get(t);
      if (target && !target.citedBy.includes(c.id)) target.citedBy.push(c.id);
    }
  }
  for (const c of concepts) c.degree = c.links.length + c.citedBy.length;
  return {
    root: "/b",
    name: "b",
    okfVersion: "0.1",
    odsfVersion: null,
    extra: {},
    concepts,
    indexes: [],
    log: [],
    issues: [],
    confidence: "confident",
  };
}

// a -> b -> c -> d  (a chain), plus a -> e
const chain = bundleOf([
  concept({ id: "a", links: ["b", "e"] }),
  concept({ id: "b", links: ["c"] }),
  concept({ id: "c", links: ["d"] }),
  concept({ id: "d" }),
  concept({ id: "e" }),
]);

function profileReport(
  edges: ProfileReport["edges"],
): ProfileReport {
  return {
    schemaVersion: 1,
    profiles: [],
    diagnostics: [],
    edges,
    truncated: false,
  };
}

describe("lineage trees", () => {
  it("walks upstream (dependencies) transitively", () => {
    const tree = lineageTree(chain, "a", "up");
    expect(tree?.id).toBe("a");
    // a's children are b and e; b -> c -> d
    const ids = (n: typeof tree): string[] =>
      n ? [n.id, ...n.children.flatMap(ids)] : [];
    expect(ids(tree).sort()).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("walks downstream (dependents) transitively", () => {
    // d is cited-by c, c by b, b by a → downstream of d is c,b,a
    const tree = lineageTree(chain, "d", "down");
    const ids = (n: typeof tree): string[] =>
      n ? [n.id, ...n.children.flatMap(ids)] : [];
    expect(ids(tree).sort()).toEqual(["a", "b", "c", "d"]);
  });

  it("is cycle-safe (each concept appears once)", () => {
    const cyclic = bundleOf([
      concept({ id: "x", links: ["y"] }),
      concept({ id: "y", links: ["x"] }),
    ]);
    const tree = lineageTree(cyclic, "x", "up");
    expect(lineageSize(tree)).toBe(2); // x and y, no infinite loop
    expect(tree?.children[0]?.children[0]).toMatchObject({
      id: "x",
      reference: "cycle",
    });
  });

  it("marks a diamond branch already expanded elsewhere", () => {
    const diamond = bundleOf([
      concept({ id: "a", links: ["b", "c"] }),
      concept({ id: "b", links: ["d"] }),
      concept({ id: "c", links: ["d"] }),
      concept({ id: "d" }),
    ]);
    const tree = lineageTree(diamond, "a", "up");
    expect(lineageSize(tree)).toBe(4);
    expect(tree?.children[1]?.children[0]).toMatchObject({
      id: "d",
      reference: "seen",
    });
  });

  it("respects the depth cap and marks truncation", () => {
    const tree = lineageTree(chain, "a", "up", 1);
    // depth 1: a -> {b, e}; b has an unshown child c → truncated
    const b = tree?.children.find((c) => c.id === "b");
    expect(b?.children).toHaveLength(0);
    expect(b?.truncated).toBe(true);
  });

  it("returns null for a missing root", () => {
    expect(lineageTree(chain, "nope", "up")).toBeNull();
  });

  it("states hub and global traversal limits instead of silently ending", () => {
    const hub = bundleOf([
      concept({ id: "root", links: ["a", "b", "c"] }),
      concept({ id: "a" }),
      concept({ id: "b" }),
      concept({ id: "c" }),
    ]);
    const hubTree = lineageTree(hub, "root", "up", undefined, { maxNeighbors: 2 });
    expect(hubTree).toMatchObject({
      truncated: true,
      truncationReason: "hub",
      omitted: 1,
    });
    expect(hubTree?.children).toHaveLength(2);

    const budgetTree = lineageTree(chain, "a", "up", undefined, { maxNodes: 2 });
    expect(budgetTree?.children[0]).toMatchObject({
      id: "b",
      truncated: true,
      truncationReason: "budget",
      omitted: 1,
    });
  });

  it("filters typed relationships and keeps missing targets explicit", () => {
    const report = profileReport([{
      sourceId: "a",
      targetId: "missing",
      namespace: "com.example.knowledge",
      type: "supports",
      label: "Supports",
      inverse: "Supported by",
      recognized: true,
      targetExists: false,
      portableLink: false,
    }]);
    const relation = profileRelationFilterKey(report.edges[0]);
    const tree = lineageTree(chain, "a", "up", undefined, { report, relation });
    expect(tree?.children).toEqual([
      expect.objectContaining({
        id: "missing",
        state: "missing",
        type: "",
      }),
    ]);
  });

  it("filters current and caution states without treating metadata as conformance", () => {
    const reliability = bundleOf([
      concept({ id: "root", links: ["current", "old"] }),
      concept({ id: "current", extra: { lifecycle: "active" } }),
      concept({ id: "old", extra: { lifecycle: "deprecated" } }),
    ]);
    const caution = lineageTree(reliability, "root", "up", undefined, {
      validity: "caution",
      asOfDay: "2026-07-23",
    });
    expect(caution?.children.map((node) => [node.id, node.state])).toEqual([
      ["old", "deprecated"],
    ]);
  });
});

describe("path between", () => {
  it("finds the shortest path over undirected links", () => {
    expect(pathBetween(chain, "a", "d")).toEqual(["a", "b", "c", "d"]);
    // undirected: d back up to a
    expect(pathBetween(chain, "d", "a")).toEqual(["d", "c", "b", "a"]);
  });

  it("returns a single-element path for identical endpoints", () => {
    expect(pathBetween(chain, "b", "b")).toEqual(["b"]);
  });

  it("returns null when disconnected", () => {
    const split = bundleOf([concept({ id: "p" }), concept({ id: "q" })]);
    expect(pathBetween(split, "p", "q")).toBeNull();
  });

  it("explains typed directed steps and preserves their labels", () => {
    const edge = (sourceId: string, targetId: string): ProfileReport["edges"][number] => ({
      sourceId,
      targetId,
      namespace: "com.example.knowledge",
      type: "supports",
      label: "Supports",
      inverse: "Supported by",
      recognized: true,
      targetExists: true,
      portableLink: true,
    });
    const report = profileReport([edge("a", "b"), edge("b", "c")]);
    const relation = profileRelationFilterKey(report.edges[0]);
    const path = explainedPathBetween(chain, "a", "c", "up", { report, relation });
    expect(path?.ids).toEqual(["a", "b", "c"]);
    expect(path?.steps).toEqual([
      expect.objectContaining({
        fromId: "a",
        toId: "b",
        direction: "up",
        relations: [expect.objectContaining({ label: "Supports" })],
      }),
      expect.objectContaining({
        fromId: "b",
        toId: "c",
        direction: "up",
        relations: [expect.objectContaining({ label: "Supports" })],
      }),
    ]);
  });

  it("honors direction and reports an exhausted path budget", () => {
    expect(explainedPathBetween(chain, "d", "a", "up")).toBeNull();
    expect(explainedPathBetween(chain, "d", "a", "down")?.ids)
      .toEqual(["d", "c", "b", "a"]);
    expect(explainedPathBetween(chain, "a", "d", "up", { maxNodes: 2 }))
      .toEqual({ ids: [], steps: [], visited: 2, truncated: true });
  });
});

describe("unlinked mentions", () => {
  it("finds titles named in text but not linked", () => {
    const b = bundleOf([
      concept({ id: "src", body: "This depends on the Ledger and the Wallet.", links: ["wallet"] }),
      concept({ id: "ledger", title: "Ledger" }),
      concept({ id: "wallet", title: "Wallet" }),
    ]);
    const src = b.concepts.find((c) => c.id === "src") ?? null;
    // Ledger is mentioned unlinked; Wallet is already linked → excluded.
    expect(unlinkedMentions(b, src)).toEqual(["ledger"]);
  });

  it("matches whole words only", () => {
    const b = bundleOf([
      concept({ id: "src", body: "We track Orders here." }),
      concept({ id: "order", title: "Order" }), // must NOT match "Orders"
    ]);
    const src = b.concepts.find((c) => c.id === "src") ?? null;
    expect(unlinkedMentions(b, src)).toEqual([]);
  });
});
