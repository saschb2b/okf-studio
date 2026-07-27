// Reveal a growing string at a steady visual rate rather than at arrival rate.
//
// Driven by `requestAnimationFrame`, so the reveal is paced to the display
// rather than to a timer that drifts against it, and so it stops entirely when
// the window is not being painted.

import { useEffect, useState } from "react";
import { nextRevealed } from "./streamingText.ts";

/**
 * The visible prefix of `text`.
 *
 * `enabled` off returns the whole string with no delay — used for a finished
 * message and for reduced motion. Withholding text from someone who asked not
 * to see animation would be the wrong reading of that setting: what they turned
 * off is the movement, not the content.
 */
export function useSmoothedStream(text: string, enabled: boolean): string {
  const [revealed, setRevealed] = useState(enabled ? 0 : text.length);
  const total = text.length;

  // Keyed on the length rather than reading a ref written during render, which
  // the React Compiler rejects. Restarting on each chunk costs one cancel and
  // one schedule, and keeps the reveal a pure function of props.
  useEffect(() => {
    if (!enabled) return;
    let frame = 0;
    const tick = () => {
      setRevealed((current) => nextRevealed(current, total));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [enabled, total]);

  // Once streaming ends the full text shows immediately: the smoothing exists to
  // absorb bursts mid-stream, and making someone wait for the buffer to drain
  // after the answer is complete would be the animation getting in the way.
  if (!enabled) return text;
  // A shorter target means a new message reused this slot; never show stale
  // characters past the end of the current text.
  return text.slice(0, Math.min(revealed, text.length));
}
