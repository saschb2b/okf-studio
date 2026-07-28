import { describe, it, expect } from "vitest";
import {
  blockStepBetween,
  boldPrefix,
  buildReadingStream,
  clampWpm,
  durationFor,
  nextSentence,
  pivotIndex,
  previousSentence,
  remainingMs,
  sentenceContext,
  stepOfToken,
  tokenAfterBlock,
  tokenAtStep,
  WPM_DEFAULT,
} from "@/features/reader/speedread.ts";

const texts = (md: string, chunk?: 1 | 2) =>
  buildReadingStream(md, chunk ? { chunk } : {}).tokens.map((t) => t.text);

describe("pivotIndex", () => {
  it("moves the pivot right as the word grows, at the documented boundaries", () => {
    expect(pivotIndex("a")).toBe(0);
    expect(pivotIndex("to")).toBe(1); // 2–5
    expect(pivotIndex("water")).toBe(1);
    expect(pivotIndex("bundle")).toBe(2); // 6–9
    expect(pivotIndex("concepts")).toBe(2);
    expect(pivotIndex("javascript")).toBe(3); // 10–13
    expect(pivotIndex("relationship")).toBe(3);
    expect(pivotIndex("interoperability")).toBe(4); // 14+
  });

  it("never points past the end of a word", () => {
    for (const w of ["a", "an", "the", "four", "fives"]) {
      expect(pivotIndex(w)).toBeLessThan(w.length);
    }
  });
});

describe("buildReadingStream", () => {
  it("returns an empty stream for an empty body", () => {
    const empty = { blocks: [], tokens: [], steps: [], words: 0 };
    expect(buildReadingStream("")).toEqual(empty);
    expect(buildReadingStream("   \n\n  ")).toEqual(empty);
  });

  it("tokenizes prose and strips markdown down to readable words", () => {
    expect(texts("Renders an **interactive** [graph](graph-view.md) of `concepts`.")).toEqual([
      "Renders",
      "an",
      "interactive",
      "graph",
      "of",
      "concepts.",
    ]);
  });

  it("keeps a code fence, table, equation, and diagram whole and marked pause", () => {
    const md =
      "Before.\n\n" +
      "```ts\nconst x = 1;\n```\n\n" +
      "| a | b |\n| --- | --- |\n| 1 | 2 |\n\n" +
      "$$\nE = mc^2\n$$\n\n" +
      "```mermaid\nflowchart LR\n  A --> B\n```\n\n" +
      "After.";
    const stream = buildReadingStream(md);
    expect(stream.blocks.map((b) => b.kind)).toEqual([
      "paragraph",
      "code",
      "table",
      "math",
      "mermaid",
      "paragraph",
    ]);
    for (const block of stream.blocks) {
      expect(block.pause).toBe(!block.text);
    }
    // The source survives verbatim, so the block can render as itself.
    expect(stream.blocks[1].source).toContain("const x = 1;");
    expect(stream.blocks[2].source).toContain("| 1 | 2 |");
    // Nothing from a paused block leaks into the word stream.
    expect(stream.tokens.map((t) => t.text)).toEqual(["Before.", "After."]);
    expect(stream.words).toBe(2);
  });

  it("skips a paused block by landing on the next block's first token", () => {
    const stream = buildReadingStream("Before.\n\n```ts\nconst x = 1;\n```\n\nAfter it.");
    expect(tokenAfterBlock(stream, 1)).toBe(1);
    expect(stream.tokens[1].text).toBe("After");
    // Past the last block there is nowhere to land but the end.
    expect(tokenAfterBlock(stream, 2)).toBe(stream.tokens.length);
  });

  it("interleaves words and paused blocks into one cursor space", () => {
    const stream = buildReadingStream("Before.\n\n```ts\nconst x = 1;\n```\n\nAfter it.");
    expect(stream.steps).toEqual([
      { kind: "word", token: 0 },
      { kind: "block", block: 1 },
      { kind: "word", token: 1 },
      { kind: "word", token: 2 },
    ]);
    // Round-trips: a token knows its step, a step knows its token.
    expect(stepOfToken(stream, 1)).toBe(2);
    expect(tokenAtStep(stream, 2)?.text).toBe("After");
    expect(tokenAtStep(stream, 1)).toBeNull();
    expect(stream.blocks[1].step).toBe(1);
  });

  it("counts sentences across blocks, and closes one at every block end", () => {
    const stream = buildReadingStream("One. Two.\n\nA heading\n\nThird here");
    const bySentence = stream.tokens.map((t) => `${t.sentenceIndex}:${t.text}`);
    expect(bySentence).toEqual([
      "0:One.",
      "1:Two.",
      "2:A",
      "2:heading",
      "3:Third",
      "3:here",
    ]);
  });

  it("does not end a sentence on a common abbreviation", () => {
    const stream = buildReadingStream("Formats e.g. JSON and CSV.");
    expect(stream.tokens.map((t) => t.endsSentence)).toEqual([false, false, false, false, true]);
  });

  it("records character offsets that address the word in its block text", () => {
    const stream = buildReadingStream("Alpha beta gamma.");
    const block = stream.blocks[0];
    for (const t of stream.tokens) {
      expect(block.text.slice(t.start, t.end)).toBe(t.text);
    }
  });
});

describe("dwell weights", () => {
  const weightOf = (md: string, i = 0) => buildReadingStream(md).tokens[i].weight;

  it("gives a long word more time than a short one", () => {
    expect(weightOf("interoperability stands", 0)).toBeGreaterThan(weightOf("cat stands", 0));
  });

  it("rests longer at a sentence end than at a comma, and longer still at a block end", () => {
    // Same word in each case, and never the first of its block, so only the
    // punctuation and end-of-block rules are being compared.
    const comma = weightOf("alpha beta, gamma delta beta.", 1);
    const sentence = weightOf("alpha beta. gamma delta beta.", 1);
    const blockEnd = weightOf("alpha beta. gamma delta beta.", 4);
    expect(comma).toBeGreaterThan(1);
    expect(sentence).toBeGreaterThan(comma);
    expect(blockEnd).toBeGreaterThan(sentence);
  });

  it("gives the first word of a block extra time to reorient", () => {
    const stream = buildReadingStream("alpha alpha alpha alpha");
    expect(stream.tokens[0].weight).toBeGreaterThan(stream.tokens[1].weight);
  });

  it("ends a heading with a shorter rest than a paragraph", () => {
    const heading = buildReadingStream("## Title here").tokens;
    const paragraph = buildReadingStream("Title here").tokens;
    expect(heading[1].weight).toBeLessThan(paragraph[1].weight);
  });
});

describe("durationFor", () => {
  it("scales inversely with the rate", () => {
    const token = buildReadingStream("word word").tokens[1];
    expect(durationFor(token, 300)).toBeCloseTo(durationFor(token, 600) * 2, 5);
  });

  it("clamps the rate to the offered range and snaps to the step", () => {
    expect(clampWpm(10)).toBe(100);
    expect(clampWpm(5000)).toBe(800);
    expect(clampWpm(313)).toBe(325);
  });

  it("estimates the time left from the current step, and a block costs nothing", () => {
    const stream = buildReadingStream("one two three four five");
    expect(remainingMs(stream, 0, WPM_DEFAULT)).toBeGreaterThan(
      remainingMs(stream, 3, WPM_DEFAULT),
    );
    expect(remainingMs(stream, stream.steps.length, WPM_DEFAULT)).toBe(0);

    const withTable = buildReadingStream("one two\n\n| a |\n| - |\n\nthree four");
    const words = buildReadingStream("one two\n\nthree four");
    expect(remainingMs(withTable, 0, WPM_DEFAULT)).toBeCloseTo(
      remainingMs(words, 0, WPM_DEFAULT),
      5,
    );
  });
});

describe("chunking", () => {
  it("pairs short adjacent words", () => {
    expect(texts("in the bundle root", 2)).toEqual(["in the", "bundle root"]);
  });

  it("refuses to pair across a sentence or clause boundary", () => {
    expect(texts("stop. go on now", 2)).toEqual(["stop.", "go on", "now"]);
    expect(texts("first, then later on", 2)).toEqual(["first,", "then later", "on"]);
  });

  it("leaves a long word alone rather than building a wide frame", () => {
    expect(texts("interoperability report", 2)).toEqual(["interoperability", "report"]);
  });

  it("keeps offsets addressing the whole chunk", () => {
    const stream = buildReadingStream("in the bundle root", { chunk: 2 });
    const block = stream.blocks[0];
    expect(block.text.slice(stream.tokens[0].start, stream.tokens[0].end)).toBe("in the");
  });
});

describe("sentence navigation", () => {
  const stream = buildReadingStream("One two three. Four five six. Seven eight.");

  it("steps back to the start of the current sentence, then to the previous one", () => {
    // Index 4 is "five", inside the second sentence.
    expect(previousSentence(stream, 4)).toBe(3); // "Four"
    expect(previousSentence(stream, 3)).toBe(0); // "One"
    expect(previousSentence(stream, 0)).toBe(0); // already at the top
  });

  it("steps forward to the first word of the next sentence, and stops at the end", () => {
    expect(nextSentence(stream, 0)).toBe(3);
    expect(nextSentence(stream, 3)).toBe(6);
    expect(nextSentence(stream, 7)).toBe(stream.tokens.length - 1);
  });

  it("returns the surrounding sentence and the position inside it", () => {
    const context = sentenceContext(stream, 4);
    expect(context.tokens.map((t) => t.text)).toEqual(["Four", "five", "six."]);
    expect(context.offset).toBe(1);
  });

  it("reports a paused block standing between two positions, in either direction", () => {
    const withBlock = buildReadingStream("One two.\n\n```ts\nx\n```\n\nThree four.");
    // Steps: 0 word, 1 word, 2 block, 3 word, 4 word.
    expect(blockStepBetween(withBlock, 1, 4)).toBe(2);
    expect(blockStepBetween(withBlock, 4, 0)).toBe(2);
    expect(blockStepBetween(withBlock, 0, 1)).toBeNull();
    expect(blockStepBetween(withBlock, 3, 4)).toBeNull();
    // The block itself is a valid landing point, not something to look past.
    expect(blockStepBetween(withBlock, 1, 2)).toBe(2);
  });

  it("survives an out-of-range index", () => {
    expect(sentenceContext(stream, 999)).toEqual({ tokens: [], offset: 0 });
    expect(nextSentence(stream, 999)).toBe(999);
  });
});

describe("boldPrefix", () => {
  it("marks one letter of a short word and about two fifths of a long one", () => {
    expect(boldPrefix("an")).toBe(1);
    expect(boldPrefix("the")).toBe(1);
    expect(boldPrefix("bundle")).toBe(3);
    expect(boldPrefix("interoperability")).toBe(7);
  });

  it("never marks more of a word than it has", () => {
    for (const w of ["a", "of", "the", "four", "bundle"]) {
      expect(boldPrefix(w)).toBeLessThanOrEqual(w.length);
    }
  });
});
