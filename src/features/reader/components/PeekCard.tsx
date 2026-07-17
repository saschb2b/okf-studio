// Peek card — a hover preview of a concept link (the Wikipedia page-preview /
// Obsidian hover-card pattern): dwell on a link and a small card shows the
// target's title, type, description, and first lines of prose, so you can tell
// whether it's worth opening (or worth a tab) before you click. Everything is
// already parsed in memory, so the peek is instant and offline. The card is
// deliberately non-interactive (pointer-events: none): it can never trap the
// pointer, so there are no hover-persistence states to manage. See
// docs/proposals/multi-view.md.

import { useLayoutEffect, useRef } from "react";
import type { Bundle } from "@/shared/types.ts";
import { conceptById } from "@/shared/selectors.ts";
import { buildTypePalette } from "@/shared/theme.ts";
import { plainExcerpt } from "@/shared/render/markdown.ts";
import { isMac } from "@/shared/platform/platform.ts";
import "./PeekCard.css";

/** What to peek: the concept, and the viewport rect of the hovered trigger. */
export interface PeekTarget {
  id: string;
  anchor: DOMRect;
}

const CARD_WIDTH = 340;
const GAP = 8;
const MARGIN = 8;

export function PeekCard({
  target,
  bundle,
  dark,
}: {
  target: PeekTarget;
  bundle: Bundle | null;
  dark: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const c = conceptById(bundle, target.id);

  // Position after render, when the card's real height is measurable: below
  // the trigger by default, flipped above when there's no room, clamped to
  // the viewport horizontally.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { anchor } = target;
    const h = el.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const left = Math.max(MARGIN, Math.min(anchor.left, vw - CARD_WIDTH - MARGIN));
    const below = anchor.bottom + GAP;
    const top =
      below + h + MARGIN <= vh || anchor.top - GAP - h < MARGIN
        ? below
        : anchor.top - GAP - h;
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
  }, [target]);

  if (!c) return null;
  const palette = buildTypePalette(
    bundle?.concepts.map((x) => x.type) ?? [],
    dark,
  );
  const excerpt = plainExcerpt(c.body);

  return (
    <div ref={ref} className="peek-card" role="tooltip" aria-label={`Preview: ${c.title}`}>
      <div className="peek-type">
        <span
          className="peek-dot"
          style={{ background: palette.color(c.type) }}
          aria-hidden="true"
        />
        {c.type}
      </div>
      <div className="peek-title">{c.title}</div>
      {c.description && <p className="peek-desc">{c.description}</p>}
      {excerpt && <p className="peek-body">{excerpt}</p>}
      <div className="peek-hint" aria-hidden="true">
        Click to open · {isMac ? "⌘" : "Ctrl"}+click: new tab
      </div>
    </div>
  );
}
