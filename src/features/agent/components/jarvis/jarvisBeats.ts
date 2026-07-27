// Turning a retrieval receipt into a sequence of beats.
//
// The one rule that makes this worth watching rather than a screensaver: every
// beat maps to something the turn actually did. Nothing is padded, and a turn
// that used three things stages three things. See
// docs/proposals/jarvis-mode.md — a stage that invented panels would make
// Studio lie about what the agent read, which is the opposite of what the
// retrieval receipt exists for.
//
// Pure: no timers, no DOM. The staging component owns the clock, so the
// sequence can be tested without waiting for it.

import type { RetrievalResult } from "@/features/agent/retrieval/types.ts";

/** The most panels a stage will ever hold. Past this the tail is aggregated
 *  and said out loud, because a turn touching 200 sections must not try to
 *  open 200 panels — and must not silently pretend it touched fewer. */
export const MAX_STAGE_PANELS = 14;

export type JarvisBeat =
  /** The question, and the route it was classified into. */
  | { kind: "question"; id: string; query: string; route: string; reason: string }
  /** A candidate that ranked. Flickers past — density is the point, not the text. */
  | { kind: "candidate"; id: string; conceptId: string; score: number; matched: string[] }
  /** A candidate that made it into the evidence, with its text. */
  | {
      kind: "excerpt";
      id: string;
      conceptId: string;
      conceptTitle: string;
      headingPath: string[];
      text: string;
    }
  /** Something deliberately left out, with the reason. */
  | { kind: "omission"; id: string; conceptId: string; reason: string; detail: string }
  /** A warning attached to what was kept. */
  | { kind: "caveat"; id: string; caveatKind: string; message: string }
  /** The tail, when there was more than the stage can hold. */
  | { kind: "more"; id: string; hidden: number };

/** How long a beat holds the stage, in ms. Tempo is expressive: the sweep is
 *  faster than reading speed on purpose, and the excerpts are slow enough to
 *  actually land. */
export const BEAT_MS: Record<JarvisBeat["kind"], number> = {
  question: 900,
  candidate: 110,
  excerpt: 620,
  omission: 260,
  caveat: 420,
  more: 320,
};

function routeLabel(route: string): string {
  return route.replace(/-/g, " ");
}

/**
 * Build the beat sequence for one turn.
 *
 * Order is the narrative: the question, the sweep of what ranked, what was
 * kept, what was dropped and why, and the warnings on what survived. That is
 * also the order the engine produced them in, which is why it reads as
 * causation rather than as a slideshow.
 */
export function beatsFor(result: RetrievalResult): JarvisBeat[] {
  const beats: JarvisBeat[] = [];
  const receipt = result.receipt;

  beats.push({
    kind: "question",
    id: "question",
    query: receipt.query,
    route: routeLabel(receipt.route),
    reason: receipt.routeReason,
  });

  // The sweep. Every candidate, including the ones that lost — the contrast
  // between considered and kept is the most legible moment in the sequence.
  for (const candidate of receipt.candidates) {
    if (candidate.included) continue;
    beats.push({
      kind: "candidate",
      id: `candidate:${candidate.sectionId}`,
      conceptId: candidate.conceptId,
      score: candidate.score.total,
      matched: candidate.matchedTerms,
    });
  }

  for (const item of result.evidence.items) {
    beats.push({
      kind: "excerpt",
      id: `excerpt:${item.sectionId}`,
      conceptId: item.conceptId,
      conceptTitle: item.conceptTitle,
      headingPath: item.headingPath,
      text: item.text,
    });
  }

  // Only omissions with a stated reason. An omission Studio cannot explain is
  // not a beat worth staging.
  for (const omission of receipt.omissions) {
    beats.push({
      kind: "omission",
      id: `omission:${omission.sectionId}:${omission.reason}`,
      conceptId: omission.conceptId,
      reason: omission.reason.replace(/-/g, " "),
      detail: omission.detail,
    });
  }

  for (const caveat of result.evidence.caveats) {
    beats.push({
      kind: "caveat",
      id: `caveat:${caveat.kind}:${caveat.conceptIds.join(",")}`,
      caveatKind: caveat.kind,
      message: caveat.message,
    });
  }

  if (beats.length <= MAX_STAGE_PANELS) return beats;

  // Bounded, and it says so. Truncating in silence would be the stage quietly
  // under-reporting what the turn did.
  const kept = beats.slice(0, MAX_STAGE_PANELS - 1);
  kept.push({ kind: "more", id: "more", hidden: beats.length - kept.length });
  return kept;
}

/** Total run time, so a caller can decide whether staging is worth it at all. */
export function sequenceDurationMs(beats: JarvisBeat[]): number {
  return beats.reduce((total, beat) => total + BEAT_MS[beat.kind], 0);
}
