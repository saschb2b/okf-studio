// The faceted query grammar behind the workspace search/filter. A query string
// like `type:Table tag:revenue degree>5 is:orphan bitcoin` compiles to a
// predicate over concepts that the graph, index, and result count all share.
//
// Grammar (terms are space-separated and ANDed; repeat a field to OR its values):
//   type:Table          concept type (case-insensitive; type:"Two Words" quotes)
//   tag:revenue          a tag
//   degree>5  links<=2  citedBy=0   numeric comparison on connectivity
//   is:orphan            no links in or out
//   has:broken           has broken links
//   "exact phrase"       quoted full-text; bare words are full-text too
// Unknown fields fall back to full-text rather than erroring (tolerant consumer).
// See docs/proposals/faceted-search.md.

import type { Concept } from "./types.ts";

type NumField = "degree" | "links" | "citedBy";
const OPS = [">", "<", ">=", "<=", "="] as const;
type Op = (typeof OPS)[number];
const isOp = (s: string): s is Op => (OPS as readonly string[]).includes(s);

interface NumericTerm {
  field: NumField;
  op: Op;
  value: number;
}

export interface CompiledQuery {
  /** Lowercased full-text needles; every one must match (AND). */
  text: string[];
  /** Lowercased concept types; a concept matches any (OR). */
  types: string[];
  /** Lowercased tags; a concept matches any (OR). */
  tags: string[];
  /** Numeric comparisons on connectivity; all must hold (AND). */
  numeric: NumericTerm[];
  /** `is:orphan` — degree 0. */
  orphan: boolean;
  /** `has:broken` — one or more broken links. */
  broken: boolean;
  /** True when no terms parsed (matches everything). */
  isEmpty: boolean;
}

const NUM_FIELDS: Record<string, NumField | undefined> = {
  degree: "degree",
  links: "links",
  citedby: "citedBy",
};

/** Split a query into terms, keeping `"quoted spans"` (even after `field:`) whole. */
function tokenize(q: string): string[] {
  const tokens: string[] = [];
  let cur = "";
  let inQuote = false;
  for (const ch of q) {
    if (ch === '"') {
      inQuote = !inQuote;
      cur += ch;
    } else if (!inQuote && /\s/.test(ch)) {
      if (cur) tokens.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  if (cur) tokens.push(cur);
  return tokens;
}

const unquote = (s: string) => s.replace(/"/g, "");

/** Parse a query string into a reusable compiled predicate. Pure and cheap. */
export function parseQuery(q: string): CompiledQuery {
  const out: CompiledQuery = {
    text: [],
    types: [],
    tags: [],
    numeric: [],
    orphan: false,
    broken: false,
    isEmpty: true,
  };

  for (const tok of tokenize(q)) {
    // field:value
    const field = /^([a-zA-Z]+):(.*)$/.exec(tok);
    if (field) {
      const key = field[1].toLowerCase();
      const value = unquote(field[2]).trim().toLowerCase();
      if (!value) continue;
      if (key === "type") out.types.push(value);
      else if (key === "tag") out.tags.push(value);
      else if (key === "is" && value === "orphan") out.orphan = true;
      else if (key === "has" && (value === "broken" || value === "brokenlinks"))
        out.broken = true;
      else out.text.push(value); // unknown field → full-text (tolerant)
      continue;
    }

    // field<op>number, e.g. degree>5
    const num = /^([a-zA-Z]+)(>=|<=|>|<|=)(\d+)$/.exec(tok);
    if (num) {
      const nf = NUM_FIELDS[num[1].toLowerCase()];
      const op = num[2];
      if (nf && isOp(op)) {
        out.numeric.push({ field: nf, op, value: Number(num[3]) });
        continue;
      }
    }

    // plain / quoted full-text
    const text = unquote(tok).trim().toLowerCase();
    if (text) out.text.push(text);
  }

  out.isEmpty =
    out.text.length === 0 &&
    out.types.length === 0 &&
    out.tags.length === 0 &&
    out.numeric.length === 0 &&
    !out.orphan &&
    !out.broken;
  return out;
}

function connectivity(c: Concept, field: NumField): number {
  if (field === "links") return c.links.length;
  if (field === "citedBy") return c.citedBy.length;
  return c.degree;
}

function compare(a: number, op: Op, b: number): boolean {
  switch (op) {
    case ">":
      return a > b;
    case "<":
      return a < b;
    case ">=":
      return a >= b;
    case "<=":
      return a <= b;
    case "=":
      return a === b;
  }
}

function textMatch(c: Concept, needle: string): boolean {
  return (
    c.title.toLowerCase().includes(needle) ||
    c.description.toLowerCase().includes(needle) ||
    c.type.toLowerCase().includes(needle) ||
    c.id.toLowerCase().includes(needle) ||
    c.tags.some((t) => t.toLowerCase().includes(needle)) ||
    c.body.toLowerCase().includes(needle)
  );
}

/** Does a concept satisfy a compiled query? Empty query matches everything. */
export function matchesCompiled(c: Concept, q: CompiledQuery): boolean {
  if (q.isEmpty) return true;
  if (q.types.length && !q.types.includes(c.type.toLowerCase())) return false;
  if (q.tags.length && !c.tags.some((t) => q.tags.includes(t.toLowerCase())))
    return false;
  for (const n of q.numeric) {
    if (!compare(connectivity(c, n.field), n.op, n.value)) return false;
  }
  if (q.orphan && c.degree !== 0) return false;
  if (q.broken && c.brokenLinks.length === 0) return false;
  for (const needle of q.text) {
    if (!textMatch(c, needle)) return false;
  }
  return true;
}
