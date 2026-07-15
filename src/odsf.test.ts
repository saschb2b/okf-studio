import { describe, it, expect } from "vitest";
import type { Bundle, Concept } from "@/types.ts";
import {
  buildTokenIndex,
  colorLuminance,
  conceptAppliesTo,
  conceptExamples,
  conceptStatus,
  conceptTokens,
  exampleKind,
  hasDesignArtifacts,
  isColorValue,
  prefersDarkInk,
  resolveTokenRefs,
  tokenVizKind,
} from "@/odsf.ts";

function concept(extra: Record<string, unknown>, type = "Color"): Concept {
  return {
    id: "foundations/x",
    type,
    title: "X",
    description: "",
    tags: [],
    timestamp: null,
    resource: null,
    extra,
    body: "",
    links: [],
    externalLinks: [],
    brokenLinks: [],
    citedBy: [],
    degree: 0,
  };
}

describe("conceptTokens", () => {
  it("returns the token groups when present", () => {
    const c = concept({ tokens: { colors: { primary: "#fff", accent: "#0969da" } } });
    expect(conceptTokens(c)).toEqual({ colors: { primary: "#fff", accent: "#0969da" } });
  });

  it("returns null when tokens is absent, empty, or not an object", () => {
    expect(conceptTokens(concept({}))).toBeNull();
    expect(conceptTokens(concept({ tokens: "" }))).toBeNull();
    expect(conceptTokens(concept({ tokens: {} }))).toBeNull();
    // A group that is not itself a map is dropped, leaving nothing.
    expect(conceptTokens(concept({ tokens: { junk: "scalar" } }))).toBeNull();
  });
});

describe("conceptExamples / status / appliesTo", () => {
  it("reads example asset lists, tolerating a scalar", () => {
    expect(conceptExamples(concept({ examples: ["/a.html", "/b.html"] }))).toEqual([
      "/a.html",
      "/b.html",
    ]);
    expect(conceptExamples(concept({ examples: "/one.html" }))).toEqual(["/one.html"]);
    expect(conceptExamples(concept({}))).toEqual([]);
  });

  it("reads status and applies_to", () => {
    expect(conceptStatus(concept({ status: "stable" }))).toBe("stable");
    expect(conceptStatus(concept({}))).toBeNull();
    expect(conceptAppliesTo(concept({ applies_to: ["web", "ios"] }))).toEqual(["web", "ios"]);
    expect(conceptAppliesTo(concept({ applies_to: "web" }))).toEqual(["web"]);
  });
});

describe("hasDesignArtifacts", () => {
  it("is true with tokens or examples, false otherwise", () => {
    expect(hasDesignArtifacts(concept({ tokens: { colors: { a: "#fff" } } }))).toBe(true);
    expect(hasDesignArtifacts(concept({ examples: ["/a.html"] }))).toBe(true);
    expect(hasDesignArtifacts(concept({}))).toBe(false);
  });
});

describe("buildTokenIndex + resolveTokenRefs", () => {
  const bundle = {
    concepts: [
      concept({ tokens: { colors: { primary: "#1f883d", "on-primary": "#ffffff" } } }),
      concept({
        tokens: {
          typography: { body: { fontFamily: "Inter", fontSize: "16px" } },
          radius: { medium: "6px" },
        },
      }),
    ],
  } as unknown as Bundle;

  it("flattens every concept's tokens into dotted leaf keys", () => {
    const index = buildTokenIndex(bundle);
    expect(index["colors.primary"]).toBe("#1f883d");
    expect(index["colors.on-primary"]).toBe("#ffffff");
    expect(index["typography.body.fontSize"]).toBe("16px");
    expect(index["radius.medium"]).toBe("6px");
  });

  it("resolves {group.name} references, leaving unknown ones verbatim", () => {
    const index = buildTokenIndex(bundle);
    expect(resolveTokenRefs("{colors.primary}", index)).toBe("#1f883d");
    expect(resolveTokenRefs("{spacing.sm} {radius.medium}", index)).toBe("{spacing.sm} 6px");
    expect(resolveTokenRefs("no refs here", index)).toBe("no refs here");
  });

  it("is empty for a null bundle", () => {
    expect(buildTokenIndex(null)).toEqual({});
  });
});

describe("tokenVizKind", () => {
  it("maps type to a visualization", () => {
    expect(tokenVizKind("Color")).toBe("color");
    expect(tokenVizKind("Typography")).toBe("typography");
    expect(tokenVizKind("Spacing")).toBe("spacing");
    expect(tokenVizKind("Shape")).toBe("shape");
    expect(tokenVizKind("Elevation")).toBe("elevation");
    expect(tokenVizKind("Motion")).toBe("motion");
    expect(tokenVizKind("Component")).toBe("table");
  });
});

describe("exampleKind", () => {
  it("classifies by suffix", () => {
    expect(exampleKind("components/button.example.html")).toBe("example");
    expect(exampleKind("guidelines/x.do.html")).toBe("do");
    expect(exampleKind("guidelines/x.dont.html")).toBe("dont");
  });
});

describe("color helpers", () => {
  it("detects color-shaped values", () => {
    expect(isColorValue("#1f883d")).toBe(true);
    expect(isColorValue("rgb(0,0,0)")).toBe(true);
    expect(isColorValue("oklch(0.7 0.1 200)")).toBe(true);
    expect(isColorValue("16px")).toBe(false);
  });

  it("computes luminance and ink preference", () => {
    expect(colorLuminance("#000000")).toBeCloseTo(0, 1);
    expect(colorLuminance("#ffffff")).toBeCloseTo(255, 1);
    expect(prefersDarkInk("#ffffff")).toBe(true); // light bg → dark ink
    expect(prefersDarkInk("#000000")).toBe(false); // dark bg → light ink
    expect(colorLuminance("#fff")).toBeCloseTo(255, 1); // 3-digit form
  });
});
