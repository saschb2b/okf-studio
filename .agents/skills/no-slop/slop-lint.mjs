#!/usr/bin/env node
// slop-lint: the machine-checkable subset of the no-slop rules.
//
// Two rule families, scored together as violations per 100 words:
//   STE     the mechanical half of ASD-STE100 (sentence length, active voice,
//           one action per verb, no semicolons, plain words, short paragraphs)
//   tells   the no-slop table (em dash, hedges, marketing adjectives, hype)
//
// The absolute score means little. The delta between a draft and its revision
// is the signal: lint, apply the skill, lint again.
//
// Run: node slop-lint.mjs draft.md [more.md ...]
//      node slop-lint.mjs --strict draft.md     # 20-word cap, no contractions
//      cat draft.md | node slop-lint.mjs
// Flags: --strict  --json  --max <score>  --top <n>

import { readFileSync } from "node:fs";

const IRREGULAR_PP =
  "done|made|sent|read|built|kept|held|set|put|run|written|shown|given|taken|found|got|gotten|seen|known|thrown|drawn|left|lost|meant|paid|told|brought";
// Participles that read as adjectives after "to be", so not passive voice.
const ADJECTIVAL_PP =
  "interested|excited|complicated|related|limited|detailed|advanced|dedicated|sophisticated|tired|pleased|involved|based|located|prepared|required|supposed|used to|aware|concerned";
const BE = "am|is|are|was|were|be|been|being|isn't|aren't|wasn't|weren't";
const ADVERB = "(?:not|also|only|now|already|still|never|always|often|then|therefore)\\s+";
// "-ing" words that read as nouns or adjectives after "to be".
const NOUN_ING =
  /\s(?:marketing|engineering|following|remaining|existing|interesting|outstanding|willing|pending|leading|trailing|underlying|surprising|confusing|missing)$/i;

// id, pattern, and the fix to print. Every word appears in exactly one rule so
// nothing double-counts.
const RULES = [
  // --- STE mechanics ---
  { id: "semicolon", re: /;/g, fix: "write two sentences" },
  {
    id: "contraction",
    re: /\b\w+['’](?:t|re|ve|ll|d|s|m)\b/gi,
    fix: "expand it",
    strictOnly: true,
  },
  {
    id: "passive_voice",
    re: new RegExp(
      `\\b(?:${BE})\\s+(?:${ADVERB})*(?!(?:${ADJECTIVAL_PP})\\b)(?:\\w+ed|${IRREGULAR_PP})\\b`,
      "gi",
    ),
    fix: "name the actor and make it active",
    // "is Simplified Technical English" is a proper noun, not a passive.
    reject: (m) => /\s[A-Z]/.test(m),
  },
  {
    id: "ing_main_verb",
    re: new RegExp(`\\b(?:${BE})\\s+(?:${ADVERB})*\\w+ing\\b`, "gi"),
    fix: "use the simple tense",
    // "are marketing adjectives" is a noun, not a progressive verb.
    reject: (m) => /\s[A-Z]/.test(m) || NOUN_ING.test(m),
  },
  {
    id: "nominalization",
    re: /\b(?:perform(?:s|ed|ing)?|conduct(?:s|ed|ing)?|carr(?:y|ies|ied) out|make(?:s)? use of|provide(?:s|d)? (?:support|coverage) for)\b|\b(?:the|an?)\s+(?:\w+\s+)?(?:analysis|utilization|implementation|verification|validation|configuration|execution|calculation|evaluation|integration|generation|creation|deletion|modification|migration|optimization|examination|investigation|installation|initialization|computation|comparison|replacement|removal|cancellation|transformation|preparation|registration|authentication|authorization|deployment|enforcement|measurement|management|assessment|improvement|refinement|adjustment|enhancement|avoidance)\s+of\b/gi,
    fix: "use the verb for the action",
  },
  {
    id: "phrasal_verb",
    re: /\b(?:spin(?:s|ning)? up|spin(?:s)? down|reach(?:es|ing)? out|div(?:e|es|ing) into|kick(?:s|ed)? off|roll(?:s|ed|ing)? out|tear(?:s)? down|ramp(?:s|ing)? up|circle back|drill(?:s|ing)? down|surface(?:s|d)? up|stand(?:s)? up a)\b/gi,
    fix: "the plain verb (start, contact, read, deploy)",
  },
  {
    id: "long_word",
    re: /\b(?:utiliz\w+|commenc\w+|initiat\w+|facilitat\w+|ensur\w+|obtain\w*|acquir\w+|demonstrat\w+|aforementioned|henceforth|therein|whilst|amongst|comprehensive(?:ly)?|numerous)\b|\b(?:prior to|subsequent to|in order to|due to the fact that|in the event that|at this point in time|a variety of)\b/gi,
    fix: "the short common word (use, start, make sure, get, show, before, to)",
  },

  // --- no-slop tells ---
  { id: "em_dash", re: /[—–]/g, fix: "period, comma, colon, or parentheses" },
  {
    id: "not_x_but_y",
    re: /\b(?:not|isn['’]t|aren['’]t|wasn['’]t|doesn['’]t)\s+(?:just|only|merely|simply)\b/gi,
    fix: "state Y plainly",
  },
  {
    id: "throat_clearing",
    re: /(?:^|(?<=[.!?]\s))(?:in today['’]s|in the world of|in an era of|in the modern|when it comes to|as we (?:all )?know|at its core|it goes without saying)\b/gi,
    fix: "delete, start at the point",
  },
  {
    id: "self_summary",
    re: /(?:^|(?<=[.!?]\s))(?:in conclusion|in summary|to sum up|all in all|at the end of the day|ultimately,|overall,)/gi,
    fix: "delete, end on the last real point",
  },
  {
    id: "transition_filler",
    re: /\b(?:moreover|furthermore|additionally|notably|that being said)\b/gi,
    fix: "delete, the next sentence stands alone",
  },
  {
    id: "hedge",
    re: /\b(?:it(?:'s| is) important to note|it should be noted|it(?:'s| is) worth (?:noting|mentioning)|please note that|as (?:mentioned|noted) (?:above|earlier)|arguably|may potentially)\b/gi,
    fix: "cut it, or make the qualification specific",
  },
  {
    id: "validation",
    re: /\b(?:great question|excellent question|you(?:'re| are) absolutely right|good catch|i hope this helps)\b/gi,
    fix: "answer the thing",
  },
  {
    id: "slop_vocab",
    re: /\b(?:delv\w+|realm|landscape|tapestry|intricate|crucial|vital|foster(?:s|ing)?|harness(?:es|ing)?|leverag\w+|streamlin\w+|elevat\w+|myriad|plethora)\b/gi,
    fix: "the plain word",
  },
  {
    id: "marketing_adjective",
    re: /\b(?:seamless(?:ly)?|robust|powerful|cutting-edge|effortless(?:ly)?|world-class|next-generation|revolutionary|blazing|lightning-fast|turnkey|best-in-class|state-of-the-art|game-chang\w+|first-class|battle-tested|enterprise-grade|supercharg\w+|unlock(?:s|ing)?|unleash(?:es|ing)?|empower(?:s|ing)?|delightful)\b/gi,
    fix: "name the measurable property, or cut",
  },
  {
    id: "significance_inflation",
    re: /\b(?:(?:stands|serves) as a testament|testament to|marks a pivotal|underscor\w+ the importance|enduring (?:legacy|commitment)|cement(?:s|ing)? its place)\b/gi,
    fix: "state the plain fact",
  },
  {
    id: "inflated_copula",
    re: /\b(?:boasts?|serves as|is home to)\b/gi,
    fix: 'restore "is" or "has"',
  },
  {
    id: "vague_authority",
    re: /\b(?:studies show|research shows|experts agree|it is widely (?:regarded|considered)|it is well known)\b/gi,
    fix: "name the source, or cut the claim",
  },
  {
    id: "participle_tail",
    re: /,\s*(?:further |thereby |thus )?(?:cementing|highlighting|underscoring|reflecting|showcasing|solidifying|contributing to|making it)\b/gi,
    fix: "end the sentence at the fact",
  },
  {
    id: "false_inclusivity",
    re: /\bwhether you(?:['’]re| are)\b/gi,
    fix: "say who it is actually for",
  },
  {
    id: "chatbot_scaffolding",
    re: /\b(?:let['’]s (?:dive|get started|take a look)|as you can see|without further ado|there you have it|happy coding|buckle up|in this (?:article|post),? we)\b/gi,
    fix: "delete, start and end at the content",
  },
  {
    id: "negative_hype",
    re: /\b(?:say goodbye to|gone are the days|forget about)\b/gi,
    fix: "state what the thing does",
  },
  {
    id: "forced_enumeration",
    re: /\b(?:here are (?:the )?(?:\d+|two|three|four|five|six)|there are (?:\d+|two|three|four|five|six) (?:main |key |primary )?(?:reasons|benefits|ways|things|factors))\b/gi,
    fix: "make the points, drop the announced count",
  },
];

// Keep newline count stable so reported line numbers stay honest.
const hollow = (m) => m.replace(/[^\n]/g, " ");

function stripCode(text) {
  return text
    .replace(/^---\r?\n[\s\S]*?\r?\n---(?=\r?\n)/, hollow) // frontmatter is metadata
    .replace(/^ {0,3}(```|~~~)[\s\S]*?^ {0,3}\1/gm, hollow)
    .replace(/`[^`\n]*`/g, hollow)
    .replace(/<!--[\s\S]*?-->/g, hollow)
    .replace(/\]\([^)\s]+\)/g, "]()") // link targets are not prose
    .replace(/^ {4,}\S.*$/gm, hollow); // indented code blocks
}

function sentences(text) {
  const out = [];
  text.split("\n").forEach((raw, i) => {
    let s = raw.trim();
    if (!s || /^\|/.test(s) || /^(?:[-*_]\s*){3,}$/.test(s)) return;
    s = s
      .replace(/^#{1,6}\s+/, "")
      .replace(/^>\s?/, "")
      .replace(/^(?:[-*+]|\d+[.)])\s+/, "");
    if (!s) return;
    // The closing-quote class matters: a sentence ending `word."` puts the
    // quote, not the period, before the space, so it would never split.
    for (const part of s.split(/(?<=[.!?]["'”’)\]]?)\s+(?=["'“([]?[A-Z0-9])/)) {
      const t = part.trim();
      if (t) out.push({ text: t, line: i + 1 });
    }
  });
  return out;
}

const words = (s) => (s.match(/[A-Za-z0-9][A-Za-z0-9'’\-/]*/g) || []).length;

function lint(text, { strict = false } = {}) {
  const prose = stripCode(text);
  const sents = sentences(prose);
  const total = sents.reduce((n, s) => n + words(s.text), 0) || 1;
  const cap = strict ? 20 : 25;
  const found = new Map(); // rule id -> [{line, sample}]
  const add = (id, line, sample, fix) => {
    if (!found.has(id)) found.set(id, { fix, hits: [] });
    found.get(id).hits.push({ line, sample });
  };

  for (const s of sents) {
    const n = words(s.text);
    if (n > cap) add(`long_sentence(>${cap}w)`, s.line, `${n} words`, "split it, one idea per sentence");
    // One span, one violation. Longest match wins, so "the utilization of"
    // counts once as a nominalization rather than again as a long word.
    const matches = [];
    for (const rule of RULES) {
      if (rule.strictOnly && !strict) continue;
      for (const m of s.text.matchAll(rule.re)) {
        if (rule.reject?.(m[0])) continue;
        matches.push({ rule, start: m.index, end: m.index + m[0].length, text: m[0].trim() });
      }
    }
    matches.sort((a, b) => b.end - b.start - (a.end - a.start) || a.start - b.start);
    const taken = [];
    for (const m of matches) {
      if (taken.some((t) => m.start < t.end && t.start < m.end)) continue;
      taken.push(m);
      add(m.rule.id, s.line, m.text, m.rule.fix);
    }
  }

  // Structural rules read the raw text, since blank lines and list shape matter.
  const lines = text.split("\n");
  lines.forEach((l, i) => {
    if (/^#{1,6}\s/.test(l) && /\p{Extended_Pictographic}/u.test(l))
      add("emoji_heading", i + 1, l.trim().slice(0, 40), "delete the emoji");
  });
  const labelled = lines.filter((l) => /^\s*[-*+]\s+\*\*[^*]+\*\*\s*[:.]/.test(l)).length;
  if (labelled >= 3)
    add("bold_label_list", 0, `${labelled} items`, "prose, or plain bullets without the bold label");
  // Group the already-stripped lines into blocks, so frontmatter and fenced
  // code do not read as one very long paragraph. Grouping by line rather than
  // by a split on the text keeps the reported line number the real one.
  const proseLines = prose.split("\n");
  let block = [];
  let blockStart = 0;
  const flushBlock = () => {
    const text = block.join("\n");
    const ss = sentences(text);
    if (ss.length > 6 && !/^\s*(?:[-*+]|\d+[.)]|\||#|>)/m.test(text))
      add("long_paragraph(>6s)", blockStart, `${ss.length} sentences`, "split the topic");
    block = [];
  };
  proseLines.forEach((l, i) => {
    if (l.trim()) {
      if (!block.length) blockStart = i + 1;
      block.push(l);
    } else flushBlock();
  });
  flushBlock();

  const violations = [...found.entries()]
    .map(([id, v]) => ({ id, count: v.hits.length, fix: v.fix, hits: v.hits }))
    .sort((a, b) => b.count - a.count || a.id.localeCompare(b.id));
  const count = violations.reduce((n, v) => n + v.count, 0);

  return {
    mode: strict ? "strict" : "flavored",
    words: total,
    sentences: sents.length,
    longestSentence: sents.reduce((m, s) => Math.max(m, words(s.text)), 0),
    violations,
    total: count,
    score: Math.round((count * 1000) / total) / 10,
  };
}

function print(name, r, top) {
  console.log(
    `${name}  words=${r.words}  violations=${r.total}  score=${r.score.toFixed(2)}/100w  longest=${r.longestSentence}w  (${r.mode})`,
  );
  for (const v of r.violations.slice(0, top)) {
    const where = v.hits
      .slice(0, 4)
      .map((h) => (h.line ? `L${h.line}` : "") + (h.sample ? ` "${h.sample}"` : ""))
      .join(", ");
    console.log(`  ${v.id.padEnd(26)} ${String(v.count).padStart(3)}  ${where}`);
    console.log(`  ${"".padEnd(26)}      -> ${v.fix}`);
  }
  if (r.violations.length > top) console.log(`  ... ${r.violations.length - top} more categories`);
}

const argv = process.argv.slice(2);
const opts = { strict: false, json: false, max: null, top: 12 };
const files = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === "--strict") opts.strict = true;
  else if (a === "--json") opts.json = true;
  else if (a === "--max") opts.max = Number(argv[++i]);
  else if (a === "--top") opts.top = Number(argv[++i]);
  else files.push(a);
}

const read = (f) => readFileSync(f === "-" ? 0 : f, "utf8");
const targets = files.length ? files : ["-"];
const reports = targets.map((f) => [f === "-" ? "(stdin)" : f, lint(read(f), opts)]);

if (opts.json) console.log(JSON.stringify(Object.fromEntries(reports), null, 2));
else for (const [name, r] of reports) print(name, r, opts.top);

const worst = Math.max(...reports.map(([, r]) => r.score));
process.exit(opts.max !== null && worst > opts.max ? 1 : 0);
