import { describe, expect, it } from "vitest";
import { assessReliability, reliabilityFindings } from "@/shared/reliability.ts";
import type { Concept, ProfileReport } from "@/shared/types.ts";

function concept(id: string, extra: Record<string, unknown>): Concept {
  return {
    id,
    type: "Policy",
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

const report: ProfileReport = {
  schemaVersion: 1,
  profiles: [],
  diagnostics: [],
  edges: [
    {
      sourceId: "current",
      targetId: "old",
      namespace: "io.okf.reliability",
      type: "supersedes",
      label: "Supersedes",
      inverse: "superseded-by",
      recognized: true,
      targetExists: true,
      portableLink: true,
    },
    {
      sourceId: "old",
      targetId: "current",
      namespace: "io.okf.reliability",
      type: "supersedes",
      label: "Supersedes",
      inverse: "superseded-by",
      recognized: true,
      targetExists: true,
      portableLink: true,
    },
  ],
  truncated: false,
};

describe("reliability assessment", () => {
  it("derives qualified states without making missing metadata an error", () => {
    expect(assessReliability(concept("plain", {}), null, "2026-07-23")).toMatchObject({
      hasMetadata: false,
      state: "current",
      diagnostics: [],
    });
    expect(assessReliability(concept("old", {
      lifecycle: "active",
      confidence: 0.6,
      review_after: "2026-01-01",
    }), report, "2026-07-23")).toMatchObject({
      hasMetadata: true,
      state: "superseded",
      confidence: 0.6,
      supersededBy: ["current"],
      diagnostics: ["An active concept also declares a replacement."],
    });
    expect(assessReliability(
      concept("malformed", { confidence: { score: 0.8 } }),
      null,
      "2026-07-23",
    ).diagnostics).toContain("Confidence must be a number from 0 to 1.");
  });

  it("reports malformed ranges and supersession cycles as advisory findings", () => {
    const findings = reliabilityFindings([
      concept("old", {
        lifecycle: "superseded",
        confidence: 4,
        effective_from: "2027-01-01",
        effective_until: "2026-01-01",
      }),
      concept("current", {}),
    ], report, "2026-07-23");

    expect(findings.some((finding) => finding.message.includes("Confidence"))).toBe(true);
    expect(findings.some((finding) => finding.message.includes("effective_from"))).toBe(true);
    expect(findings).toContainEqual(expect.objectContaining({
      ruleId: "reliability.supersession-cycle",
      conceptIds: ["current", "old"],
    }));
  });
});
