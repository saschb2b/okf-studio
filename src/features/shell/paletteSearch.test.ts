import { describe, expect, it } from "vitest";

import { scoreFields, scoreQuery, scoreTerm, segment } from "@/features/shell/paletteSearch.ts";

/** Rank a set of candidates by the query, best first. */
function rank(candidates: string[], query: string): string[] {
  return candidates
    .map((value) => ({ value, hit: scoreQuery(value, query) }))
    .filter(({ hit }) => hit.score >= 0)
    .sort((a, b) => b.hit.score - a.hit.score)
    .map(({ value }) => value);
}

describe("scoreTerm", () => {
  it("ranks a prefix above a word start above a mid-word substring", () => {
    const prefix = scoreTerm("Graph View", "graph").score;
    const wordStart = scoreTerm("The Graph View", "graph").score;
    const midWord = scoreTerm("Subgraph", "graph").score;
    expect(prefix).toBeGreaterThan(wordStart);
    expect(wordStart).toBeGreaterThan(midWord);
  });

  it("prefers the shorter of two equally-positioned matches", () => {
    expect(scoreTerm("Graph", "graph").score).toBeGreaterThan(
      scoreTerm("Graph View Controls", "graph").score,
    );
  });

  it("matches an initialism as a subsequence", () => {
    const hit = scoreTerm("Graph View", "gv");
    expect(hit.score).toBeGreaterThan(0);
    expect(hit.positions).toEqual([0, 6]);
  });

  it("ranks an initialism on word boundaries above a scattered match", () => {
    // The bug this replaced: every subsequence hit scored `100 - length`, so
    // these two were separated only by the alphabetical tie-break.
    expect(rank(["Graph View", "Git Configuration Value"], "gv")[0]).toBe("Graph View");
  });

  it("rewards adjacent characters over scattered ones", () => {
    expect(scoreTerm("abcdef", "abc").score).toBeGreaterThan(scoreTerm("axbxcx", "abc").score);
  });

  it("rejects a term whose characters are out of order", () => {
    expect(scoreTerm("Graph View", "wv").score).toBe(-1);
  });

  it("does not tolerate a transposition", () => {
    // Documented gap rather than a silent one: this is the case a Levenshtein
    // scorer would catch, and the reason the concept names Fuse.js.
    expect(scoreTerm("agent", "agnet").score).toBe(-1);
  });

  it("scores an empty term as neutral", () => {
    expect(scoreTerm("anything", "").score).toBe(0);
  });
});

describe("scoreQuery", () => {
  it("requires every term to match", () => {
    expect(scoreQuery("Graph View", "graph view").score).toBeGreaterThan(0);
    expect(scoreQuery("Graph View", "graph missing").score).toBe(-1);
  });

  it("matches terms in any order, each anywhere in the string", () => {
    // "reader" comes second in the query and second-to-last in the title;
    // "prefs" is a subsequence of "Preferences" (p-r-e-f … s), which is the
    // abbreviation case the subsequence tier exists for.
    expect(scoreQuery("Concept Reader Preferences", "prefs reader").score).toBeGreaterThan(0);
    expect(scoreQuery("Concept Reader Preferences", "reader concept").score).toBeGreaterThan(0);
  });

  it("scores a query the same however its terms are ordered", () => {
    // Terms are scored independently and averaged, so "reader concept" finds
    // what "concept reader" finds. Someone recalling two words of a title
    // should not have to recall their order too.
    expect(scoreQuery("Concept Reader", "concept reader").score).toBe(
      scoreQuery("Concept Reader", "reader concept").score,
    );
  });

  it("collects the positions of every term", () => {
    const hit = scoreQuery("Graph View", "view graph");
    expect(hit.positions).toEqual([0, 1, 2, 3, 4, 6, 7, 8, 9]);
  });

  it("does not let a long query outrank a short one on term count alone", () => {
    // Scores are averaged across terms, so these stay comparable.
    const one = scoreQuery("Graph View", "graph").score;
    const two = scoreQuery("Graph View", "graph view").score;
    expect(Math.abs(one - two)).toBeLessThan(one);
  });
});

describe("scoreFields", () => {
  const fields = (title: string, body: string) => [
    { value: title, weight: 1, highlight: true },
    { value: body, weight: 0.4 },
  ];

  it("takes the best weighted field, not the sum", () => {
    const titleHit = scoreFields(fields("Graph View", ""), "graph");
    const bodyHit = scoreFields(fields("Something Else", "the graph view"), "graph");
    expect(titleHit.score).toBeGreaterThan(bodyHit.score);
  });

  it("only reports positions for a field marked for highlighting", () => {
    expect(scoreFields(fields("Graph View", ""), "graph").positions.length).toBeGreaterThan(0);
    expect(scoreFields(fields("Something Else", "the graph view"), "graph").positions).toEqual([]);
  });

  it("misses when no field matches", () => {
    expect(scoreFields(fields("Graph View", "body"), "zzz").score).toBe(-1);
  });
});

describe("segment", () => {
  it("splits a string into matched and unmatched runs", () => {
    expect(segment("Graph View", [0, 6])).toEqual([
      { text: "G", match: true },
      { text: "raph ", match: false },
      { text: "V", match: true },
      { text: "iew", match: false },
    ]);
  });

  it("returns one unmatched run when nothing matched", () => {
    expect(segment("Graph View", [])).toEqual([{ text: "Graph View", match: false }]);
  });

  it("keeps adjacent matches in one run", () => {
    expect(segment("Graph", [0, 1, 2, 3, 4])).toEqual([{ text: "Graph", match: true }]);
  });

  it("preserves the original text exactly", () => {
    const text = "Concept Reader — preferences";
    expect(
      segment(text, [0, 8, 9])
        .map((s) => s.text)
        .join(""),
    ).toBe(text);
  });
});
