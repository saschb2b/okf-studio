// The two things that make streamed text stop plopping: a reveal rate that is
// independent of arrival, and a settled/unsettled split that keeps parsed
// markdown from changing shape underneath the reader.

import { describe, expect, it } from "vitest";
import { nextRevealed, splitSettled, tailWords } from "./streamingText.ts";

describe("nextRevealed", () => {
  it("drains a burst over several frames instead of all at once", () => {
    // The plop, precisely: 600 characters landing in one paint. It should take
    // a good few frames to clear.
    let revealed = 0;
    let frames = 0;
    while (revealed < 600) {
      revealed = nextRevealed(revealed, 600);
      frames += 1;
    }
    expect(frames).toBeGreaterThan(8);
  });

  it("keeps moving when only one character is outstanding", () => {
    // Without a floor a slow trickle stalls and the caret looks frozen.
    expect(nextRevealed(10, 11)).toBe(11);
  });

  it("never overshoots the text it has", () => {
    expect(nextRevealed(99, 100)).toBe(100);
    expect(nextRevealed(100, 100)).toBe(100);
    expect(nextRevealed(120, 100)).toBe(100);
  });

  it("stays close behind a fast stream rather than falling further back", () => {
    // A fixed rate would lag further every frame on a fast model, which reads as
    // the UI being broken. The step scales with the backlog instead.
    let revealed = 0;
    for (let frame = 0; frame < 60; frame += 1) {
      revealed = nextRevealed(revealed, 100 + frame * 20);
    }
    const total = 100 + 59 * 20;
    expect(total - revealed).toBeLessThan(total * 0.35);
  });
});

describe("splitSettled", () => {
  it("settles complete blocks and leaves the growing paragraph as tail", () => {
    const { settled, tail } = splitSettled("# Title\n\nFirst para.\n\nSecond in prog");
    expect(settled).toBe("# Title\n\nFirst para.\n");
    expect(tail).toBe("Second in prog");
  });

  it("holds everything back until the first block closes", () => {
    // Nothing has closed, so nothing is safe to parse yet.
    const { settled, tail } = splitSettled("Still writing the first line");
    expect(settled).toBe("");
    expect(tail).toBe("Still writing the first line");
  });

  it("keeps an open code fence out of the settled half", () => {
    // The case that reflows the whole message when the fence finally closes:
    // markdown treats an unclosed ``` as swallowing everything after it.
    const { settled, tail } = splitSettled("Intro.\n\n```sql\nSELECT 1\n\nFROM t");
    expect(settled).toBe("Intro.\n");
    expect(tail).toContain("```sql");
    expect(tail).toContain("FROM t");
  });

  it("settles a closed fence", () => {
    const { settled } = splitSettled("```sql\nSELECT 1\n```\n\nAfter");
    expect(settled).toContain("SELECT 1");
    expect(settled).toContain("```");
  });

  it("does not treat a blank line inside a fence as a boundary", () => {
    const { settled } = splitSettled("```\na\n\nb\n```\n\nnext");
    // The blank line between a and b is code, not a block break.
    expect(settled).toContain("a\n\nb");
  });

  it("recombines to exactly the input, losing nothing at the seam", () => {
    // The invariant that matters: the split is a view, not an edit. A character
    // dropped at the boundary would silently vanish from the answer.
    //
    // The first draft of this asserted `joined === text || joined === `${text}``,
    // which compares the same value twice and therefore could never fail.
    for (const text of [
      "one\n\ntwo",
      "# h\n\nbody\n\n```js\nx\n```\n\nend",
      "no breaks at all",
      "trailing blank\n\n",
      "",
    ]) {
      const { settled, tail } = splitSettled(text);
      // The seam is one newline, because the split is on lines — but only when
      // there are lines on both sides. Text ending on a blank line settles
      // entirely and has no tail, so there is no seam to rejoin. Getting that
      // edge wrong is what the vacuous version could not tell me.
      const joined = settled === "" || tail === ""
        ? `${settled}${tail}`
        : `${settled}\n${tail}`;
      expect(joined).toBe(text);
    }
  });
});

describe("tailWords", () => {
  it("keeps whitespace so the tail lays out like the text it becomes", () => {
    // Dropping spaces would make the line reflow at the handover to markdown.
    expect(tailWords("two  words\nhere").join("")).toBe("two  words\nhere");
  });

  it("splits on words rather than characters", () => {
    // A per-character reveal reads as a novelty typewriter; a word is the unit
    // the eye fixates on.
    expect(tailWords("alpha beta")).toEqual(["alpha", " ", "beta"]);
  });

  it("is empty for an empty tail", () => {
    expect(tailWords("")).toEqual([]);
  });
});
