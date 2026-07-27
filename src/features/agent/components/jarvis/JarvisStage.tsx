// Jarvis Mode: an agent turn, staged.
//
// An in-app overlay rather than real OS windows, and the reason is functional:
// Jarvis is conversational, and a window that appears takes focus. Focus theft
// mid-sentence would break the exact interaction this dramatizes. See
// docs/proposals/jarvis-mode.md.
//
// Three properties this must never lose:
//   - it never takes focus (the composer keeps the caret throughout);
//   - it never invents a panel (every one maps to a real event); and
//   - `reduceMotion` removes the motion, not the information.

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { RetrievalResult } from "@/features/agent/retrieval/types.ts";
import { JarvisField, type JarvisFieldConcept } from "./JarvisField.tsx";
import { loadJarvisThree, type JarvisThree } from "./jarvisThree.ts";
import { BEAT_MS, beatsFor, type JarvisBeat } from "./jarvisBeats.ts";
import "./JarvisStage.css";

interface JarvisStageProps {
  result: RetrievalResult;
  /** The open bundle's concepts, rendered as the graph behind the stage. Empty
   *  or absent simply means no field: the panels are the feature. */
  concepts?: readonly JarvisFieldConcept[];
  /** Cleared when the sequence finishes or the viewer dismisses it. */
  onDone: () => void;
  reduceMotion: boolean;
  /** Injected in stories and tests so the sequence does not need real time. */
  container?: HTMLElement;
}

function Panel({ beat }: { beat: JarvisBeat }) {
  switch (beat.kind) {
    case "question":
      return (
        <div className="jarvis-panel jarvis-panel--question">
          <span className="jarvis-panel__tag">query</span>
          <p className="jarvis-panel__query">{beat.query}</p>
          <p className="jarvis-panel__meta">
            <span className="jarvis-panel__route">{beat.route}</span>
            {beat.reason}
          </p>
        </div>
      );
    case "candidate":
      // Deliberately terse and fast. Density carries "it looked at a lot";
      // nobody is meant to read these.
      return (
        <div className="jarvis-panel jarvis-panel--candidate">
          <code>{beat.conceptId}</code>
          <span className="jarvis-panel__score">{beat.score.toFixed(0)}</span>
        </div>
      );
    case "excerpt":
      return (
        <div className="jarvis-panel jarvis-panel--excerpt">
          <span className="jarvis-panel__tag">retrieved</span>
          <p className="jarvis-panel__title">
            {beat.conceptTitle}
            {beat.headingPath.length > 0 && (
              <span className="jarvis-panel__path"> / {beat.headingPath.join(" / ")}</span>
            )}
          </p>
          <p className="jarvis-panel__text">{beat.text.slice(0, 420)}</p>
        </div>
      );
    case "omission":
      return (
        <div className="jarvis-panel jarvis-panel--omission">
          <span className="jarvis-panel__tag">dropped</span>
          <p className="jarvis-panel__title">
            <code>{beat.conceptId}</code>
            <span className="jarvis-panel__reason">{beat.reason}</span>
          </p>
          <p className="jarvis-panel__text">{beat.detail}</p>
        </div>
      );
    case "caveat":
      return (
        <div className="jarvis-panel jarvis-panel--caveat">
          <span className="jarvis-panel__tag">caveat</span>
          <p className="jarvis-panel__reason">{beat.caveatKind}</p>
          <p className="jarvis-panel__text">{beat.message}</p>
        </div>
      );
    case "more":
      return (
        <div className="jarvis-panel jarvis-panel--more">
          <p className="jarvis-panel__text">
            and {beat.hidden} more the stage did not show
          </p>
        </div>
      );
  }
}

export function JarvisStage({
  result,
  concepts,
  onDone,
  reduceMotion,
  container,
}: JarvisStageProps) {
  const beats = beatsFor(result);
  const [ticked, setTicked] = useState(0);
  // three.js is loaded only once someone actually runs a staged turn, so a user
  // who never enables the mode never downloads it. Null until it lands, and the
  // stage plays perfectly well without it.
  const [loaded, setLoaded] = useState<JarvisThree | null>(null);

  useEffect(() => {
    // No field under reduced motion: a slowly rotating point cloud is exactly
    // the kind of continuous background movement that setting exists to stop.
    if (reduceMotion || !concepts || concepts.length === 0) return;
    let cancelled = false;
    void loadJarvisThree().then((modules) => {
      if (!cancelled) setLoaded(modules);
    });
    return () => {
      cancelled = true;
    };
  }, [reduceMotion, concepts]);

  // With motion reduced the whole sequence lands at once: the information is
  // the point, the choreography is the decoration, so the decoration is what
  // goes. Switching the feature off instead would withhold what the turn used.
  //
  // Derived during render rather than pushed into state by an effect, which
  // would be a cascading render for a value that is a pure function of props.
  const shown = reduceMotion ? beats.length : ticked;

  useEffect(() => {
    // Every exit is scheduled rather than called inline: `onDone` is the
    // parent's setState, and calling it synchronously from an effect cascades.
    if (beats.length === 0) {
      const empty = window.setTimeout(onDone, 0);
      return () => window.clearTimeout(empty);
    }
    if (reduceMotion) {
      // Nothing animates, so nothing else would ever clear the stage. Hold it
      // long enough to read a few panels, scaled to how much there is.
      const dwell = window.setTimeout(onDone, Math.min(6000, 1600 + beats.length * 260));
      return () => window.clearTimeout(dwell);
    }
    let index = 0;
    let timer: number;
    const advance = () => {
      index += 1;
      setTicked(index);
      if (index >= beats.length) {
        // A held final frame, then out. Cutting on the last beat reads as a
        // glitch rather than as an ending.
        timer = window.setTimeout(onDone, 1100);
        return;
      }
      timer = window.setTimeout(advance, BEAT_MS[beats[index].kind]);
    };
    timer = window.setTimeout(advance, 60);
    return () => window.clearTimeout(timer);
    // `beats` is derived from the receipt, so its identity tracks that id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result.receipt.receiptId, reduceMotion, onDone]);

  // Escape drops straight to the answer. Never trap anyone in a cutscene.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onDone();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onDone]);

  const visible = beats.slice(0, shown);
  // Which concepts the sequence has reached, so the field lights the points it
  // actually touched rather than an arbitrary set.
  const litIds = visible
    .map((beat) =>
      beat.kind === "candidate" || beat.kind === "omission" || beat.kind === "excerpt"
        ? beat.conceptId
        : null,
    )
    .filter((id): id is string => id !== null);
  const target = container ?? document.body;

  return createPortal(
    <div
      className={`jarvis-stage${reduceMotion ? " jarvis-stage--still" : ""}`}
      // Presentational: the conversation is the accessible record of the turn,
      // and this is a dramatization of it. Announcing every panel would flood a
      // screen reader with the same content twice.
      aria-hidden="true"
      onClick={onDone}
    >
      {loaded && concepts && (
        <JarvisField concepts={concepts} litIds={litIds} loaded={loaded} />
      )}
      <div className="jarvis-stage__field">
        {visible.map((beat, index) => (
          <div
            key={beat.id}
            className="jarvis-stage__slot"
            data-latest={index === visible.length - 1 ? "" : undefined}
            style={{
              // Scattered rather than stacked, seeded off the index so a replay
              // of the same receipt looks the same.
              "--jarvis-x": `${((index * 37) % 62) - 31}%`,
              "--jarvis-y": `${((index * 53) % 46) - 23}%`,
              "--jarvis-depth": `${1 - Math.min(visible.length - 1 - index, 6) * 0.09}`,
            } as React.CSSProperties}
          >
            <Panel beat={beat} />
          </div>
        ))}
      </div>
      <div className="jarvis-stage__housing">
        <span />
        <span />
        <span />
        <span />
        <div className="jarvis-stage__rule" />
      </div>
      <p className="jarvis-stage__dismiss">Esc to skip</p>
    </div>,
    target,
  );
}
