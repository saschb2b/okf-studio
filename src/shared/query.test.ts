import { NO_PROVENANCE } from "@/mock/conceptFixtures.ts";
import { describe, it, expect } from "vitest";
import { parseQuery, matchesCompiled } from "@/shared/query.ts";
import type { Concept } from "@/shared/types.ts";

function concept(partial: Partial<Concept>): Concept {
  return {
    id: "x",
    type: "Note",
    title: "",
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

const match = (q: string, c: Concept) => matchesCompiled(c, parseQuery(q));

describe("faceted query grammar", () => {
  it("matches everything on an empty query", () => {
    expect(match("", concept({}))).toBe(true);
    expect(match("   ", concept({}))).toBe(true);
  });

  it("filters by type, case-insensitively", () => {
    expect(match("type:Table", concept({ type: "Table" }))).toBe(true);
    expect(match("type:table", concept({ type: "Table" }))).toBe(true);
    expect(match("type:Table", concept({ type: "View" }))).toBe(false);
  });

  it("ORs repeated type terms", () => {
    const q = "type:Table type:View";
    expect(match(q, concept({ type: "Table" }))).toBe(true);
    expect(match(q, concept({ type: "View" }))).toBe(true);
    expect(match(q, concept({ type: "Metric" }))).toBe(false);
  });

  it("filters by tag", () => {
    expect(match("tag:revenue", concept({ tags: ["revenue", "sales"] }))).toBe(true);
    expect(match("tag:revenue", concept({ tags: ["sales"] }))).toBe(false);
  });

  it("compares connectivity numerically", () => {
    expect(match("degree>5", concept({ degree: 6 }))).toBe(true);
    expect(match("degree>5", concept({ degree: 5 }))).toBe(false);
    expect(match("citedBy=0", concept({ citedBy: [] }))).toBe(true);
    expect(match("citedBy=0", concept({ citedBy: ["a"] }))).toBe(false);
    expect(match("links<=2", concept({ links: ["a", "b"] }))).toBe(true);
    expect(match("links<=2", concept({ links: ["a", "b", "c"] }))).toBe(false);
  });

  it("supports is:orphan and has:broken predicates", () => {
    expect(match("is:orphan", concept({ degree: 0 }))).toBe(true);
    expect(match("is:orphan", concept({ degree: 2 }))).toBe(false);
    expect(match("has:broken", concept({ brokenLinks: ["gone.md"] }))).toBe(true);
    expect(match("has:broken", concept({ brokenLinks: [] }))).toBe(false);
  });

  it("ANDs bare full-text terms across fields", () => {
    const c = concept({ title: "Bitcoin ledger", body: "the immutable chain" });
    expect(match("bitcoin ledger", c)).toBe(true);
    expect(match("bitcoin missing", c)).toBe(false);
  });

  it("keeps quoted phrases whole", () => {
    const c = concept({ body: "a public dataset of transactions" });
    expect(match('"public dataset"', c)).toBe(true);
    expect(match('"public transactions"', c)).toBe(false);
  });

  it("combines fields with AND", () => {
    const q = "type:Table degree>5 revenue";
    expect(match(q, concept({ type: "Table", degree: 9, body: "revenue table" }))).toBe(true);
    expect(match(q, concept({ type: "Table", degree: 2, body: "revenue table" }))).toBe(false);
    expect(match(q, concept({ type: "View", degree: 9, body: "revenue table" }))).toBe(false);
  });

  it("falls back to full-text for unknown fields (tolerant)", () => {
    // `foo:bar` is not a known field → the value becomes a text needle.
    expect(match("foo:bar", concept({ body: "contains bar here" }))).toBe(true);
    expect(match("foo:bar", concept({ body: "nothing" }))).toBe(false);
  });
});
