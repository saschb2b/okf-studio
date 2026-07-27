// Making streamed agent text arrive smoothly instead of in bursts.
//
// The plop was never a missing transition. Two things caused it, and both are
// structural:
//
//   1. Display cadence equalled network cadence. Every arriving delta was
//      appended and painted immediately, so the text moved at whatever rate the
//      provider's chunks happened to land — which is bursty, because chunks are
//      buffered by the network rather than metered by the model.
//
//   2. The whole message was re-parsed as markdown per chunk and pushed through
//      `dangerouslySetInnerHTML`, which replaces the entire subtree. React does
//      not reconcile inside that, so there was never a *newly arrived* element
//      to animate — every node was new every time. No CSS transition could have
//      fixed that.
//
// So: reveal at a steady rate independent of arrival, and keep the settled part
// of the message structurally stable so only the growing edge changes.
//
// Pure, no timers and no DOM, so the reveal schedule can be tested without
// waiting for it.

/** Characters revealed per frame at minimum, so text never stalls. */
const MIN_STEP = 1;
/** How aggressively a backlog is drained. A burst of 600 characters clears in
 *  roughly this many frames rather than appearing at once. */
const CATCHUP_DIVISOR = 10;
/** Ceiling per frame. Without it a huge burst still lands in one paint, which
 *  is the plop this exists to prevent. */
const MAX_STEP = 24;

/**
 * How many characters should be visible on the next frame.
 *
 * Scales with the backlog so a fast stream stays close behind and a slow one
 * still moves. The point is a steady *visual* rate, not a fixed one: pinning it
 * to a constant makes a fast model feel artificially throttled, and pinning it
 * to arrival is what plops.
 */
export function nextRevealed(revealed: number, total: number): number {
  if (revealed >= total) return total;
  const backlog = total - revealed;
  const step = Math.min(MAX_STEP, Math.max(MIN_STEP, Math.ceil(backlog / CATCHUP_DIVISOR)));
  return Math.min(total, revealed + step);
}

/**
 * Split streamed markdown into the part that is safe to parse and the growing
 * edge that is not.
 *
 * Markdown is not stable under truncation: `#` becomes a heading when the line
 * completes, `|` becomes a table, and a lone ``` opens a fence that swallows
 * everything after it. Parsing the whole buffer every chunk therefore makes
 * blocks change *type* mid-stream, which is a second source of visible jumping
 * on top of the burstiness.
 *
 * The settled half ends at the last blank line outside an open fence, so it
 * only grows when a block genuinely closes. The tail is rendered as plain text,
 * which is what lets the edge animate per word.
 */
export function splitSettled(text: string): { settled: string; tail: string } {
  const lines = text.split("\n");
  let fenceOpen = false;
  // The line index after the last blank line that sits outside a fence.
  let boundary = 0;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^\s*(```|~~~)/.test(line)) {
      fenceOpen = !fenceOpen;
      continue;
    }
    // A blank line inside a fence is content, not a boundary.
    if (!fenceOpen && line.trim() === "") boundary = index + 1;
  }

  // An open fence means everything from it onward is unsettled: parsing a
  // half-written code block reflows the whole message when it closes.
  if (fenceOpen) {
    for (let index = lines.length - 1; index >= 0; index -= 1) {
      if (/^\s*(```|~~~)/.test(lines[index])) {
        boundary = Math.min(boundary, index);
        break;
      }
    }
  }

  if (boundary <= 0) return { settled: "", tail: text };
  return {
    settled: lines.slice(0, boundary).join("\n"),
    tail: lines.slice(boundary).join("\n"),
  };
}

/**
 * Split the tail into animatable pieces, keeping whitespace attached so the
 * text lays out identically to the unsplit string.
 *
 * By word rather than by character: a per-character reveal reads as a novelty
 * typewriter, and a word is the unit the eye actually fixates on, so fading
 * words is both calmer and closer to how the text will finally look.
 */
export function tailWords(tail: string): string[] {
  if (tail === "") return [];
  return tail.match(/\s+|\S+/g) ?? [];
}
