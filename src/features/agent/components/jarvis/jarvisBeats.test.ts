// The one property that makes the stage worth watching: every panel maps to
// something the turn actually did. These pin that, not the choreography.

import { describe, expect, it } from "vitest";
import { mockRetrieval } from "@/features/agent/retrieval/mockRetrieval.ts";
import { MOCK_BUNDLE } from "@/mock/fixture.ts";
import { beatsFor, MAX_STAGE_PANELS, sequenceDurationMs } from "./jarvisBeats.ts";

function stage(query: string) {
  return beatsFor(mockRetrieval(MOCK_BUNDLE, { query, contextBudgetTokens: 4096 }));
}

describe("beatsFor", () => {
  it("opens on the question and the route it was classified into", () => {
    const beats = stage("recognized revenue");
    expect(beats[0].kind).toBe("question");
    expect(beats[0].kind === "question" && beats[0].query).toBe("recognized revenue");
  });

  it("stages one excerpt per evidence item — no more, no fewer", () => {
    const result = mockRetrieval(MOCK_BUNDLE, {
      query: "recognized revenue",
      contextBudgetTokens: 4096,
    });
    const excerpts = beatsFor(result).filter((beat) => beat.kind === "excerpt");
    // Padding a quiet turn would make the stage overstate what the agent read.
    expect(excerpts.length).toBe(result.evidence.items.length);
  });

  it("lets a turn that found nothing look like a turn that found nothing", () => {
    // One opaque token on purpose. A phrase like "no such term anywhere" is not
    // a non-match: it tokenizes into ordinary English words that hit real prose,
    // which is what the first draft of this test got wrong.
    const beats = stage("qqxzzyv");
    expect(beats.every((beat) => beat.kind !== "excerpt")).toBe(true);
    // Still opens on the question, so the stage never renders empty.
    expect(beats[0].kind).toBe("question");
  });

  it("bounds the stage and says how much it withheld", () => {
    // Built by widening a real receipt rather than by picking a query broad
    // enough to overflow. The cap is a property of `beatsFor`, not of how big
    // the mock bundle happens to be — and a test that depended on the fixture's
    // size would quietly stop exercising this the moment the fixture changed.
    const base = mockRetrieval(MOCK_BUNDLE, { query: "revenue", contextBudgetTokens: 4096 });
    const wide = {
      ...base,
      receipt: {
        ...base.receipt,
        candidates: Array.from({ length: 40 }, (_, index) => ({
          ...base.receipt.candidates[0],
          sectionId: `wide-${index}`,
          included: false,
        })),
      },
    };

    const beats = beatsFor(wide);
    expect(beats.length).toBe(MAX_STAGE_PANELS);
    const last = beats[beats.length - 1];
    // Silent truncation would be the stage under-reporting the turn.
    expect(last.kind).toBe("more");
    expect(last.kind === "more" ? last.hidden : 0).toBeGreaterThan(0);
  });

  it("is stable for the same receipt, so a replay looks identical", () => {
    expect(stage("recognized revenue")).toEqual(stage("recognized revenue"));
  });

  it("keeps the whole sequence watchable rather than endless", () => {
    // A stage nobody sits through is a stage nobody sees.
    expect(sequenceDurationMs(stage("the"))).toBeLessThan(12_000);
  });
});
