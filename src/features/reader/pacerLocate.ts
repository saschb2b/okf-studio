// Finding a stream token in the *rendered* body, so the guided pacer can draw a
// beam over the real prose.
//
// The constraint that shapes this: the reader bakes everything the body shows
// into one sanitized HTML string and re-applies it wholesale, so nothing may be
// appended to or mutated in the live body — anything added there is wiped on the
// next render (see the note in Reader.tsx). A Range plus its client rects gives
// the geometry with no DOM change at all.
//
// See docs/features/speed-reading.md.

import type { ReadingStream, ReadingToken } from "@/features/reader/speedread.ts";

/** Block-level elements a rendered concept body can put a paragraph of prose in. */
const BLOCK_SELECTOR =
  "p, h1, h2, h3, h4, h5, h6, li, blockquote, pre, table, .katex-display, .mermaid";

/** Chrome the renderer bakes into the body that is not part of the prose. */
const NOT_PROSE = ".heading-anchor, .code-copy, .sr-only, .md-img-broken";

/** The DOM element kinds a non-prose block can render as. */
const PAUSE_TAGS: Record<string, string[]> = {
  code: ["PRE"],
  table: ["TABLE"],
  math: ["DIV", "SPAN", "P"],
  mermaid: ["DIV", "SVG", "P"],
};

/** An element's visible text, collapsed like the stream's, with each character
 *  mapped back to the text node it came from. */
export interface MappedText {
  text: string;
  nodes: Text[];
  offsets: number[];
}

/**
 * Walk an element's text nodes into a single space-collapsed string, keeping a
 * per-character pointer back into the DOM. The collapsing has to match what
 * `plainBlocks` does to the source, or the offsets will not line up.
 */
export function mapElementText(el: Element): MappedText {
  const nodes: Text[] = [];
  const offsets: number[] = [];
  let text = "";
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const inChrome = node.parentElement?.closest(NOT_PROSE) != null;
      return inChrome ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
    },
  });
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const data = (node as Text).data;
    for (let i = 0; i < data.length; i++) {
      const ch = data[i];
      if (/\s/.test(ch)) {
        // A run of whitespace is one space, and never a leading one.
        if (text.length === 0 || text.endsWith(" ")) continue;
        text += " ";
      } else {
        text += ch;
      }
      nodes.push(node as Text);
      offsets.push(i);
    }
  }
  // Drop a trailing space so the mapping matches a trimmed block text.
  if (text.endsWith(" ")) {
    text = text.slice(0, -1);
    nodes.pop();
    offsets.pop();
  }
  return { text, nodes, offsets };
}

/**
 * Line up the stream's blocks with the body's elements. Rendering adds elements
 * the stream has no block for (a footnote list, a wrapper) and can drop ones it
 * does, so this is a forward scan that matches on text rather than an index
 * mapping — a block that cannot be found is left null and simply goes unpaced.
 */
export function matchBlockElements(body: Element, stream: ReadingStream): (Element | null)[] {
  const candidates = Array.from(body.querySelectorAll(BLOCK_SELECTOR));
  const out: (Element | null)[] = [];
  let cursor = 0;
  for (const block of stream.blocks) {
    let found: Element | null = null;
    for (let i = cursor; i < candidates.length; i++) {
      const el = candidates[i];
      const hit = block.pause
        ? (PAUSE_TAGS[block.kind] ?? []).includes(el.tagName)
        : mapElementText(el).text.startsWith(block.text);
      if (hit) {
        found = el;
        cursor = i + 1;
        break;
      }
    }
    out.push(found);
  }
  return out;
}

/**
 * The on-screen box of one token inside its element. Offsets come from the
 * stream first and a text search second: rendering can insert characters the
 * stripper removed (a footnote marker, a swatch), which shifts them.
 */
export function rectForToken(token: ReadingToken, mapped: MappedText): DOMRect | null {
  let start = token.start;
  if (mapped.text.slice(start, start + token.text.length) !== token.text) {
    // Search near where the stream expected it before falling back to the
    // first occurrence, so a repeated word still lands on the right one.
    const near = mapped.text.indexOf(token.text, Math.max(0, token.start - 48));
    start = near >= 0 ? near : mapped.text.indexOf(token.text);
    if (start < 0) return null;
  }
  const end = start + token.text.length;
  if (end > mapped.nodes.length) return null;
  const range = document.createRange();
  range.setStart(mapped.nodes[start], mapped.offsets[start]);
  range.setEnd(mapped.nodes[end - 1], mapped.offsets[end - 1] + 1);
  // A token that wraps across a line break gets its first line: the beam marks
  // where to look, and looking at the start of the word is right. Environments
  // without layout (jsdom) implement neither call, and get no beam.
  const rects = typeof range.getClientRects === "function" ? range.getClientRects() : null;
  const rect =
    rects && rects.length > 0
      ? rects[0]
      : typeof range.getBoundingClientRect === "function"
        ? range.getBoundingClientRect()
        : null;
  if (!rect) return null;
  // A zero box means the text is not laid out (hidden, or jsdom): nothing to draw.
  return rect.width > 0 || rect.height > 0 ? rect : null;
}

/** A cache of element text maps, rebuilt whenever the body is re-rendered. */
export class PacerIndex {
  private elements: (Element | null)[] = [];
  private maps = new Map<Element, MappedText>();
  private body: Element | null = null;
  private stream: ReadingStream | null = null;

  /** Rebuild when the body element, its content, or the stream has changed. */
  sync(body: Element, stream: ReadingStream): void {
    const stale =
      this.body !== body ||
      this.stream !== stream ||
      this.elements.some((el) => el !== null && !body.contains(el));
    if (!stale) return;
    this.body = body;
    this.stream = stream;
    this.elements = matchBlockElements(body, stream);
    this.maps.clear();
  }

  element(blockIndex: number): Element | null {
    return this.elements[blockIndex] ?? null;
  }

  rect(token: ReadingToken): DOMRect | null {
    const el = this.element(token.blockIndex);
    if (!el) return null;
    let mapped = this.maps.get(el);
    if (!mapped) {
      mapped = mapElementText(el);
      this.maps.set(el, mapped);
    }
    return rectForToken(token, mapped);
  }
}
