import { NO_PROVENANCE } from "@/mock/conceptFixtures.ts";
import { describe, expect, it } from "vitest";
import {
  buildVizTree,
  conceptWeight,
  findVizNode,
  vizPath,
} from "@/features/viz/hierarchy.ts";
import type { Bundle, Concept } from "@/shared/types.ts";

function concept(id: string, over: Partial<Concept> = {}): Concept {
  return {
    id,
    type: "note",
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
    ...over,
  };
}

function bundle(concepts: Concept[], over: Partial<Bundle> = {}): Bundle {
  return {
    root: "/b",
    name: "Test Bundle",
    okfVersion: "0.1",
    odsfVersion: null,
    concepts,
    indexes: [],
    log: [],
    issues: [],
    confidence: "confident",
    ...over,
    extra: over.extra ?? {},
  };
}

describe("buildVizTree", () => {
  it("nests concepts under directories derived from id path segments", () => {
    const b = bundle([
      concept("design/color", { title: "Color" }),
      concept("design/tokens/spacing", { title: "Spacing" }),
      concept("overview", { title: "Overview" }),
    ]);
    const root = buildVizTree(b, b.concepts);
    expect(root.name).toBe("Test Bundle");
    const design = findVizNode(root, "design");
    expect(design?.children?.map((c) => c.id)).toEqual([
      "design/tokens",
      "design/color",
    ]);
    expect(findVizNode(root, "design/tokens/spacing")?.name).toBe("Spacing");
    // Root-level concept sits directly under the root.
    expect(root.children?.some((c) => c.id === "overview")).toBe(true);
  });

  it("labels directories from index titles, falling back to the segment", () => {
    const b = bundle([concept("design/color"), concept("misc-notes/one")], {
      indexes: [
        { dir: "design", title: "Design System", intro: "", synthesized: false, sections: [] },
      ],
    });
    const root = buildVizTree(b, b.concepts);
    expect(findVizNode(root, "design")?.name).toBe("Design System");
    expect(findVizNode(root, "misc-notes")?.name).toBe("Misc notes");
  });

  it("groups direct concepts under authored index sections", () => {
    const b = bundle(
      [
        concept("features/reader", { title: "Reader" }),
        concept("features/search", { title: "Search" }),
        concept("features/agent", { title: "Agent" }),
        concept("features/nested/detail", { title: "Nested detail" }),
      ],
      {
        indexes: [
          {
            dir: "features",
            title: "Features",
            intro: "",
            synthesized: false,
            sections: [
              {
                heading: "Explore",
                entries: [
                  { title: "Reader", target: "features/reader", description: "", kind: "concept" },
                  { title: "Search", target: "features/search", description: "", kind: "concept" },
                  {
                    title: "Nested detail",
                    target: "features/nested/detail",
                    description: "",
                    kind: "concept",
                  },
                ],
              },
              {
                heading: "Agent work",
                entries: [
                  { title: "Agent", target: "features/agent", description: "", kind: "concept" },
                ],
              },
            ],
          },
        ],
      },
    );

    const root = buildVizTree(b, b.concepts);
    const features = findVizNode(root, "features");
    const explore = features?.children?.find((child) => child.name === "Explore");

    expect(explore?.children?.map((child) => child.id)).toEqual([
      "features/reader",
      "features/search",
    ]);
    expect(features?.children?.some((child) => child.id === "features/nested")).toBe(true);
    expect(features?.children?.some((child) => child.id === "features/agent")).toBe(true);
  });

  it("does not repeat an index title as a child generation", () => {
    const b = bundle(
      [
        concept("features/reader", { title: "Reader" }),
        concept("features/search", { title: "Search" }),
      ],
      {
        indexes: [
          {
            dir: "features",
            title: "Features",
            intro: "",
            synthesized: false,
            sections: [
              {
                heading: "  FEATURES ",
                entries: [
                  { title: "Reader", target: "features/reader", description: "", kind: "concept" },
                  { title: "Search", target: "features/search", description: "", kind: "concept" },
                ],
              },
            ],
          },
        ],
      },
    );

    const features = findVizNode(buildVizTree(b, b.concepts), "features");

    expect(features?.children?.map((child) => child.id)).toEqual([
      "features/reader",
      "features/search",
    ]);
    expect(features?.children?.some((child) => child.name === "Features")).toBe(false);
  });

  it("weights leaves by body word count with a floor of 1", () => {
    expect(conceptWeight(concept("a", { body: "" }))).toBe(1);
    expect(conceptWeight(concept("a", { body: "three little words" }))).toBe(3);
    const b = bundle([concept("a", { body: "one two" })]);
    const root = buildVizTree(b, b.concepts);
    expect(root.children?.[0].value).toBe(2);
    expect(root.children?.[0].children).toBeUndefined();
  });

  it("sorts groups before leaves, each alphabetically", () => {
    const b = bundle([
      concept("zeta", { title: "Zeta" }),
      concept("alpha", { title: "Alpha" }),
      concept("group/x", { title: "X" }),
    ]);
    const root = buildVizTree(b, b.concepts);
    expect(root.children?.map((c) => c.id)).toEqual(["group", "alpha", "zeta"]);
  });

  it("builds an empty root for no concepts", () => {
    const root = buildVizTree(bundle([]), []);
    expect(root.children).toEqual([]);
  });
});

describe("vizPath", () => {
  it("returns the ancestor chain for breadcrumbs", () => {
    const b = bundle([concept("a/b/c", { title: "C" })]);
    const root = buildVizTree(b, b.concepts);
    expect(vizPath(root, "a/b/c")?.map((n) => n.id)).toEqual(["", "a", "a/b", "a/b/c"]);
    expect(vizPath(root, "missing")).toBeNull();
  });
});
