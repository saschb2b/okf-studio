// Reading OKF v0.2's trust and freshness signals off a concept.
//
// These mirror the derived accessors in crates/okf-core/src/model.rs, and exist
// for the same reason: a bundle cannot declare itself trusted, it records who
// confirmed it and lets a consumer compute the tier. Keeping the derivation in
// one place is what stops two surfaces disagreeing about whether the same
// concept is stale.

import type { Attribution, Concept, TrustTier } from "@/shared/types.ts";

/** Whether an actor is a person. Trust keys off the `human:` prefix. */
export function isHuman(attribution: Attribution): boolean {
  return attribution.by.startsWith("human:");
}

/**
 * When the content last meaningfully changed.
 *
 * `generated.at` is v0.2's field; a v0.1 concept only has `timestamp`. The spec
 * permits the fallback, so every caller reads it here rather than picking one
 * field and being wrong on half the bundles.
 */
export function authoredAt(concept: Concept): string | null {
  return concept.generated?.at ?? concept.timestamp;
}

export function trustTier(concept: Concept): TrustTier {
  if (concept.verified.length === 0) return "unverified";
  return concept.verified.some(isHuman) ? "human-reviewed" : "machine-confirmed";
}

/** Ordered lowest to highest, so callers can compare tiers. */
const TIER_RANK: Record<TrustTier, number> = {
  "unverified": 0,
  "machine-confirmed": 1,
  "human-reviewed": 2,
};

export function tierRank(tier: TrustTier): number {
  return TIER_RANK[tier];
}

export const TIER_LABEL: Record<TrustTier, string> = {
  "unverified": "Unverified",
  "machine-confirmed": "Machine-confirmed",
  "human-reviewed": "Human-reviewed",
};

/**
 * What each tier means, in terms of the decision it supports rather than the
 * field it came from.
 */
export const TIER_MEANING: Record<TrustTier, string> = {
  "unverified": "Nobody has confirmed this. Treat it as generated, not reviewed.",
  "machine-confirmed": "Confirmed by an automated process, with no human sign-off.",
  "human-reviewed": "A person has confirmed this against its sources.",
};

/**
 * Today as `YYYY-MM-DD` in the local timezone.
 *
 * Local rather than UTC because `stale_after` is a calendar date a person wrote,
 * so "has that day arrived?" should mean the reader's day, not one that turns
 * over mid-afternoon for anyone west of UTC.
 */
export function today(now = new Date()): string {
  const month = `${now.getMonth() + 1}`.padStart(2, "0");
  const day = `${now.getDate()}`.padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

/**
 * Whether `on` is at or past the concept's staleness date. Both are ISO dates,
 * so the lexicographic compare is the date compare.
 */
export function isStale(concept: Concept, on = today()): boolean {
  return concept.staleAfter !== null && on >= concept.staleAfter;
}

/** Whether the concept is still meant to be used at all. */
export function isCurrent(concept: Concept, on = today()): boolean {
  return concept.status !== "deprecated" && !isStale(concept, on);
}

/**
 * The one line a reader needs about freshness, or null when there is nothing to
 * say. Deprecation outranks staleness: a deprecated concept is not coming back,
 * while a stale one may simply be awaiting review.
 */
export function freshnessNotice(concept: Concept, on = today()): string | null {
  if (concept.status === "deprecated") {
    return "Deprecated. Kept for links and history, no longer current.";
  }
  if (isStale(concept, on)) {
    return `Stale since ${concept.staleAfter}. It may no longer be accurate.`;
  }
  if (concept.status === "draft") {
    return "Draft. Not yet reviewed, and possibly incomplete.";
  }
  return null;
}

/**
 * A source's credibility signals, as short labels.
 *
 * `usageCount` is rendered with its window because a count without a period is
 * not a signal — 5,000 views over a week and over five years mean opposite
 * things.
 */
export function sourceSignals(
  concept: Concept,
  source: Concept["sources"][number],
): string[] {
  const signals: string[] = [];
  if (source.author) signals.push(`by ${source.author}`);
  if (source.usageCount !== null) {
    const count = new Intl.NumberFormat().format(source.usageCount);
    const window = concept.usageWindow;
    const period = window?.from && window.to
      ? ` (${window.from} to ${window.to})`
      : window?.from
        ? ` (since ${window.from})`
        : "";
    signals.push(`used ${count}×${period}`);
  }
  if (source.lastModified) signals.push(`source changed ${source.lastModified}`);
  return signals;
}
