// The reading engine behind the reader's speed-reading mode: a concept body in,
// an ordered stream of blocks and timed word tokens out. Pure — no DOM, no
// timers, no React — so the player and the in-place pacer share one model of
// "where am I in this text", and every rule here is unit-testable.
//
// The reasoning (why regressions are first-class, why the rate defaults where it
// does, why non-prose blocks stop the player) lives in
// docs/features/speed-reading.md.

import { plainBlocks, PROSE_BLOCK_KINDS } from "@/shared/render/markdown.ts";
import type { PlainBlockKind } from "@/shared/render/markdown.ts";

/** Words per minute the player can be set to. */
export const WPM_MIN = 100;
export const WPM_MAX = 800;
export const WPM_STEP = 25;
export const WPM_DEFAULT = 300;
/** Above this the UI says so: comprehension falls away past roughly 500 wpm. */
export const WPM_ADVISORY = 500;

/** How many words a resumed player steps back, so the thread is picked up
 *  rather than guessed at. */
export const RESUME_BACKSTEP = 3;

/** Words per display frame. Two is a phrase; beyond that the pivot stops
 *  landing anywhere useful. */
export type ChunkSize = 1 | 2;
/** A two-word chunk only forms while it stays this short — a long pair reads as
 *  a line of text, which is the thing the fixed pivot is meant to avoid. */
const CHUNK_MAX_CHARS = 14;

export interface ReadingToken {
  /** What the frame shows — one word, or a short chunk of two. */
  text: string;
  /** Index into `text` of the letter the eye should land on. */
  orp: number;
  blockIndex: number;
  /** Sentence counter across the whole stream; drives the context line. */
  sentenceIndex: number;
  /** Character offsets into the owning block's `text`, for the in-place pacer. */
  start: number;
  end: number;
  /** Dwell multiplier over the base rate — length, punctuation, position. */
  weight: number;
  /** True when this token closes a sentence. */
  endsSentence: boolean;
  /** Where this token sits in `steps` — the player's cursor space. */
  step: number;
}

export interface ReadingBlock {
  kind: PlainBlockKind;
  /** Prose with markdown stripped; empty for the non-prose kinds. */
  text: string;
  /** Authored source — what a `pause` block renders from. */
  source: string;
  level: number;
  /** Index of this block's first token, or -1 when it has none. */
  firstToken: number;
  tokenCount: number;
  /** True when the block cannot be read word by word and must be shown whole:
   *  a table, a code fence, an equation, a diagram. */
  pause: boolean;
  /** Where this block starts in `steps`. */
  step: number;
}

/**
 * One stop of the player. A prose block contributes a `word` step per frame; a
 * table, code fence, equation, or diagram contributes a single `block` step,
 * where the player stops and shows the thing itself.
 */
export type ReadingStep =
  | { kind: "word"; token: number }
  | { kind: "block"; block: number };

export interface ReadingStream {
  blocks: ReadingBlock[];
  tokens: ReadingToken[];
  /** Blocks and words interleaved in document order — the player's cursor space. */
  steps: ReadingStep[];
  /** Total words, before chunking — what a wpm estimate is made of. */
  words: number;
}

export interface StreamOptions {
  chunk?: ChunkSize;
}

const EMPTY_STREAM: ReadingStream = { blocks: [], tokens: [], steps: [], words: 0 };

/**
 * The letter the eye lands on, by word length — the Optimal Recognition Point.
 * Recognition is fastest when the fixation sits slightly left of a word's centre
 * rather than on its first letter, and the offset grows with length. The
 * player pins this letter to a fixed x-position so no word costs a saccade.
 */
export function pivotIndex(word: string): number {
  const n = word.length;
  if (n <= 1) return 0;
  if (n <= 5) return 1;
  if (n <= 9) return 2;
  if (n <= 13) return 3;
  return 4;
}

/** Trailing punctuation decides how long the eye rests after a word. */
const SENTENCE_END_RE = /[.!?]["'”’)\]]*$/;
const CLAUSE_END_RE = /[,;:—][)"'”’\]]*$/;
/** An abbreviation ending in a period does not end a sentence. */
const ABBREVIATION_RE = /^(?:[A-Z]|e\.g|i\.e|etc|vs|cf|approx|fig|no|al)\.$/i;

function endsSentence(word: string): boolean {
  if (!SENTENCE_END_RE.test(word)) return false;
  return !ABBREVIATION_RE.test(word);
}

/** Letters only — punctuation should not buy a word extra time on screen. */
function coreLength(word: string): number {
  return word.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "").length;
}

/**
 * How much longer than the base rate this frame stays up. Three effects, all
 * from how reading actually works: a long word needs more of a look, a clause
 * or sentence boundary is where comprehension is assembled, and the first word
 * of a block is where the eye has just been thrown somewhere new.
 */
function weightFor(
  word: string,
  opts: { first: boolean; last: boolean; kind: PlainBlockKind },
): number {
  let weight = 1 + Math.max(0, coreLength(word) - 6) * 0.04;
  if (opts.first) weight *= 1.3;
  // The longest applicable rest wins rather than compounding — a sentence that
  // ends a paragraph should not stall for the product of both.
  const blockEnd = opts.last ? (opts.kind === "heading" ? 2 : 2.6) : 1;
  const punctuation = endsSentence(word) ? 2.2 : CLAUSE_END_RE.test(word) ? 1.5 : 1;
  return weight * Math.max(blockEnd, punctuation);
}

/** Clamp a rate to the range the player offers. */
export function clampWpm(wpm: number): number {
  return Math.min(WPM_MAX, Math.max(WPM_MIN, Math.round(wpm / WPM_STEP) * WPM_STEP));
}

/** How long a token's frame stays up, in milliseconds. */
export function durationFor(token: ReadingToken, wpm: number): number {
  return (60000 / clampWpm(wpm)) * token.weight;
}

/**
 * Split a concept body into the blocks and timed tokens the player reads.
 * Prose blocks tokenize; a table, code fence, equation, or diagram is kept whole
 * and marked `pause`, because one word at a time cannot show any of them.
 */
export function buildReadingStream(md: string, opts: StreamOptions = {}): ReadingStream {
  if (!md.trim()) return EMPTY_STREAM;
  const chunk = opts.chunk ?? 1;
  const blocks: ReadingBlock[] = [];
  const tokens: ReadingToken[] = [];
  const steps: ReadingStep[] = [];
  let sentenceIndex = 0;
  let words = 0;

  for (const block of plainBlocks(md)) {
    const blockIndex = blocks.length;
    const prose = PROSE_BLOCK_KINDS.has(block.kind);
    const entry: ReadingBlock = {
      kind: block.kind,
      text: block.text,
      source: block.source,
      level: block.level,
      firstToken: -1,
      tokenCount: 0,
      pause: !prose,
      step: steps.length,
    };
    blocks.push(entry);
    if (!prose) {
      steps.push({ kind: "block", block: blockIndex });
      continue;
    }

    const raw = [...block.text.matchAll(/\S+/g)].map((m) => ({
      text: m[0],
      start: m.index,
      end: m.index + m[0].length,
    }));
    if (raw.length === 0) continue;
    words += raw.length;

    const frames = chunk === 2 ? mergePairs(raw) : raw;
    entry.firstToken = tokens.length;
    for (let i = 0; i < frames.length; i++) {
      const frame = frames[i];
      const closes = endsSentence(frame.text);
      steps.push({ kind: "word", token: tokens.length });
      tokens.push({
        text: frame.text,
        orp: pivotIndex(frame.text),
        blockIndex,
        sentenceIndex,
        start: frame.start,
        end: frame.end,
        weight: weightFor(frame.text, {
          first: i === 0,
          last: i === frames.length - 1,
          kind: block.kind,
        }),
        endsSentence: closes,
        step: steps.length - 1,
      });
      if (closes) sentenceIndex++;
    }
    entry.tokenCount = frames.length;
    // A block always closes its sentence: the next paragraph starts a new one
    // even when the author left the last line without a full stop.
    if (!tokens[tokens.length - 1].endsSentence) sentenceIndex++;
  }

  return { blocks, tokens, steps, words };
}

/** The step a token occupies, clamped into range. */
export function stepOfToken(stream: ReadingStream, token: number): number {
  const clamped = Math.min(Math.max(0, token), stream.tokens.length - 1);
  return stream.tokens.at(clamped)?.step ?? 0;
}

/** The token a step shows, or null when the step is a whole block. */
export function tokenAtStep(stream: ReadingStream, step: number): ReadingToken | null {
  const entry = stream.steps.at(step);
  return entry?.kind === "word" ? (stream.tokens.at(entry.token) ?? null) : null;
}

interface RawWord {
  text: string;
  start: number;
  end: number;
}

/** Merge adjacent short words into two-word frames, never across a sentence
 *  boundary — a chunk that spans a full stop hides the boundary the reader
 *  needs to see. */
function mergePairs(raw: RawWord[]): RawWord[] {
  const out: RawWord[] = [];
  for (let i = 0; i < raw.length; i++) {
    const a = raw[i];
    const b = raw.at(i + 1);
    if (
      b &&
      !endsSentence(a.text) &&
      !CLAUSE_END_RE.test(a.text) &&
      a.text.length + b.text.length + 1 <= CHUNK_MAX_CHARS
    ) {
      out.push({ text: `${a.text} ${b.text}`, start: a.start, end: b.end });
      i++;
    } else {
      out.push(a);
    }
  }
  return out;
}

// ---- Navigation ----------------------------------------------------------
// Rereading is the point of these: an RSVP player that can only go forward is
// the version the research says costs comprehension.

/** Index of the first token of the sentence `index` sits in. */
export function sentenceStart(stream: ReadingStream, index: number): number {
  const token = stream.tokens.at(index);
  if (!token) return 0;
  let i = index;
  while (i > 0 && stream.tokens[i - 1].sentenceIndex === token.sentenceIndex) i--;
  return i;
}

/** Jump to the start of this sentence, or to the previous one when already
 *  there — the familiar behavior of a track-back button. */
export function previousSentence(stream: ReadingStream, index: number): number {
  const start = sentenceStart(stream, index);
  if (start < index) return start;
  return start === 0 ? 0 : sentenceStart(stream, start - 1);
}

/** Index of the first token of the next sentence, or the last token. */
export function nextSentence(stream: ReadingStream, index: number): number {
  const token = stream.tokens.at(index);
  if (!token) return index;
  let i = index;
  while (i < stream.tokens.length - 1 && stream.tokens[i + 1].sentenceIndex === token.sentenceIndex) {
    i++;
  }
  return Math.min(i + 1, stream.tokens.length - 1);
}

/** The sentence around `index`, with the position of `index` inside it — what
 *  the player prints beneath the word so context is never lost. */
export function sentenceContext(
  stream: ReadingStream,
  index: number,
): { tokens: ReadingToken[]; offset: number } {
  const token = stream.tokens.at(index);
  if (!token) return { tokens: [], offset: 0 };
  const start = sentenceStart(stream, index);
  const out: ReadingToken[] = [];
  for (let i = start; i < stream.tokens.length; i++) {
    if (stream.tokens[i].sentenceIndex !== token.sentenceIndex) break;
    out.push(stream.tokens[i]);
  }
  return { tokens: out, offset: index - start };
}

/** Milliseconds of reading left from a step, at `wpm`. Block steps cost
 *  nothing: how long a table takes is the reader's business, not the clock's. */
export function remainingMs(stream: ReadingStream, step: number, wpm: number): number {
  let total = 0;
  for (let i = Math.max(0, step); i < stream.steps.length; i++) {
    const entry = stream.steps[i];
    if (entry.kind === "word") total += durationFor(stream.tokens[entry.token], wpm);
  }
  return total;
}

/**
 * The first block step strictly between two cursor positions, in the direction
 * of travel, or null. Sentence jumps move token to token, which would sail
 * straight past a table or a code fence — and those are stops, not scenery.
 */
export function blockStepBetween(
  stream: ReadingStream,
  from: number,
  to: number,
): number | null {
  const direction = to > from ? 1 : -1;
  for (let i = from + direction; direction > 0 ? i <= to : i >= to; i += direction) {
    if (stream.steps.at(i)?.kind === "block") return i;
  }
  return null;
}

/** The first token at or after a block — where "skip this table" lands. */
export function tokenAfterBlock(stream: ReadingStream, blockIndex: number): number {
  for (let b = blockIndex + 1; b < stream.blocks.length; b++) {
    if (stream.blocks[b].firstToken >= 0) return stream.blocks[b].firstToken;
  }
  return stream.tokens.length;
}

/** The block a token belongs to, or the pause block the player is stopped at. */
export function blockAt(stream: ReadingStream, index: number): ReadingBlock | null {
  return stream.blocks[stream.tokens[index]?.blockIndex] ?? null;
}

/**
 * How many leading letters a word shows in bold when the word-start cue is on.
 * The cue is off by default and makes no speed claim: controlled tests find no
 * reading-speed or comprehension effect for typical readers, with a more
 * consistent signal among ADHD and dyslexic readers. It is offered as comfort.
 */
export function boldPrefix(word: string): number {
  const n = coreLength(word);
  if (n <= 3) return 1;
  return Math.ceil(n * 0.4);
}
