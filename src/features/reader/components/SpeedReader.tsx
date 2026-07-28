// The reader's focus player: one word at a time, its Optimal Recognition Point
// pinned to a fixed x-position so no word costs an eye movement.
//
// What separates this from a stock RSVP widget is that it can go backwards.
// Suppressing regressions is where the measured comprehension cost of RSVP
// comes from, so the sentence under the word stays legible, arrows step by word
// and by sentence, and resuming rewinds a few words. A table, a code fence, an
// equation, or a diagram stops the player and renders as itself — one word at a
// time cannot show any of them. See docs/features/speed-reading.md.

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Pause, Play, RotateCcw, X } from "lucide-react";
import {
  boldPrefix,
  clampWpm,
  remainingMs,
  sentenceContext,
  WPM_ADVISORY,
  WPM_MAX,
  WPM_MIN,
  WPM_STEP,
} from "@/features/reader/speedread.ts";
import { useReadingSession } from "@/features/reader/useReadingSession.ts";
import type { ReaderChunk } from "@/shared/types.ts";
import { renderMarkdown } from "@/shared/render/markdown.ts";
import { highlightCodeBlocks } from "@/shared/render/highlight.ts";
import { renderMathBlocks } from "@/shared/render/math.ts";
import { renderMermaidBlocks } from "@/shared/render/mermaid.ts";
import "@/shared/styles/chrome.css";
import "./SpeedReader.css";

export interface SpeedReaderProps {
  /** The concept's title, shown as the quiet header. */
  title: string;
  /** The concept's markdown body. */
  body: string;
  wpm: number;
  chunk: ReaderChunk;
  boldStart: boolean;
  /** When on, the player opens paused and never animates between frames. */
  reduceMotion: boolean;
  onWpmChange: (wpm: number) => void;
  /** Closes the player, naming the block it reached so the reader can scroll
   *  the prose back to where reading stopped. */
  onClose: (blockIndex: number) => void;
  /** Test/story seam: start at this step instead of the beginning. */
  initialStep?: number;
  /** Test/story seam: start paused even when motion is allowed. */
  initialPlaying?: boolean;
}

/** mm:ss for the time-remaining readout. */
function clock(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export function SpeedReader({
  title,
  body,
  wpm,
  chunk,
  boldStart,
  reduceMotion,
  onWpmChange,
  onClose,
  initialStep = 0,
  initialPlaying,
}: SpeedReaderProps) {
  // Reduced motion means no moving text until it is asked for, which is also
  // the WCAG 2.2.2 posture: auto-updating content never starts on its own.
  const session = useReadingSession({ body, chunk, wpm, reduceMotion, initialStep, initialPlaying });
  const { stream, step, playing, done, tokenIndex: currentToken, blockIndex, lastStep } = session;
  const current = session.token;
  const pausedBlock = session.pausedBlock >= 0 ? stream.blocks[session.pausedBlock] : null;

  const rootRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const playRef = useRef<HTMLButtonElement>(null);

  /** Continue past a block, handing focus to the transport rather than letting
   *  it drop with the button that just unmounted. */
  function continuePastBlock() {
    session.resumeAfterBlock();
    requestAnimationFrame(() => playRef.current?.focus());
  }

  // ---- Focus and keys ----------------------------------------------------
  // The overlay owns the keyboard while it is up, so the reader's global
  // bindings can never fire underneath it.
  useEffect(() => {
    const returnTo = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    return () => returnTo?.focus();
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Let the transport buttons keep Space/Enter as activation, and let a
      // focused block keep Space as page-down — a long code fence has to be
      // scrollable from the keyboard.
      const onControl = (e.target as HTMLElement | null)?.closest(
        "button, input, .speedread-stop-body",
      );
      switch (e.key) {
        case "Escape":
          e.preventDefault();
          e.stopPropagation();
          onClose(blockIndex);
          return;
        case " ":
          if (onControl) return;
          e.preventDefault();
          session.toggle();
          return;
        case "ArrowRight":
          e.preventDefault();
          session.stepBy(1);
          return;
        case "ArrowLeft":
          e.preventDefault();
          session.stepBy(-1);
          return;
        case "ArrowDown":
          e.preventDefault();
          session.bySentence(1);
          return;
        case "ArrowUp":
          e.preventDefault();
          session.bySentence(-1);
          return;
        case "+":
        case "=":
          e.preventDefault();
          onWpmChange(clampWpm(Math.min(WPM_MAX, wpm + WPM_STEP)));
          return;
        case "-":
          e.preventDefault();
          onWpmChange(clampWpm(Math.max(WPM_MIN, wpm - WPM_STEP)));
          return;
        default:
      }
    }
    // Capture, so the reader's window-level shortcuts never see these keys.
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });

  // Keep focus inside the overlay: everything focusable lives in it already,
  // so a Tab that escapes to the reader behind is the only case to catch.
  useEffect(() => {
    function onFocusIn(e: FocusEvent) {
      const root = rootRef.current;
      if (root && e.target instanceof Node && !root.contains(e.target)) {
        closeRef.current?.focus();
      }
    }
    document.addEventListener("focusin", onFocusIn);
    return () => document.removeEventListener("focusin", onFocusIn);
  }, []);

  const context = currentToken >= 0 ? sentenceContext(stream, currentToken) : { tokens: [], offset: 0 };
  const progress = stream.steps.length > 0 ? (step + 1) / stream.steps.length : 0;
  const left = remainingMs(stream, step, wpm);

  return (
    <div
      ref={rootRef}
      className="speedread"
      role="dialog"
      aria-modal="true"
      aria-label={`Speed reading: ${title}`}
      data-reduce-motion={reduceMotion ? "on" : undefined}
    >
      {/* The frame ticks several times a second. Announcing it would flood a
          screen reader with fragments, so the whole display is hidden from the
          accessibility tree and this names what is happening instead; the full
          prose stays in the reader behind. */}
      <p className="sr-only">
        Speed reading {title} at {wpm} words per minute. The full text remains in
        the reader behind this player. Use the transport controls, or space to
        pause and the arrow keys to move by word and by sentence.
      </p>

      <header className="speedread-top">
        <span className="speedread-title" aria-hidden="true">
          {title}
        </span>
        <span className="speedread-count" aria-hidden="true">
          {stream.words} words · {clock(left)} left
        </span>
        <button
          ref={closeRef}
          type="button"
          className="btn ghost speedread-close"
          onClick={() => onClose(blockIndex)}
        >
          <X size={14} aria-hidden="true" />
          Close
        </button>
      </header>
      <div
        className="speedread-progress"
        role="progressbar"
        aria-label="Reading progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress * 100)}
      >
        <span style={{ width: `${progress * 100}%` }} />
      </div>

      <div className="speedread-stage">
        {pausedBlock ? (
          <BlockStop
            key={pausedBlock.source}
            source={pausedBlock.source}
            kind={pausedBlock.kind}
            onContinue={continuePastBlock}
          />
        ) : done ? (
          <div className="speedread-end">
            <p>End of {title}.</p>
            <div className="speedread-end-actions">
              <button type="button" className="btn" onClick={session.restart}>
                <RotateCcw size={14} aria-hidden="true" />
                Read again
              </button>
              <button type="button" className="btn primary" onClick={() => onClose(blockIndex)}>
                Back to the reader
              </button>
            </div>
          </div>
        ) : (
          // The word is positioned against this box, not stacked in flow above
          // the sentence. A sentence one line longer than the last would
          // otherwise re-centre the pair and shift the word vertically — and a
          // fixation point that moves between frames is the one thing this
          // whole layout exists to prevent.
          <div className="speedread-live">
            <div className="speedread-frame" aria-hidden="true">
              <span className="speedread-tick" />
              <p className="speedread-word">
                <span className="speedread-pre">
                  {current
                    ? emphasize(current.text.slice(0, current.orp), boldStart, 0, current.text)
                    : ""}
                </span>
                <span className="speedread-orp">{current ? current.text.charAt(current.orp) : ""}</span>
                <span className="speedread-post">
                  {current
                    ? emphasize(
                        current.text.slice(current.orp + 1),
                        boldStart,
                        current.orp + 1,
                        current.text,
                      )
                    : ""}
                </span>
              </p>
              <span className="speedread-tick" />
            </div>
            {/* The regression affordance: the sentence being read stays whole
                and legible, so a word that did not land can be recovered
                without leaving the player. */}
            <p className="speedread-context" aria-hidden="true">
              {context.tokens.map((t, i) => (
                <span key={t.step} className={i === context.offset ? "is-current" : undefined}>
                  {t.text}{" "}
                </span>
              ))}
            </p>
          </div>
        )}
      </div>

      <div className="speedread-transport">
        <div className="speedread-group" role="group" aria-label="Move through the text">
          <button
            type="button"
            className="btn icon"
            aria-label="Previous sentence"
            disabled={currentToken < 0}
            onClick={() => session.bySentence(-1)}
          >
            <ChevronLeft size={16} aria-hidden="true" />
            <ChevronLeft size={16} aria-hidden="true" className="speedread-chevron-2" />
          </button>
          <button
            type="button"
            className="btn icon"
            aria-label="Previous word"
            disabled={step <= 0}
            onClick={() => session.stepBy(-1)}
          >
            <ChevronLeft size={16} aria-hidden="true" />
          </button>
          <button
            ref={playRef}
            type="button"
            className="btn primary speedread-play"
            aria-label={playing ? "Pause" : "Play"}
            onClick={session.toggle}
          >
            {playing ? <Pause size={16} aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}
            <span>{playing ? "Pause" : "Play"}</span>
          </button>
          <button
            type="button"
            className="btn icon"
            aria-label="Next word"
            disabled={step >= lastStep}
            onClick={() => session.stepBy(1)}
          >
            <ChevronRight size={16} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="btn icon"
            aria-label="Next sentence"
            disabled={currentToken < 0}
            onClick={() => session.bySentence(1)}
          >
            <ChevronRight size={16} aria-hidden="true" />
            <ChevronRight size={16} aria-hidden="true" className="speedread-chevron-2" />
          </button>
        </div>

        <div className="speedread-pace">
          <label className="speedread-pace-label" htmlFor="speedread-wpm">
            Pace
          </label>
          <input
            id="speedread-wpm"
            type="range"
            min={WPM_MIN}
            max={WPM_MAX}
            step={WPM_STEP}
            value={wpm}
            onChange={(e) => onWpmChange(clampWpm(Number(e.target.value)))}
          />
          <output className="speedread-wpm" htmlFor="speedread-wpm">
            {wpm} wpm
          </output>
        </div>
      </div>

      {/* Said plainly rather than hidden: the rate is the reader's to choose,
          but the cost above it is not a secret. Always rendered, so crossing the
          threshold mid-read does not resize the stage and nudge the word. */}
      <p className="speedread-advisory">
        {wpm > WPM_ADVISORY
          ? `Above about ${WPM_ADVISORY} wpm, comprehension usually starts to drop.`
          : null}
      </p>
    </div>
  );
}

/**
 * The word-start cue. Off by default and deliberately unadvertised as a speed
 * aid: controlled trials find no reading-speed or comprehension effect for
 * typical readers. Some readers find it easier to look at, so it is offered.
 */
function emphasize(part: string, on: boolean, from: number, whole = part) {
  if (!on || !part) return part;
  const cut = boldPrefix(whole) - from;
  if (cut <= 0) return part;
  return (
    <>
      <b>{part.slice(0, cut)}</b>
      {part.slice(cut)}
    </>
  );
}

const STOP_LABELS: Record<string, string> = {
  code: "Code block",
  table: "Table",
  math: "Equation",
  mermaid: "Diagram",
};

/** Where the player stops: a block that only means anything shown whole. */
function BlockStop({
  source,
  kind,
  onContinue,
}: {
  source: string;
  kind: string;
  onContinue: () => void;
}) {
  // Keyed on `source` by the caller, so the plain render is the initial state
  // and the effect only ever *upgrades* it with the lazy renderers.
  const [html, setHtml] = useState(() => renderMarkdown(source));
  const continueRef = useRef<HTMLButtonElement>(null);

  // A stop is the one moment the player hands control back, so focus goes to
  // the control that takes it: Enter or Space then continues, with no reach for
  // the mouse and no guessing which key resumes.
  useEffect(() => {
    continueRef.current?.focus();
  }, [source]);

  useEffect(() => {
    const run = { cancelled: false };
    void (async () => {
      if (typeof document === "undefined") return;
      const tpl = document.createElement("template");
      tpl.innerHTML = renderMarkdown(source);
      await renderMermaidBlocks(tpl.content);
      await highlightCodeBlocks(tpl.content);
      await renderMathBlocks(tpl.content);
      if (!run.cancelled) setHtml(tpl.innerHTML);
    })();
    return () => {
      run.cancelled = true;
    };
  }, [source]);

  const label = STOP_LABELS[kind] ?? "Block";
  return (
    <div className="speedread-stop">
      <p className="speedread-stop-label">{label} — read this one at your own pace.</p>
      {/* A long block scrolls, so it is a focusable region with a name: the
          keyboard has to be able to reach the bottom of a code fence, the same
          way the reader's own wide tables and code blocks work. */}
      <div
        className="speedread-stop-body markdown"
        role="region"
        aria-label={`${label}, scrollable`}
        tabIndex={0}
        dangerouslySetInnerHTML={{ __html: html }}
      />
      <button ref={continueRef} type="button" className="btn primary speedread-continue" onClick={onContinue}>
        Continue reading
        {/* Named on the control rather than left to be discovered: the key is
            the point of the stop, and an unlabelled one is a guess. The shared
            cap (shared/styles/chrome.css) rather than a local one — there were
            already four near-identical definitions once. */}
        <kbd className="kbd" aria-hidden="true">
          Space
        </kbd>
      </button>
    </div>
  );
}
