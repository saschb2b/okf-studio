import { describe, expect, it } from "vitest";
import type { Bundle, Concept } from "@/shared/types.ts";
import { conceptNeedsInteropReport } from "./interop.ts";

function concept(id: string, extra: Record<string, unknown> = {}): Concept {
  return {
    id,
    type: "Guide",
    title: id,
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

function bundle(concepts: Concept[]): Bundle {
  return {
    root: "/bundle",
    name: "Test bundle",
    okfVersion: "0.1",
    odsfVersion: null,
    confidence: "confident",
    extra: {},
    concepts,
    indexes: [],
    log: [],
    issues: [],
  };
}

describe("conceptNeedsInteropReport", () => {
  it("keeps ordinary concepts and folder routes off the full bundle report", () => {
    const ordinary = concept("guides/start");
    const ordinaryBundle = bundle([ordinary]);

    expect(conceptNeedsInteropReport(null, ordinaryBundle)).toBe(false);
    expect(conceptNeedsInteropReport(ordinary, ordinaryBundle)).toBe(false);
  });

  it("loads the report for a concept with contextual extensions", () => {
    const extended = concept("guides/start", {
      language: "en",
      sidecars: { "assets/guide.pdf": { media_type: "application/pdf" } },
    });

    expect(conceptNeedsInteropReport(extended, bundle([extended]))).toBe(true);
  });

  it("loads the report for the base concept of a translated sibling", () => {
    const base = concept("guides/start");
    const translated = concept("guides/start.de");
    const translatedBundle = bundle([base, translated]);

    expect(conceptNeedsInteropReport(base, translatedBundle)).toBe(true);
  });
});
