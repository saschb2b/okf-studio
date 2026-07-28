// Guided pacing: the second speed-reading mode, and the one that survives dense
// material. Instead of removing the prose, it keeps the concept exactly where it
// is and sweeps a beam through it at a chosen rate, so the eye is led rather
// than replaced. Everything stays on screen — the paragraph, the table, the
// sentence three lines up — so a reread costs a glance instead of a mode change.
//
// See docs/features/speed-reading.md.

import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { ChevronLeft, ChevronRight, Pause, Play, X } from "lucide-react";
import { clampWpm, WPM_MAX, WPM_MIN, WPM_STEP } from "@/features/reader/speedread.ts";
import { useReadingSession } from "@/features/reader/useReadingSession.ts";
import { PacerIndex } from "@/features/reader/pacerLocate.ts";
import type { ReaderChunk } from "@/shared/types.ts";
import "./ReadingPacer.css";

export interface ReadingPacerProps {
  body: string;
  /** The rendered body the beam is drawn over. */
  bodyRef: RefObject<HTMLDivElement | null>;
  wpm: number;
  chunk: ReaderChunk;
  reduceMotion: boolean;
  onWpmChange: (wpm: number) => void;
  onClose: () => void;
}

interface Beam {
  top: number;
  left: number;
  width: number;
  height: number;
  /** False when the paced word has scrolled out of the pane. The beam is still
   *  *measured* then — that position is what the auto-scroll steers by. */
  inView: boolean;
}

/** Where the transport bar sits: over the pane it is pacing, not the window. */
interface BarBox {
  left: number;
  width: number;
}

/** Keep the paced line inside this band of the scroller, so the reader is never
 *  chasing a beam at the very edge of the pane. */
const BAND_TOP = 0.25;
const BAND_BOTTOM = 0.7;

export function ReadingPacer({
  body,
  bodyRef,
  wpm,
  chunk,
  reduceMotion,
  onWpmChange,
  onClose,
}: ReadingPacerProps) {
  const session = useReadingSession({ body, chunk, wpm, reduceMotion });
  const { stream, step, playing, done, token, pausedBlock } = session;
  const [beam, setBeam] = useState<Beam | null>(null);
  const [bar, setBar] = useState<BarBox | null>(null);
  const indexRef = useRef(new PacerIndex());

  // Position the beam over whatever the cursor is on. Runs after every step and
  // again on scroll and resize, because the box is viewport-relative.
  useEffect(() => {
    const bodyEl = bodyRef.current;
    if (!bodyEl) return;
    const scroller = bodyEl.closest(".pane");
    let frame = 0;

    const place = () => {
      frame = 0;
      const bounds = scroller?.getBoundingClientRect() ?? null;
      // The bar belongs to the pane it paces, not to the middle of the window.
      setBar(bounds ? { left: bounds.left, width: bounds.width } : null);

      const index = indexRef.current;
      index.sync(bodyEl, stream);
      const target = token
        ? index.rect(token)
        : (index.element(pausedBlock)?.getBoundingClientRect() ?? null);
      if (!target) {
        setBeam(null);
        return;
      }
      // Measured even when out of view: a beam that nulled itself off-screen
      // would starve the auto-scroll that is supposed to bring it back, and the
      // two would deadlock on the first word of a scrolled-down concept.
      setBeam({
        top: target.top,
        left: target.left,
        width: target.width,
        height: target.height,
        inView: !bounds || (target.bottom >= bounds.top && target.top <= bounds.bottom),
      });
    };

    const schedule = () => {
      if (frame === 0) frame = requestAnimationFrame(place);
    };

    place();
    scroller?.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      scroller?.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [bodyRef, stream, step, token, pausedBlock]);

  // Follow the beam down the page while playing. Manual moves scroll too, so
  // stepping back a sentence brings that sentence into view.
  useEffect(() => {
    const bodyEl = bodyRef.current;
    const scroller = bodyEl?.closest(".pane");
    if (!scroller || !beam) return;
    const bounds = scroller.getBoundingClientRect();
    const top = bounds.top + bounds.height * BAND_TOP;
    const bottom = bounds.top + bounds.height * BAND_BOTTOM;
    if (beam.top >= top && beam.top <= bottom) return;
    scroller.scrollBy({
      top: beam.top - (bounds.top + bounds.height * BAND_TOP),
      behavior: reduceMotion ? "auto" : "smooth",
    });
    // `beam.top` alone: re-running on width/left changes would fight horizontal
    // layout shifts, and the band only cares about the vertical position.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [beam?.top, bodyRef, reduceMotion]);

  // The bar owns the keyboard the same way the focus player does, so pacing can
  // be driven without reaching for the mouse.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      switch (e.key) {
        case "Escape":
          e.preventDefault();
          e.stopPropagation();
          onClose();
          return;
        case " ":
          if ((e.target as HTMLElement | null)?.closest("button")) return;
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
        default:
      }
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });

  const progress = stream.steps.length > 0 ? (step + 1) / stream.steps.length : 0;

  return (
    <>
      {beam?.inView && (
        <span
          className="reading-beam"
          data-block={pausedBlock >= 0 ? "on" : undefined}
          aria-hidden="true"
          style={{ top: beam.top, left: beam.left, width: beam.width, height: beam.height }}
        />
      )}
      <div
        className="pacer-bar"
        role="group"
        aria-label="Guided pacing"
        style={bar ? { left: bar.left + bar.width / 2 } : undefined}
      >
        <p className="sr-only">
          Guided pacing is running over the concept text at {wpm} words per minute.
          The text itself is unchanged and can be read normally at any time.
        </p>
        <div className="pacer-progress" aria-hidden="true">
          <span style={{ width: `${progress * 100}%` }} />
        </div>
        <div className="pacer-controls">
          <button
            type="button"
            className="btn icon"
            aria-label="Previous sentence"
            onClick={() => session.bySentence(-1)}
          >
            <ChevronLeft size={16} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="btn primary pacer-play"
            aria-label={playing ? "Pause pacing" : "Start pacing"}
            onClick={session.toggle}
          >
            {playing ? <Pause size={16} aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}
            <span>{playing ? "Pause" : done ? "Again" : "Play"}</span>
          </button>
          <button
            type="button"
            className="btn icon"
            aria-label="Next sentence"
            onClick={() => session.bySentence(1)}
          >
            <ChevronRight size={16} aria-hidden="true" />
          </button>
          <label className="pacer-pace">
            <span className="sr-only">Pace in words per minute</span>
            <input
              type="range"
              min={WPM_MIN}
              max={WPM_MAX}
              step={WPM_STEP}
              value={wpm}
              onChange={(e) => onWpmChange(clampWpm(Number(e.target.value)))}
            />
          </label>
          <output className="pacer-wpm">{wpm} wpm</output>
          <button type="button" className="btn ghost icon" aria-label="Stop pacing" onClick={onClose}>
            <X size={14} aria-hidden="true" />
          </button>
        </div>
      </div>
    </>
  );
}
