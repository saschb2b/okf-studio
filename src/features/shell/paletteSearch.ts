// Ranking for the global search launcher: prefix, then substring, then a
// subsequence fallback. Scores and the matched positions are both returned, so
// the list can mark the characters a fuzzy hit matched instead of leaving it
// looking arbitrary.
//
// No search dependency. Fuse.js would replace roughly the eighty lines below
// with roughly twelve kilobytes, and its headline feature over this is
// tolerance for transposed characters ("agnet" for "agent"). Everything else it
// does — subsequence matching, field weighting, match indices for highlighting
// — is here. Transposition tolerance is the honest gap; see the note in
// docs/features/command-palette.md.

/** Where a query matched, as indices into the original string. */
export type MatchSpan = readonly number[];

export interface FieldMatch {
  score: number;
  /** Indices into the scored string, ascending. Empty for an empty query. */
  positions: MatchSpan;
}

const NO_MATCH: FieldMatch = { score: -1, positions: [] };

/** A character that starts a word, so a match on it counts for more. */
function isBoundary(prev: string | undefined): boolean {
  return prev === undefined || /[\s/_.\-:]/.test(prev);
}

/**
 * Score one term against one string, returning the match positions with it.
 *
 * The tiers, best first:
 *   - prefix          the term starts the string
 *   - word prefix     the term starts a word inside it
 *   - substring       the term appears contiguously
 *   - subsequence     the term's characters appear in order, with gaps
 *
 * Within the subsequence tier, runs of adjacent characters and matches on word
 * boundaries both raise the score, and distance from the start lowers it. That
 * is what separates "gv" → "**G**raph **V**iew" from "gv" → "Git **V**alidation
 * ...".
 */
export function scoreTerm(haystack: string, term: string): FieldMatch {
  if (!term) return { score: 0, positions: [] };
  const h = haystack.toLowerCase();
  const n = term.toLowerCase();
  if (n.length > h.length) return NO_MATCH;

  const idx = h.indexOf(n);
  if (idx >= 0) {
    const positions = Array.from({ length: n.length }, (_, i) => idx + i);
    // A contiguous hit always beats a scattered one; shorter haystacks win ties
    // so "Graph" outranks "Graph View Controls" for the query "graph".
    const base = idx === 0 ? 3000 : isBoundary(h[idx - 1]) ? 2400 : 1800;
    return { score: base - idx * 2 - h.length, positions };
  }

  // Subsequence: walk the haystack once, taking each term character at its
  // first opportunity. Greedy is not optimal, but it is stable and cheap, and
  // the bonuses below dominate the ordering in practice.
  const positions: number[] = [];
  let hi = 0;
  for (const ch of n) {
    while (hi < h.length && h[hi] !== ch) hi++;
    if (hi >= h.length) return NO_MATCH;
    positions.push(hi);
    hi++;
  }

  let score = 900 - h.length;
  for (let i = 0; i < positions.length; i++) {
    if (isBoundary(h[positions[i] - 1])) score += 60;
    if (i > 0 && positions[i] === positions[i - 1] + 1) score += 40;
  }
  score -= positions[0] * 2; // a match that starts late is a weaker match
  return { score, positions };
}

/**
 * Score a whitespace-separated query against one string. Every term must match
 * (AND), which is what makes "graph view" find "Graph View" without requiring
 * the words to be adjacent, and what stops a two-word query from matching on
 * one of them.
 */
export function scoreQuery(haystack: string, query: string): FieldMatch {
  const terms = query.trim().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return { score: 0, positions: [] };

  let total = 0;
  const positions = new Set<number>();
  for (const term of terms) {
    const hit = scoreTerm(haystack, term);
    if (hit.score < 0) return NO_MATCH;
    total += hit.score;
    for (const p of hit.positions) positions.add(p);
  }
  // Average rather than sum, so a three-word query is comparable to a one-word
  // query and long queries do not outrank short ones purely by term count.
  return { score: total / terms.length, positions: [...positions].sort((a, b) => a - b) };
}

/** One scored field of a record, with the weight its match carries. */
export interface WeightedField {
  value: string;
  weight: number;
  /** Set when this field's match positions should be shown to the reader. */
  highlight?: boolean;
}

export interface RecordMatch {
  score: number;
  /** Positions in the field marked `highlight`, when that field matched. */
  positions: MatchSpan;
}

/**
 * Score a record across several fields, taking the best weighted field as the
 * record's score. Best-of rather than sum: a title hit should not be diluted by
 * the body not matching, and a record should not climb by matching weakly
 * everywhere.
 */
export function scoreFields(fields: readonly WeightedField[], query: string): RecordMatch {
  if (!query.trim()) return { score: 0, positions: [] };
  let best = -1;
  let positions: MatchSpan = [];
  for (const field of fields) {
    if (!field.value) continue;
    const hit = scoreQuery(field.value, query);
    if (hit.score < 0) continue;
    const weighted = hit.score * field.weight;
    if (weighted > best) {
      best = weighted;
      positions = field.highlight ? hit.positions : [];
    }
  }
  return { score: best, positions };
}

/** A run of characters, flagged when the query matched it. */
export interface Segment {
  text: string;
  match: boolean;
}

/** Split a string into matched and unmatched runs, for rendering. */
export function segment(text: string, positions: MatchSpan): Segment[] {
  if (positions.length === 0) return [{ text, match: false }];
  const hit = new Set(positions);
  const out: Segment[] = [];
  let run = "";
  let runMatch = hit.has(0);
  for (let i = 0; i < text.length; i++) {
    const isMatch = hit.has(i);
    if (isMatch !== runMatch) {
      if (run) out.push({ text: run, match: runMatch });
      run = "";
      runMatch = isMatch;
    }
    run += text[i];
  }
  if (run) out.push({ text: run, match: runMatch });
  return out;
}
