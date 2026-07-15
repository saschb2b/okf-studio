import { describe, it, expect } from "vitest";
import { lineageTree, pathBetween, unlinkedMentions, lineageSize } from "@/data/lineage.ts";
import type { Bundle, Concept } from "@/types.ts";

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
