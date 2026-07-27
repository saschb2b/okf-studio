import { describe, expect, it } from "vitest";
import { mockConcept } from "@/mock/conceptFixtures.ts";
import {
  authoredAt,
  freshnessNotice,
  isCurrent,
  isStale,
  sourceSignals,
  tierRank,
  today,
  trustTier,
} from "@/features/bundle/trust.ts";

describe("trust tiers", () => {
  it("derives the tier from who confirmed it, not from what the bundle claims", () => {
    expect(trustTier(mockConcept())).toBe("unverified");
    expect(
      trustTier(mockConcept({
        verified: [{ by: "process:finance-nightly", at: "2026-06-26T02:00:00Z" }],
      })),
    ).toBe("machine-confirmed");
    // One human verifier is enough, however many processes also signed off.
    expect(
      trustTier(mockConcept({
        verified: [
          { by: "process:finance-nightly", at: "2026-06-26T02:00:00Z" },
          { by: "human:ahormati", at: "2026-06-25T09:00:00Z" },
        ],
      })),
    ).toBe("human-reviewed");
  });

  it("does not treat generated as confirmation", () => {
    // Authorship and confirmation are separate on purpose: an agent generated
    // it, a human or process later confirmed it. Collapsing the two loses the
    // only signal that distinguishes reviewed knowledge from generated.
    const generated = mockConcept({
      generated: { by: "reference_agent/gemini-2.5-pro", at: "2026-06-20T22:53:05Z" },
    });
    expect(trustTier(generated)).toBe("unverified");
  });

  it("orders tiers so a caller can prefer the more trusted of two", () => {
    expect(tierRank("human-reviewed")).toBeGreaterThan(tierRank("machine-confirmed"));
    expect(tierRank("machine-confirmed")).toBeGreaterThan(tierRank("unverified"));
  });
});

describe("authored at", () => {
  it("prefers generated.at and falls back to a v0.1 timestamp", () => {
    expect(authoredAt(mockConcept({ timestamp: "2026-01-15T10:00:00Z" })))
      .toBe("2026-01-15T10:00:00Z");
    expect(
      authoredAt(mockConcept({
        timestamp: "2026-01-15T10:00:00Z",
        generated: { by: "reference_agent/x", at: "2026-06-20T22:53:05Z" },
      })),
    ).toBe("2026-06-20T22:53:05Z");
    // `generated` without an `at` is provenance without a date, so the legacy
    // field is still the best answer available.
    expect(
      authoredAt(mockConcept({
        timestamp: "2026-01-15T10:00:00Z",
        generated: { by: "reference_agent/x", at: null },
      })),
    ).toBe("2026-01-15T10:00:00Z");
    expect(authoredAt(mockConcept())).toBeNull();
  });
});

describe("freshness", () => {
  it("goes stale on the day itself, not the day after", () => {
    const concept = mockConcept({ staleAfter: "2026-09-23" });
    expect(isStale(concept, "2026-09-22")).toBe(false);
    expect(isStale(concept, "2026-09-23")).toBe(true);
    expect(isStale(mockConcept(), "2099-01-01")).toBe(false);
  });

  it("reads today from the local calendar, not UTC", () => {
    // `stale_after` is a calendar date a person wrote, so "has that day
    // arrived?" should mean the reader's day rather than one that turns over
    // mid-afternoon west of UTC.
    const lateEvening = new Date(2026, 8, 23, 23, 30);
    expect(today(lateEvening)).toBe("2026-09-23");
  });

  it("says the one thing a reader needs, and prefers deprecation over staleness", () => {
    expect(freshnessNotice(mockConcept())).toBeNull();
    expect(freshnessNotice(mockConcept({ status: "draft" })))
      .toContain("Not yet reviewed");
    expect(freshnessNotice(mockConcept({ staleAfter: "2026-01-01" }), "2026-06-01"))
      .toContain("Stale since 2026-01-01");
    // A deprecated concept is not coming back; a stale one may be awaiting
    // review, so deprecation is the more useful thing to say.
    const both = mockConcept({ status: "deprecated", staleAfter: "2026-01-01" });
    expect(freshnessNotice(both, "2026-06-01")).toContain("Deprecated");
  });

  it("folds status and staleness into one usability answer", () => {
    expect(isCurrent(mockConcept(), "2026-06-01")).toBe(true);
    expect(isCurrent(mockConcept({ status: "draft" }), "2026-06-01")).toBe(true);
    expect(isCurrent(mockConcept({ status: "deprecated" }), "2026-06-01")).toBe(false);
    expect(isCurrent(mockConcept({ staleAfter: "2026-01-01" }), "2026-06-01")).toBe(false);
  });
});

describe("source credibility signals", () => {
  it("frames a usage count with its window", () => {
    const concept = mockConcept({
      usageWindow: { from: "2026-06-01", to: "2026-06-30" },
      sources: [{
        resource: "https://example.com/ga4",
        id: "ga4",
        title: "GA4 schema",
        author: "team/ga4-docs",
        usageCount: 5000,
        lastModified: "2026-05-30",
      }],
    });

    // Grouped through the same formatter the code uses, rather than a hardcoded
    // separator: the count is formatted in the reader's locale, so pinning a
    // comma would make this pass on one machine and fail on another.
    const grouped = new Intl.NumberFormat().format(5000);
    expect(sourceSignals(concept, concept.sources[0])).toEqual([
      "by team/ga4-docs",
      `used ${grouped}× (2026-06-01 to 2026-06-30)`,
      "source changed 2026-05-30",
    ]);
  });

  it("still reports a count with no window, because dropping the signal is worse", () => {
    const concept = mockConcept({
      sources: [{
        resource: "https://example.com/x",
        id: null,
        title: null,
        author: null,
        usageCount: 12,
        lastModified: null,
      }],
    });
    // The validator reports the missing window; the reader still shows what it has.
    expect(sourceSignals(concept, concept.sources[0])).toEqual(["used 12×"]);
  });

  it("has nothing to say about a source with no signals", () => {
    const concept = mockConcept({
      sources: [{
        resource: "all queries in BigQuery project X",
        id: null,
        title: null,
        author: null,
        usageCount: null,
        lastModified: null,
      }],
    });
    expect(sourceSignals(concept, concept.sources[0])).toEqual([]);
  });
});
