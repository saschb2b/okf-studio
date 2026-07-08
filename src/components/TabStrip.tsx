// Reader tab strip — browser-style tabs above the reader pane, one per open
// concept, each with its own history (docs/proposals/multi-view.md). Quiet
// chrome: the strip only exists at two or more tabs, so a single-document
// session looks exactly like the tab-less app. Middle-click closes a tab,
// dragging one sideways reorders it (the VS Code live swap), and the trailing
// control undocks the active tab into its own OS window.

import { SquareArrowOutUpRight, X } from "lucide-react";
import { useRef } from "react";
import type { MouseEvent, PointerEvent } from "react";
import { useApp } from "../store.tsx";
import { conceptById, titleOf } from "../selectors.ts";
import { buildTypePalette, resolveDark } from "../theme.ts";
import "./TabStrip.css";

/** Pointer x needed before a press becomes a drag (vs a sloppy click). */
const DRAG_THRESHOLD = 5;

/**
 * Where a dragged tab belongs given the other tabs' horizontal midpoints:
 * crossing a neighbor's midpoint trades places with it (the VS Code/browser
 * live-swap rule). Pure, so the geometry is unit-testable without a layout
 * engine. `mids` are the midpoints of ALL tabs in current order; `from` is the
 * dragged tab's current index; `x` the pointer position.
 */
export function dropIndexFor(mids: number[], from: number, x: number): number {
  let to = from;
  // Crossed left neighbors' midpoints → take the leftmost crossed slot.
  for (let i = 0; i < from; i++) {
    if (x < mids[i]) {
      to = i;
      break;
    }
  }
  // Crossed right neighbors' midpoints → take the rightmost crossed slot.
  for (let i = mids.length - 1; i > from; i--) {
    if (x > mids[i]) {
      to = i;
      break;
    }
  }
  return to;
}

export function TabStrip() {
  const { state, actions } = useApp();
  const bundle = state.bundle;
  const stripRef = useRef<HTMLDivElement>(null);
  // In-flight drag: which tab, where it started, and whether it crossed the
  // threshold (so pointerup can tell a drag from a click).
  const dragRef = useRef<{ tabId: number; startX: number; dragging: boolean } | null>(
    null,
  );
  if (state.tabs.length < 2) return null;

  const palette = buildTypePalette(
    bundle?.concepts.map((c) => c.type) ?? [],
    resolveDark(state.settings.theme),
  );

  // Close on middle-click, the browser/VS Code gesture. Handled as
  // mousedown (suppressing the default autoscroll/paste behaviors, which
  // otherwise swallow the gesture) + mouseup (the actual close, as VS Code
  // does) on the whole tab — auxclick alone is not reliably delivered inside
  // a scrollable strip.
  function onMiddleDown(e: MouseEvent) {
    if (e.button === 1) e.preventDefault();
  }
  function onMiddleUp(e: MouseEvent, tabId: number) {
    if (e.button === 1) actions.closeTab(tabId);
  }

  // Drag-to-reorder, on the tab's main button via pointer capture (HTML5
  // drag-and-drop is unreliable in webviews and drags a ghost image around).
  // Reorders live as the pointer crosses a neighbor's midpoint.
  function onTabPointerDown(e: PointerEvent<HTMLButtonElement>, tabId: number) {
    if (e.button !== 0) return;
    dragRef.current = { tabId, startX: e.clientX, dragging: false };
    // jsdom has no pointer capture; the gesture degrades to click-only there.
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- the DOM lib types it as always-present, but jsdom omits it
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }
  function onTabPointerMove(e: PointerEvent<HTMLButtonElement>, tabId: number) {
    const d = dragRef.current;
    if (d?.tabId !== tabId) return;
    if (!d.dragging && Math.abs(e.clientX - d.startX) < DRAG_THRESHOLD) return;
    d.dragging = true;
    const els = Array.from(
      stripRef.current?.querySelectorAll<HTMLElement>("[data-tab-id]") ?? [],
    );
    const from = els.findIndex((el) => Number(el.dataset.tabId) === tabId);
    if (from < 0) return;
    const mids = els.map((el) => {
      const r = el.getBoundingClientRect();
      return r.left + r.width / 2;
    });
    const to = dropIndexFor(mids, from, e.clientX);
    if (to !== from) actions.moveTab(tabId, to);
  }
  function onTabPointerUp() {
    if (!dragRef.current) return;
    if (dragRef.current.dragging) {
      // Keep `dragging` readable by the click event that follows this
      // pointerup synchronously (so it isn't treated as an activate), then
      // clear — a stale flag must never swallow a later keyboard activation.
      setTimeout(() => {
        dragRef.current = null;
      }, 0);
    } else {
      dragRef.current = null;
    }
  }
  function onTabClick(tabId: number) {
    // A drag that ends over the tab still fires a click — don't activate.
    if (dragRef.current?.dragging) {
      dragRef.current = null;
      return;
    }
    dragRef.current = null;
    actions.activateTab(tabId);
  }

  return (
    <div className="tab-strip" role="tablist" aria-label="Open concepts">
      <div ref={stripRef} className="tab-strip-tabs">
        {state.tabs.map((t) => {
          const concept = t.conceptId ? conceptById(bundle, t.conceptId) : null;
          const title = t.conceptId ? titleOf(bundle, t.conceptId) : "New tab";
          const active = t.id === state.activeTabId;
          return (
            // eslint-disable-next-line jsx-a11y/no-static-element-interactions -- middle-click-to-close is a pointer-only convenience; Ctrl/Cmd+W and the close button are the accessible paths
            <div
              key={t.id}
              className={`tab${active ? " is-active" : ""}`}
              data-tab-id={t.id}
              onMouseDown={onMiddleDown}
              onMouseUp={(e) => onMiddleUp(e, t.id)}
            >
              <button
                type="button"
                role="tab"
                aria-selected={active}
                className="tab-main"
                title={t.conceptId ?? title}
                onClick={() => onTabClick(t.id)}
                onPointerDown={(e) => onTabPointerDown(e, t.id)}
                onPointerMove={(e) => onTabPointerMove(e, t.id)}
                onPointerUp={onTabPointerUp}
              >
                {concept && (
                  <span
                    className="tab-dot"
                    style={{ background: palette.color(concept.type) }}
                    aria-hidden="true"
                  />
                )}
                <span className="tab-title">{title}</span>
              </button>
              <button
                type="button"
                className="tab-close"
                aria-label={`Close tab: ${title}`}
                onClick={() => actions.closeTab(t.id)}
              >
                <X size={13} aria-hidden="true" />
              </button>
            </div>
          );
        })}
      </div>
      <button
        type="button"
        className="tab-popout"
        aria-label="Move tab to new window"
        title="Move tab to new window"
        onClick={() => void actions.popOutTab()}
      >
        <SquareArrowOutUpRight size={14} aria-hidden="true" />
      </button>
    </div>
  );
}
