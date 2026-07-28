// The playback state both speed-reading modes share: where the cursor is, is it
// running, and every way of moving it. The focus player and the in-place pacer
// differ in how they *draw* a position, not in how a position moves, so keeping
// this in one hook is what stops the two from drifting apart.
//
// See docs/features/speed-reading.md.

import { useEffect, useMemo, useState } from "react";
import {
  blockStepBetween,
  buildReadingStream,
  durationFor,
  nextSentence,
  previousSentence,
  RESUME_BACKSTEP,
  stepOfToken,
} from "@/features/reader/speedread.ts";
import type { ReadingStream, ReadingToken } from "@/features/reader/speedread.ts";
import type { ReaderChunk } from "@/shared/types.ts";

export interface ReadingSession {
  stream: ReadingStream;
  /** Cursor into `stream.steps`. */
  step: number;
  playing: boolean;
  /** True once the last step has been shown. */
  done: boolean;
  /** The word on screen, or null when stopped at a whole block. */
  token: ReadingToken | null;
  /** Index of that word in `stream.tokens`, or -1. */
  tokenIndex: number;
  /** The block being shown whole, or -1 when a word is on screen. */
  pausedBlock: number;
  /** Where the reader is in the document, for handing a scroll position back. */
  blockIndex: number;
  lastStep: number;
  play: () => void;
  pause: () => void;
  /** Pause, or resume a few words back so the thread is picked up not guessed. */
  toggle: () => void;
  /** Move the cursor, pausing playback — every manual move is a deliberate one. */
  seek: (step: number) => void;
  stepBy: (delta: number) => void;
  bySentence: (direction: -1 | 1) => void;
  restart: () => void;
  /** Continue past a block the player stopped at. */
  resumeAfterBlock: () => void;
}

export interface SessionOptions {
  body: string;
  chunk: ReaderChunk;
  wpm: number;
  /** When on, the session starts paused and stays that way until asked. */
  reduceMotion: boolean;
  initialStep?: number;
  initialPlaying?: boolean;
}

// A session holds a cursor into one particular text. Callers give the owning
// component a `key` covering the body and the chunk size, so a different text
// is a different session rather than an old cursor pointed at new words.

export function useReadingSession({
  body,
  chunk,
  wpm,
  reduceMotion,
  initialStep = 0,
  initialPlaying,
}: SessionOptions): ReadingSession {
  const stream = useMemo(() => buildReadingStream(body, { chunk }), [body, chunk]);
  const lastStep = Math.max(0, stream.steps.length - 1);
  const [step, setStep] = useState(() => Math.min(initialStep, lastStep));
  const [wanted, setWanted] = useState(() => initialPlaying ?? !reduceMotion);
  const [done, setDone] = useState(false);

  const entry = stream.steps.at(step);
  const token = entry?.kind === "word" ? (stream.tokens.at(entry.token) ?? null) : null;
  const tokenIndex = entry?.kind === "word" ? entry.token : -1;
  const pausedBlock = entry?.kind === "block" ? entry.block : -1;
  // A block step is a stop, not a frame: the cursor sitting on one *is* being
  // paused, so playback is derived rather than switched off from an effect.
  const playing = wanted && token !== null && !done;

  // The clock. A self-rescheduling timeout, not an interval: every frame has
  // its own dwell, so there is no fixed tick to run on.
  useEffect(() => {
    // `playing` already implies a word is on screen — see its definition above.
    if (!playing) return;
    const id = window.setTimeout(() => {
      if (step >= lastStep) {
        setWanted(false);
        setDone(true);
      } else {
        setStep(step + 1);
      }
    }, durationFor(token, wpm));
    return () => window.clearTimeout(id);
  }, [playing, token, step, wpm, lastStep]);

  const seek = (next: number) => {
    setWanted(false);
    setDone(false);
    setStep(Math.min(Math.max(0, next), lastStep));
  };
  const resumeAfterBlock = () => {
    setStep(Math.min(step + 1, lastStep));
    setDone(false);
    setWanted(true);
  };

  return {
    stream,
    step,
    playing,
    done,
    token,
    tokenIndex,
    pausedBlock,
    blockIndex: token?.blockIndex ?? pausedBlock,
    lastStep,
    play: () => {
      setDone(false);
      setWanted(true);
    },
    pause: () => setWanted(false),
    toggle: () => {
      if (playing) {
        setWanted(false);
        return;
      }
      // Stopped at a table or a code block: play means "continue past this".
      if (pausedBlock >= 0) {
        resumeAfterBlock();
        return;
      }
      // Resuming rewinds a few words: picking the thread back up beats guessing
      // where it was dropped.
      if (tokenIndex > 0) {
        setStep(stepOfToken(stream, Math.max(0, tokenIndex - RESUME_BACKSTEP)));
      }
      setDone(false);
      setWanted(true);
    },
    seek,
    stepBy: (delta) => seek(step + delta),
    bySentence: (direction) => {
      if (tokenIndex < 0) {
        seek(step + direction);
        return;
      }
      const target =
        direction < 0 ? previousSentence(stream, tokenIndex) : nextSentence(stream, tokenIndex);
      const targetStep = stepOfToken(stream, target);
      // A table or code fence in the way is a stop, not something to jump over.
      seek(blockStepBetween(stream, step, targetStep) ?? targetStep);
    },
    restart: () => {
      setStep(0);
      setDone(false);
      setWanted(!reduceMotion);
    },
    resumeAfterBlock,
  };
}
