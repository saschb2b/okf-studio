// Retrieval's answer to OKF v0.2: mark and demote, never exclude.
//
// The spec states the rule outright for one case — "Consumers SHOULD surface,
// not silently drop, a failing attestation" (10.5) — and implies it for the
// rest by defining `deprecated` as "kept for links and history". A bundle keeps
// a deprecated concept precisely so its links still resolve, so a retriever
// that hid it would break the thing the status exists to preserve.
//
// The Rust engine is where ranking actually happens and it carries the matching
// tests. These cover the two things only the frontend can get wrong: keeping
// the browser mock's behaviour in step with the engine, and making sure the
// evaluation date is supplied at all.

import { describe, expect, it, vi } from "vitest";
import { mockConcept } from "@/mock/conceptFixtures.ts";
import { mockRetrieval } from "./mockRetrieval.ts";
import type { Bundle } from "@/shared/types.ts";
import type { RetrievalRequest } from "./types.ts";

function bundle(concepts: Bundle["concepts"]): Bundle {
  return {
    root: "/mock",
    name: "Mock",
    okfVersion: "0.2",
    odsfVersion: null,
    extra: {},
    concepts,
    indexes: [],
    log: [],
    issues: [],
    confidence: "confident",
  };
}

describe("freshness ranking in the browser mock", () => {
  it("demotes a deprecated concept without dropping it", () => {
    const result = mockRetrieval(
      bundle([
        mockConcept({
          id: "guides/a-deploy",
          title: "Deploying",
          body: "# Deploying\n\nRun the deploy pipeline.",
          status: "deprecated",
        }),
        mockConcept({
          id: "guides/b-deploy",
          title: "Deploying",
          body: "# Deploying\n\nRun the deploy pipeline.",
        }),
      ]),
      { query: "deploy pipeline", today: "2026-07-27" },
    );

    // Ids chosen so the deprecated one wins the alphabetical tiebreak; without
    // the demotion this ordering is the other way round.
    expect(result.receipt.candidates[0].conceptId).toBe("guides/b-deploy");
    // Still retrievable, which is the whole decision.
    expect(result.receipt.candidates.map((candidate) => candidate.conceptId)).toContain(
      "guides/a-deploy",
    );
  });

  it("keeps a deprecated concept first when the query names it", () => {
    const result = mockRetrieval(
      bundle([
        mockConcept({
          id: "metrics/legacy-revenue",
          title: "Legacy revenue",
          body: "# Legacy revenue\n\nThe retired definition.",
          status: "deprecated",
          staleAfter: "2020-01-01",
        }),
        mockConcept({
          id: "metrics/revenue",
          title: "Revenue",
          body: "# Revenue\n\nLegacy revenue is superseded by this.",
        }),
      ]),
      { query: "Legacy revenue", today: "2026-07-27" },
    );

    // The bound that stops demotion becoming exclusion: an exact title match
    // scores in the thousands, so a demotion in the tens cannot bury it.
    expect(result.receipt.candidates[0].conceptId).toBe("metrics/legacy-revenue");
    expect(result.receipt.candidates[0].score.freshness).toBeLessThan(0);
    expect(result.receipt.candidates[0].score.total).toBeGreaterThan(0);
  });

  it("judges nothing stale without an evaluation date", () => {
    const stale = mockConcept({
      id: "guides/deploy",
      title: "Deploying",
      body: "# Deploying\n\nRun the deploy pipeline.",
      staleAfter: "2020-01-01",
    });

    const dated = mockRetrieval(bundle([stale]), {
      query: "deploy pipeline",
      today: "2026-07-27",
    });
    const undated = mockRetrieval(bundle([stale]), { query: "deploy pipeline" });

    expect(dated.receipt.candidates[0].score.freshness).toBe(-10);
    expect(undated.receipt.candidates[0].score.freshness).toBe(0);
  });
});

describe("the evaluation date reaches the engine", () => {
  it("is defaulted by retrieveOkfContext so no call site has to remember it", async () => {
    // The failure this guards is silent: forget the date and staleness simply
    // stops being noticed, with every test still green. Defaulting at the one
    // door every caller passes through is what makes that unforgettable, so
    // that is what is pinned here rather than any individual call site.
    vi.resetModules();
    const captured: (string | undefined)[] = [];
    vi.doMock("@/features/agent/retrieval/mockRetrieval.ts", async () => {
      const actual = await vi.importActual<typeof import("./mockRetrieval.ts")>(
        "./mockRetrieval.ts",
      );
      return {
        ...actual,
        mockRetrieval: (bundleArg: Bundle, request: RetrievalRequest) => {
          captured.push(request.today);
          return actual.mockRetrieval(bundleArg, request);
        },
      };
    });

    const ipc = await import("@/shared/ipc.ts");
    await ipc.retrieveOkfContext("/mock/workspace/docs", { query: "revenue" });

    expect(captured).toHaveLength(1);
    expect(captured[0]).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    // A caller replaying a historical receipt can still pin its own date, or
    // the replay would silently re-judge staleness against today.
    await ipc.retrieveOkfContext("/mock/workspace/docs", {
      query: "revenue",
      today: "2020-01-01",
    });
    expect(captured[1]).toBe("2020-01-01");

    vi.doUnmock("@/features/agent/retrieval/mockRetrieval.ts");
    vi.resetModules();
  });
});
