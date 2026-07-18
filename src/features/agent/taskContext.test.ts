import { describe, expect, it } from "vitest";
import {
  acceptOkfContextPlan,
  bundleContextFingerprint,
  createOkfContextPlan,
  taskScopeChangeRequiresConfirmation,
} from "@/features/agent/taskContext.ts";

const concepts = [
  { id: "product/overview", title: "Overview", type: "Product" },
  { id: "features/search", title: "Search", type: "Feature" },
];

describe("OKF task context", () => {
  it("builds the same bounded plan independent of input order", () => {
    const input = {
      taskId: "okf-enrich" as const,
      bundleRoot: "C:\\knowledge\\docs",
      concepts,
      activeConcept: { id: "features/search", title: "Search" },
      attachedConcepts: [concepts[0]],
      sources: [{ id: "source-1", title: "Brief", content: "Evidence" }],
      issues: [{ conceptId: "features/search", level: "warning" as const, message: "Missing link" }],
    };
    const first = createOkfContextPlan(input);
    const second = createOkfContextPlan({
      ...input,
      concepts: [...concepts].reverse(),
      attachedConcepts: [...input.attachedConcepts].reverse(),
    });

    expect(second).toEqual(first);
    expect(first.objects.map((object) => object.path)).toEqual([
      "features/search.md",
      "product/overview.md",
    ]);
    expect(first.capabilityIds).toEqual(["okf-inspect", "okf-enrich"]);
    expect(acceptOkfContextPlan(first)).toMatchObject({ accepted: true });
  });

  it("adds the active concept neighborhood before optional evidence bodies", () => {
    const graphConcepts = [
      { ...concepts[0], links: ["features/search"], body: "Overview body" },
      { ...concepts[1], links: [], body: "Search body" },
    ];
    const plan = createOkfContextPlan({
      taskId: "okf-change-impact",
      bundleRoot: "C:\\knowledge\\docs",
      concepts: graphConcepts,
      activeConcept: { id: "features/search", title: "Search" },
      attachedConcepts: [],
      sources: [],
      issues: [],
    });

    expect(plan.objects.map(({ id, reason }) => ({ id, reason }))).toEqual([
      { id: "features/search", reason: "active-concept" },
      { id: "product/overview", reason: "graph-neighbor" },
    ]);
    expect(plan.budget.selectedBytes).toBeGreaterThan("Overview body".length);
  });

  it("omits optional content deterministically and explains why", () => {
    const plan = createOkfContextPlan({
      taskId: "okf-research",
      bundleRoot: "C:\\knowledge\\docs",
      concepts,
      activeConcept: { id: "features/search", title: "Search" },
      attachedConcepts: [],
      sources: [{ id: "large", title: "Large source", content: "x".repeat(100) }],
      issues: [],
      maxBytes: 50,
      removedIds: new Set(["bundle-object:features/search"]),
    });

    expect(plan.objects).toEqual([]);
    expect(plan.sources).toEqual([]);
    expect(plan.omissions).toEqual([
      { kind: "bundle-object", id: "features/search", reason: "removed-by-user" },
      { kind: "source", id: "large", reason: "budget-exceeded" },
    ]);
  });

  it("changes fingerprint with bundle state and gates wider task scope", () => {
    const first = bundleContextFingerprint("C:\\knowledge\\docs", concepts, []);
    const changed = bundleContextFingerprint("C:\\knowledge\\docs", [
      ...concepts,
      { id: "new", title: "New", type: "Concept" },
    ], []);
    expect(changed).not.toBe(first);
    expect(bundleContextFingerprint("C:\\knowledge\\docs", [
      { ...concepts[0], body: "changed" },
      concepts[1],
    ], [])).not.toBe(first);
    expect(taskScopeChangeRequiresConfirmation("okf-audit", "okf-research")).toBe(true);
    expect(taskScopeChangeRequiresConfirmation("okf-enrich", "okf-audit")).toBe(true);
    expect(taskScopeChangeRequiresConfirmation("okf-audit", "okf-audit")).toBe(false);
  });
});
