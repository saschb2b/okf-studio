import { ArrowDownToLine, ArrowUpToLine, ChevronDown, ChevronUp } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode, UIEvent } from "react";

/* eslint-disable jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex -- The independently scrollable transcript must be focusable for Home and End without claiming an interactive ARIA role. */

const TAIL_TOLERANCE_PX = 24;

export function isNearTranscriptTail(element: Pick<HTMLElement, "clientHeight" | "scrollHeight" | "scrollTop">): boolean {
  return element.scrollHeight - element.clientHeight - element.scrollTop <= TAIL_TOLERANCE_PX;
}

interface TranscriptSurfaceProps {
  children: ReactNode;
  hasItems: boolean;
  hasUserMessage: boolean;
  contentVersion: unknown;
}

type TranscriptTarget =
  | "top"
  | "previous-user"
  | "next-user"
  | "latest-user"
  | "bottom";

/**
 * Where each prompt sits in the transcript. A turn's tool calls and prose can
 * run to many screens in a docked panel, so "the previous thing I asked" is a
 * position worth stepping between rather than something to hunt for by
 * scrolling. Zed steps prompt to prompt with Shift+PageUp/PageDown; this is the
 * same motion over the transcript's own scroller.
 */
function promptOffsets(surface: HTMLElement): number[] {
  return [...surface.querySelectorAll<HTMLElement>("[data-transcript-role='user']")]
    .map((item) => item.offsetTop);
}

/** The offset of the prompt before, or after, the one currently in view. */
function steppedPromptOffset(
  offsets: number[],
  scrollTop: number,
  direction: "previous" | "next",
): number | null {
  // A tolerance, because landing on a prompt sets scrollTop to its offset and an
  // exact comparison would then step to that same prompt again forever.
  if (direction === "previous") {
    const earlier = offsets.filter((offset) => offset < scrollTop - TAIL_TOLERANCE_PX);
    return earlier.length > 0 ? earlier[earlier.length - 1] : null;
  }
  return offsets.find((offset) => offset > scrollTop + TAIL_TOLERANCE_PX) ?? null;
}

export function TranscriptSurface({
  children,
  hasItems,
  hasUserMessage,
  contentVersion,
}: TranscriptSurfaceProps) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const followingTailRef = useRef(true);
  const [atTop, setAtTop] = useState(true);
  const [followingTail, setFollowingTail] = useState(true);
  // Whether a prompt exists before or after the one in view, so the stepping
  // controls read as spent at the ends instead of silently doing nothing.
  const [steps, setSteps] = useState({ previous: false, next: false });

  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) return;
    if (!hasItems) {
      surface.scrollTop = 0;
      return;
    }
    if (followingTailRef.current) surface.scrollTop = surface.scrollHeight;
    syncPosition(surface);
  }, [contentVersion, hasItems]);

  function syncPosition(surface: HTMLDivElement) {
    const nextFollowingTail = isNearTranscriptTail(surface);
    followingTailRef.current = nextFollowingTail;
    setFollowingTail(nextFollowingTail);
    setAtTop(surface.scrollTop <= TAIL_TOLERANCE_PX);
    const offsets = promptOffsets(surface);
    setSteps({
      previous: steppedPromptOffset(offsets, surface.scrollTop, "previous") !== null,
      next: steppedPromptOffset(offsets, surface.scrollTop, "next") !== null,
    });
  }

  function jumpTo(target: TranscriptTarget) {
    const surface = surfaceRef.current;
    if (!surface) return;

    if (target === "top") {
      surface.scrollTop = 0;
    } else if (target === "bottom") {
      surface.scrollTop = surface.scrollHeight;
    } else {
      const offsets = promptOffsets(surface);
      if (offsets.length === 0) return;
      if (target === "latest-user") {
        surface.scrollTop = offsets[offsets.length - 1];
      } else {
        const next = steppedPromptOffset(
          offsets,
          surface.scrollTop,
          target === "previous-user" ? "previous" : "next",
        );
        // Already at the first or last prompt: staying put beats a jump that
        // looks like the control missed.
        if (next === null) return;
        surface.scrollTop = next;
      }
    }

    syncPosition(surface);
  }

  function handleScroll(event: UIEvent<HTMLDivElement>) {
    syncPosition(event.currentTarget);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) return;
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === "Home") {
      event.preventDefault();
      jumpTo(event.shiftKey ? "latest-user" : "top");
    } else if (event.key === "End" && !event.shiftKey) {
      event.preventDefault();
      jumpTo("bottom");
    } else if (event.shiftKey && (event.key === "PageUp" || event.key === "PageDown")) {
      // Shift, so unmodified PageUp/PageDown keep the browser's own paging.
      event.preventDefault();
      jumpTo(event.key === "PageUp" ? "previous-user" : "next-user");
    }
  }

  return (
    <div className="agent-transcript">
      <div
        ref={surfaceRef}
        className="agent-conversation__messages"
        role="region"
        aria-label="Conversation transcript"
        aria-live="polite"
        tabIndex={0}
        onScroll={handleScroll}
        onKeyDown={handleKeyDown}
      >
        {children}
      </div>
      {hasItems && (
        <nav className="agent-transcript__navigation" aria-label="Transcript navigation">
          <button
            type="button"
            className="btn ghost icon"
            aria-label="Jump to transcript top"
            aria-keyshortcuts="Home"
            title="Top (Home)"
            disabled={atTop}
            onClick={() => jumpTo("top")}
          >
            <ArrowUpToLine size={15} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="btn ghost icon"
            aria-label="Jump to previous prompt"
            aria-keyshortcuts="Shift+PageUp"
            title="Previous prompt (Shift+PgUp)"
            disabled={!hasUserMessage || !steps.previous}
            onClick={() => jumpTo("previous-user")}
          >
            <ChevronUp size={15} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="btn ghost icon"
            aria-label="Jump to next prompt"
            aria-keyshortcuts="Shift+PageDown"
            title="Next prompt (Shift+PgDn)"
            disabled={!hasUserMessage || !steps.next}
            onClick={() => jumpTo("next-user")}
          >
            <ChevronDown size={15} aria-hidden="true" />
          </button>
          {/* No button for the latest prompt. Stepping reaches it, "bottom" is
              beside it, and a fifth control in a panel that docks at 320px costs
              more than the shortcut it would duplicate. Shift+Home still goes
              straight there. */}
          <button
            type="button"
            className="btn ghost icon"
            aria-label="Jump to transcript bottom"
            aria-keyshortcuts="End"
            title="Bottom (End)"
            disabled={followingTail}
            onClick={() => jumpTo("bottom")}
          >
            <ArrowDownToLine size={15} aria-hidden="true" />
          </button>
        </nav>
      )}
    </div>
  );
}
