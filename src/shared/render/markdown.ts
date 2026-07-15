// Markdown rendering, sanitization, and intra-bundle link resolution.
//
// Concept bodies and log entries are raw markdown authored inside a bundle. We
// render them with `marked`, then ALWAYS pass the result through DOMPurify so no
// untrusted HTML reaches the DOM. Links between concepts are plain markdown
// links (e.g. `../tables/x.md`); `resolveHref` turns such an href into either a
// concept id (a bundle path minus `.md`), an external URL, or a broken marker.
// See docs/features/concept-reader.md and docs/architecture/okf-parsing.md.

import { marked } from "marked";
import type { Token, TokenizerAndRendererExtension, Tokens } from "marked";
import markedFootnote from "marked-footnote";
import { markedEmoji } from "marked-emoji";
import { gemoji } from "gemoji";
import DOMPurify from "dompurify";

// GitHub's emoji shortcode set (:rocket: → 🚀), name → unicode char. Plain
// text output — no image sprites, nothing to fetch, per the offline stance.
const EMOJIS: Record<string, string> = {};
for (const entry of gemoji) {
  for (const name of entry.names) EMOJIS[name] = entry.emoji;
}
const EMOJI_RE = /:([a-z0-9_+-]+):/g;

// ---------------------------------------------------------------------------
// Math ($…$ inline, $$…$$ display), the syntax GitHub/Pandoc popularized.
//
// The extensions below only *fence off* the TeX from markdown processing (so
// `_` never becomes <em> and `\\` survives) and emit a placeholder whose text
// content is the raw TeX. The placeholder is plain markup that passes through
// DOMPurify untouched; KaTeX itself is heavy, so actual typesetting happens
// lazily in the reader's processBody pass (src/math.ts), exactly like Shiki
// highlighting. Until then — and anywhere that pass doesn't run, like the log
// view — the TeX source shows as readable text, never lost.

/** Escape text for safe embedding as HTML text content. */
function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// `$$ … $$` at block level, optionally spanning lines.
const BLOCK_MATH_RE = /^ {0,3}\$\$([\s\S]+?)\$\$[ \t]*(?:\n|$)/;
// `$…$` inline: no `$` or newline inside; `\x` escapes pass through. The
// closing `$` must not be followed by a digit, so "$5 and $10" stays currency.
const INLINE_MATH_RE = /^\$((?:\\.|[^\\$\n])+?)\$(?!\d)/;
// `$$…$$` written mid-paragraph still means display math.
const INLINE_BLOCK_MATH_RE = /^\$\$([^$]+?)\$\$/;

const blockMath: TokenizerAndRendererExtension = {
  name: "blockMath",
  level: "block",
  start: (src) => src.indexOf("$$"),
  tokenizer(src) {
    const m = BLOCK_MATH_RE.exec(src);
    if (!m) return undefined;
    return { type: "blockMath", raw: m[0], text: m[1].trim() };
  },
  renderer(token) {
    // A span (styled display:block), not a div: display math can also occur
    // mid-paragraph, and a div inside <p> would make the parser split the
    // paragraph. KaTeX's own display wrapper is a span for the same reason.
    return `<span class="math math-block">${escapeHtml(String(token.text))}</span>\n`;
  },
};

const inlineMath: TokenizerAndRendererExtension = {
  name: "inlineMath",
  level: "inline",
  start: (src) => src.indexOf("$"),
  tokenizer(src) {
    const display = INLINE_BLOCK_MATH_RE.exec(src);
    if (display) {
      return { type: "inlineMath", raw: display[0], text: display[1].trim(), display: true };
    }
    const m = INLINE_MATH_RE.exec(src);
    // Pandoc's guard: the TeX must hug its delimiters ($x$, never $ x $),
    // which keeps a stray "cost $5 … paid $ later" from becoming math.
    if (!m || /^\s|\s$/.test(m[1])) return undefined;
    return { type: "inlineMath", raw: m[0], text: m[1], display: false };
  },
  renderer(token) {
    const cls = token.display ? "math math-block" : "math math-inline";
    return `<span class="${cls}">${escapeHtml(String(token.text))}</span>`;
  },
};

// ---------------------------------------------------------------------------
// Definition lists (PHP Markdown Extra syntax): a term line followed by one or
// more `: definition` lines; consecutive groups form one <dl>. marked has no
// built-in for this — the extension follows the descriptionList pattern from
// marked's own extension docs (child tokens inline-lexed, then parseInline'd).

// One or more term/definitions groups. A term line must not itself look like
// a definition, a blank line, or another block's marker (heading, quote,
// list bullet, ordered-list number). A definition may lazily continue on
// following indented lines (the PHP Markdown Extra convention).
const DEF_LIST_RE =
  /^(?:(?!(?:[:\s#>*+-]|\d+\.[ \t]))[^\n]+\n(?::[ \t][^\n]*(?:\n|$)(?:[ \t]+\S[^\n]*(?:\n|$))*)+\n?)+/;
const DEF_LINE_RE = /^:[ \t]+/;

interface DefListToken extends Tokens.Generic {
  items: { term: Token[]; defs: Token[][] }[];
}

const defList: TokenizerAndRendererExtension = {
  name: "defList",
  level: "block",
  start(src) {
    const m = /(^|\n)(?!(?:[:\s#>*+-]|\d+\.[ \t]))[^\n]+\n:[ \t]/.exec(src);
    return m ? m.index + m[1].length : undefined;
  },
  tokenizer(src) {
    const m = DEF_LIST_RE.exec(src);
    if (!m) return undefined;
    // Assemble raw term/definition strings first (folding lazily-continued
    // indented lines into their definition), then inline-lex each whole one.
    const items: { term: string; defs: string[] }[] = [];
    for (const line of m[0].trimEnd().split("\n")) {
      const last = items.at(-1);
      if (DEF_LINE_RE.test(line)) {
        last?.defs.push(line.replace(DEF_LINE_RE, ""));
      } else if (/^[ \t]/.test(line)) {
        if (last && last.defs.length > 0) {
          last.defs[last.defs.length - 1] += ` ${line.trim()}`;
        }
      } else if (line.trim()) {
        items.push({ term: line, defs: [] });
      }
    }
    const token: DefListToken = { type: "defList", raw: m[0], items: [] };
    for (const item of items) {
      const term: Token[] = [];
      this.lexer.inline(item.term, term);
      const defs = item.defs.map((d) => {
        const def: Token[] = [];
        this.lexer.inline(d, def);
        return def;
      });
      token.items.push({ term, defs });
    }
    return token;
  },
  renderer(token) {
    const { items } = token as DefListToken;
    let out = "<dl>\n";
    for (const item of items) {
      out += `<dt>${this.parser.parseInline(item.term)}</dt>\n`;
      for (const def of item.defs) {
        out += `<dd>${this.parser.parseInline(def)}</dd>\n`;
      }
    }
    return `${out}</dl>\n`;
  },
};

marked.use(
  // Footnotes ([^1] refs + [^1]: definitions → a linked end-of-body section).
  markedFootnote(),
  // Emoji shortcodes; the renderer emits the bare unicode char.
  markedEmoji({ emojis: EMOJIS, renderer: (token) => token.emoji }),
  { extensions: [blockMath, inlineMath, defList] },
);

// GFM "alert" callouts: a blockquote whose first line is [!NOTE] / [!TIP] /
// [!IMPORTANT] / [!WARNING] / [!CAUTION] becomes a titled, themed callout.
const ALERT_LABELS: Record<string, string> = {
  note: "Note",
  tip: "Tip",
  important: "Important",
  warning: "Warning",
  caution: "Caution",
};
const ALERT_RE = /^\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*(<br\s*\/?>)?\s*/i;

/**
 * Promote GFM alert blockquotes into `<div class="callout callout-KIND">` with a
 * title row, operating on a detached DOM fragment (re-sanitized afterwards). A
 * no-op where `document` is unavailable.
 */
function transformCallouts(html: string): string {
  if (typeof document === "undefined") return html;
  const tpl = document.createElement("template");
  tpl.innerHTML = html;
  for (const bq of Array.from(tpl.content.querySelectorAll("blockquote"))) {
    const firstP = bq.querySelector("p");
    if (!firstP) continue;
    const m = ALERT_RE.exec(firstP.textContent || "");
    if (!m) continue;
    const kind = m[1].toLowerCase();
    firstP.innerHTML = firstP.innerHTML.replace(ALERT_RE, "");
    if (!firstP.textContent.trim() && !firstP.querySelector("*")) firstP.remove();

    const callout = document.createElement("div");
    callout.className = `callout callout-${kind}`;
    const title = document.createElement("p");
    title.className = "callout-title";
    title.textContent = ALERT_LABELS[kind];
    const body = document.createElement("div");
    body.className = "callout-body";
    while (bq.firstChild) body.appendChild(bq.firstChild);
    callout.append(title, body);
    bq.replaceWith(callout);
  }
  return tpl.innerHTML;
}

// A color value safe to inline verbatim into a `style` attribute: a hex color,
// or an rgb()/hsl() function restricted to digits, separators, and percent —
// no `;`, `<`, `}`, or `url(...)`, so there is no CSS-injection surface.
const SAFE_HEX = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const SAFE_FUNC = /^(?:rgb|rgba|hsl|hsla)\(\s*[0-9.,%/\s]+\)$/i;

function isSafeColor(value: string): boolean {
  return SAFE_HEX.test(value) || SAFE_FUNC.test(value);
}

/** A token reference: inline code that is exactly `{group.name}`. */
const TOKEN_REF = /^\{([a-zA-Z0-9_.-]+)\}$/;

// A hex color appearing *within* prose text (not a whole code span): `#` plus
// exactly 3/4/6/8 hex digits, word-bounded so `#abcde` or a 7-digit run never
// half-matches. The digits-only body keeps it safe to inline as a style.
const HEX_IN_TEXT = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})\b/g;

// Elements whose text must never be touched: code/pre (literal), links, and
// anything that already carries a chip.
const SKIP_TEXT_ANCESTORS = new Set(["CODE", "PRE", "A", "STYLE", "SCRIPT"]);

/** A validated-color swatch chip element. */
function makeChip(color: string): HTMLSpanElement {
  const chip = document.createElement("span");
  chip.className = "color-chip";
  chip.setAttribute("style", `background:${color}`);
  chip.setAttribute("aria-hidden", "true");
  return chip;
}

/** Prepend a validated-color swatch chip to a `<code>` element. */
function prependChip(code: Element, color: string): void {
  code.prepend(makeChip(color));
}

/**
 * Decorate hex colors that appear in plain prose (e.g. `borderColor (#d1d9e0)`)
 * with a swatch, by rewriting matching text nodes. Skips code/pre/link text (and
 * anything under them). The matched value is hex-only, so inlining it as a style
 * is safe.
 */
function decorateHexInText(root: DocumentFragment): void {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const targets: Text[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node as Text;
    if (!text.nodeValue.includes("#")) continue;
    let el = text.parentElement;
    let skip = false;
    while (el) {
      // Math placeholders hold raw TeX (`\color{#ff0000}`) — never rewrite it.
      if (SKIP_TEXT_ANCESTORS.has(el.tagName) || el.classList.contains("math")) {
        skip = true;
        break;
      }
      el = el.parentElement;
    }
    if (!skip) targets.push(text);
  }
  for (const text of targets) {
    const value = text.nodeValue;
    HEX_IN_TEXT.lastIndex = 0;
    if (!HEX_IN_TEXT.test(value)) continue;
    HEX_IN_TEXT.lastIndex = 0;
    const frag = document.createDocumentFragment();
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = HEX_IN_TEXT.exec(value)) !== null) {
      const hex = m[0];
      if (m.index > last) frag.appendChild(document.createTextNode(value.slice(last, m.index)));
      // Keep the chip and the hex on one line.
      const wrap = document.createElement("span");
      wrap.className = "color-token";
      wrap.appendChild(makeChip(hex));
      wrap.appendChild(document.createTextNode(hex));
      frag.appendChild(wrap);
      last = m.index + hex.length;
    }
    if (last < value.length) frag.appendChild(document.createTextNode(value.slice(last)));
    text.replaceWith(frag);
  }
}

/**
 * Enhance rendered content in place, reading the document as authored:
 * - inline `<code>` that is *exactly* a color (hex / rgb / hsl) gets a swatch;
 * - inline `<code>` that is a `{group.name}` token reference is resolved against
 *   `tokenIndex` (when given) — annotated with the value it resolves to, and
 *   given a swatch too when that value is itself a color;
 * - a hex color appearing in plain prose (`(#d1d9e0)`) gets a swatch too.
 *
 * Runs on a detached fragment after sanitization; a chip's only dynamic part is
 * the color, validated by {@link isSafeColor} before it reaches the inline
 * style, and the resolved value is set via `setAttribute` (auto-escaped), so
 * there is no injection surface. A no-op without a DOM (SSR / node-env tests).
 */
function decorateColorValues(html: string, tokenIndex?: Record<string, string>): string {
  if (typeof document === "undefined") return html;
  const tpl = document.createElement("template");
  tpl.innerHTML = html;
  for (const code of Array.from(tpl.content.querySelectorAll("code"))) {
    if (code.querySelector(".color-chip")) continue; // idempotent
    const value = code.textContent.trim();
    if (isSafeColor(value)) {
      prependChip(code, value);
      continue;
    }
    const ref = TOKEN_REF.exec(value);
    if (tokenIndex && ref && Object.prototype.hasOwnProperty.call(tokenIndex, ref[1])) {
      const resolved = tokenIndex[ref[1]];
      code.setAttribute("title", `resolves to ${resolved}`);
      if (isSafeColor(resolved)) prependChip(code, resolved);
    }
  }
  decorateHexInText(tpl.content);
  neutralizeMedia(tpl.content);
  containInlineStyles(tpl.content);
  return tpl.innerHTML;
}

/**
 * Defuse media loading at render time — the offline stance: nothing in a body
 * may auto-fetch. For `<img>` (markdown or embedded HTML alike), a non-`data:`
 * `src` moves to `data-mdsrc` and `srcset` is dropped; the reader then resolves
 * each image — inlining a local bundle file, or offering a remote one as an
 * external link. Embedded `<video>`/`<audio>`/`<source>`/`<track>` have no
 * offline resolver, so their fetching attributes are simply removed and the
 * players render inert. Inline `data:` sources are left as-is.
 */
function neutralizeMedia(root: DocumentFragment): void {
  for (const img of Array.from(root.querySelectorAll("img"))) {
    const src = img.getAttribute("src");
    if (src && !/^data:/i.test(src)) {
      img.setAttribute("data-mdsrc", src);
      img.removeAttribute("src");
    }
    img.removeAttribute("srcset");
  }
  for (const el of Array.from(root.querySelectorAll("video, audio, source, track"))) {
    for (const attr of ["src", "srcset", "poster"]) {
      const value = el.getAttribute(attr);
      if (value && !/^data:/i.test(value)) el.removeAttribute(attr);
    }
  }
}

/**
 * Contain embedded HTML's inline styles to the prose flow. `style` attributes
 * survive sanitization (embedded HTML legitimately uses them for color and
 * alignment), but bundle content must never escape its box and overlay the
 * app's UI — so out-of-flow positioning is dropped. `relative` stays: it can't
 * leave the reader column.
 */
function containInlineStyles(root: DocumentFragment): void {
  for (const el of Array.from(root.querySelectorAll<HTMLElement>("[style]"))) {
    const position = el.style.getPropertyValue("position");
    if (/^(fixed|sticky|absolute)$/i.test(position.trim())) {
      el.style.removeProperty("position");
    }
  }
}

/** Slugify heading text into a stable id (matches the reader's outline). */
function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "section"
  );
}

/**
 * Prepare body headings *in the HTML string* — demote, slug, and anchor them —
 * so the result is inherent to the rendered DOM (scroll-spy, the outline,
 * anchor permalinks, and hash links all rely on it). Baking it here — rather
 * than mutating the injected DOM at mount — keeps it present no matter how
 * React re-applies the `dangerouslySetInnerHTML` body.
 *
 * - Body `<h1>`s demote to `<h2>`: the page's one h1 is the concept title, and
 *   OKF bodies conventionally use `# Section` headings (`# Schema`,
 *   `# Examples`) — left as h1 they'd rival the title and, worse, sit outside
 *   the outline/anchor pass entirely.
 * - Every h2–h6 gets a deduped slug id and a hover permalink (`.heading-anchor`)
 *   that scrolls to the section; the click is routed by the reader's delegated
 *   body handler.
 */
function slugifyHeadings(html: string): string {
  if (typeof document === "undefined") return html;
  const tpl = document.createElement("template");
  tpl.innerHTML = html;
  for (const h1 of Array.from(tpl.content.querySelectorAll("h1"))) {
    const h2 = document.createElement("h2");
    while (h1.firstChild) h2.appendChild(h1.firstChild);
    h1.replaceWith(h2);
  }
  const used = new Set<string>();
  for (const h of Array.from(tpl.content.querySelectorAll("h2, h3, h4, h5, h6"))) {
    // The footnotes section's heading keeps its `footnote-label` id (every
    // ref's aria-describedby points at it) and gets no permalink; dropping
    // the extension's sr-only class shows it as a normal section heading.
    if (h.closest("[data-footnotes]")) {
      h.classList.remove("sr-only");
      if (!h.classList.length) h.removeAttribute("class");
      continue;
    }
    const base = slugify(h.textContent);
    let id = base;
    let n = 2;
    while (used.has(id)) id = `${base}-${n++}`;
    used.add(id);
    h.id = id;
    const a = document.createElement("a");
    a.className = "heading-anchor";
    a.href = `#${id}`;
    a.textContent = "#";
    a.setAttribute("aria-label", `Link to section: ${h.textContent}`);
    h.appendChild(a);
  }
  return tpl.innerHTML;
}

/**
 * A plain-text excerpt of a markdown body for the reader's peek card — the
 * first real prose, markdown syntax stripped, clamped to `max` characters at a
 * word boundary. Pure string work (no DOM), so it runs anywhere and is cheap
 * enough to compute on hover. See docs/proposals/multi-view.md.
 */
export function plainExcerpt(md: string, max = 280): string {
  const text = md
    // Fenced code blocks: drop wholesale — code is noise in a glimpse.
    .replace(/```[\s\S]*?(```|$)/g, " ")
    // Display math likewise; inline math keeps its TeX minus the delimiters.
    .replace(/\$\$[\s\S]*?(\$\$|$)/g, " ")
    .replace(/\$(\S(?:[^$\n]*?\S)?)\$/g, "$1")
    // Embedded HTML: comments vanish, tags drop but keep their text content
    // (`<kbd>Ctrl</kbd>` reads as `Ctrl`). Prose like "a < b" is untouched —
    // the tag pattern requires a letter (or /) right after the bracket.
    .replace(/<!--[\s\S]*?(-->|$)/g, " ")
    .replace(/<\/?[a-zA-Z][^>\n]*>/g, "")
    // Images (before links: same bracket syntax) and links → their alt/text.
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    // Footnotes: a [^ref] marker vanishes; a definition keeps only its prose.
    .replace(/\[\^[^\]\s]+\]:?/g, "")
    // Heading/blockquote/list/definition markers at line starts, and
    // table/rule lines. The task-list checkbox goes with its list marker.
    .replace(/^\s{0,3}(#{1,6}\s+|>\s?|[-*+]\s+(\[[ xX]\]\s+)?|\d+\.\s+|:\s+)/gm, "")
    .replace(/^\s*\|.*\|\s*$/gm, " ")
    .replace(/^\s*([-=_*]\s*){3,}$/gm, " ")
    // GFM alert markers ([!NOTE] etc.) read as noise without their styling.
    .replace(/\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]/gi, "")
    // Emoji shortcodes read as their character (unknown names stay literal).
    .replace(EMOJI_RE, (m, name: string) => EMOJIS[name] ?? m)
    // Inline emphasis/code tokens → bare text.
    .replace(/(\*\*|__|[*_~`])/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= max) return text;
  // Clamp at a word boundary, then signal the cut.
  const cut = text.slice(0, max + 1);
  const atWord = cut.slice(0, cut.lastIndexOf(" "));
  return `${(atWord.length > max / 2 ? atWord : cut.slice(0, max)).trimEnd()}…`;
}

/**
 * Render markdown to sanitized, safe-to-inject HTML. When `tokenIndex` is given
 * (the reader passes the bundle's design-token index), `{group.name}` references
 * in inline code are resolved and annotated. See docs/features/design-system-rendering.md.
 */
export function renderMarkdown(md: string, tokenIndex?: Record<string, string>): string {
  // `async: false` forces the synchronous overload (string, not Promise).
  // `gfm` enables tables/strikethrough; `breaks:false` keeps authored single
  // newlines from becoming spurious <br>.
  const html = marked.parse(md, {
    async: false,
    gfm: true,
    breaks: false,
  });
  const clean = DOMPurify.sanitize(slugifyHeadings(transformCallouts(html)), {
    USE_PROFILES: { html: true },
  });
  // Decorate after sanitizing: the chip is fully constructed here from a
  // strictly-validated color, so it adds no untrusted markup.
  return decorateColorValues(clean, tokenIndex);
}

/** Outcome of resolving a markdown link href found inside a concept body. */
export type ResolvedHref =
  | { kind: "concept"; id: string }
  | { kind: "external"; url: string }
  | { kind: "broken"; href: string };

/** The directory portion of a concept id (path), or "" for a root-level id. */
function dirOf(conceptId: string): string {
  const slash = conceptId.lastIndexOf("/");
  return slash === -1 ? "" : conceptId.slice(0, slash);
}

/** Normalize a POSIX-style path, collapsing "." and ".." segments. */
function normalizePath(path: string): string {
  const out: string[] = [];
  for (const seg of path.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") {
      // Pop a real segment if we have one; otherwise the "../" escapes the
      // bundle root and we keep it so the caller can treat it as broken.
      if (out.length && out[out.length - 1] !== "..") out.pop();
      else out.push("..");
    } else {
      out.push(seg);
    }
  }
  return out.join("/");
}

/**
 * Resolve a markdown link href, relative to the concept it was found in.
 *
 * - http(s):// and mailto: → external (opened in the system browser).
 * - bundle-absolute `/a/b.md` → resolved from the bundle root.
 * - relative `x.md` / `../d/x.md` → resolved from the linking concept's dir.
 * - trailing `#anchor` is stripped; a trailing `.md` is dropped to yield the id.
 *
 * Returns `kind: "concept"` with the resolved id; the caller verifies that id
 * exists in the bundle and renders unknown ids with broken styling. An href
 * that resolves to nothing usable (empty, or escaping the root) is "broken".
 */
export function resolveHref(href: string, fromConceptId: string): ResolvedHref {
  const raw = href.trim();
  if (!raw) return { kind: "broken", href };

  // External schemes and protocol-relative URLs open in the system browser.
  if (/^(https?:|mailto:|tel:)/i.test(raw) || raw.startsWith("//")) {
    return { kind: "external", url: raw };
  }

  // A pure in-page anchor has no concept target.
  if (raw.startsWith("#")) return { kind: "broken", href };

  // Strip any query/fragment; concept targets are file paths, not anchors.
  const path = raw.split("#")[0].split("?")[0];
  if (!path) return { kind: "broken", href };

  // Resolve against the bundle root (absolute) or the linking concept's dir.
  let combined: string;
  if (path.startsWith("/")) {
    combined = path.slice(1);
  } else {
    const dir = dirOf(fromConceptId);
    combined = dir ? `${dir}/${path}` : path;
  }

  const normalized = normalizePath(combined);
  // Escaped the bundle root, or normalized to nothing → unresolvable.
  if (!normalized || normalized.startsWith("..")) {
    return { kind: "broken", href };
  }

  // Drop the conventional .md extension to get the concept id.
  const id = normalized.endsWith(".md") ? normalized.slice(0, -3) : normalized;
  if (!id) return { kind: "broken", href };

  return { kind: "concept", id };
}

/**
 * Resolve a companion-asset href (an ODSF `*.example.html` or a `styles/*.css`
 * it links) to a normalized **bundle-relative path**, keeping the extension —
 * the form `read_asset` expects. Like {@link resolveHref} but for assets, not
 * concepts. Returns null for external/data hrefs or anything escaping the root.
 *
 * `fromId` is the path the href is relative to: a concept id for an `examples`
 * entry or a body link, or an asset's own bundle path when resolving the
 * stylesheets that asset links.
 */
export function resolveAssetHref(href: string, fromId: string): string | null {
  const raw = href.trim();
  if (!raw) return null;
  if (/^(https?:|mailto:|tel:|data:)/i.test(raw) || raw.startsWith("//")) return null;

  const path = raw.split("#")[0].split("?")[0];
  if (!path) return null;

  let combined: string;
  if (path.startsWith("/")) {
    combined = path.slice(1);
  } else {
    const dir = dirOf(fromId);
    combined = dir ? `${dir}/${path}` : path;
  }

  const normalized = normalizePath(combined);
  if (!normalized || normalized.startsWith("..")) return null;
  return normalized;
}
