import { ArrowDownToLine, ArrowUpToLine, MessageSquareText } from "lucide-react";
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

type TranscriptTarget = "top" | "latest-user" | "bottom";

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

  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) return;
    if (!hasItems) {
      surface.scrollTop = 0;
      return;
    }
    if (followingTailRef.current) surface.scrollTop = surface.scrollHeight;
  }, [contentVersion, hasItems]);

  function syncPosition(surface: HTMLDivElement) {
    const nextFollowingTail = isNearTranscriptTail(surface);
    followingTailRef.current = nextFollowingTail;
    setFollowingTail(nextFollowingTail);
    setAtTop(surface.scrollTop <= TAIL_TOLERANCE_PX);
  }

  function jumpTo(target: TranscriptTarget) {
    const surface = surfaceRef.current;
    if (!surface) return;

    if (target === "top") {
      surface.scrollTop = 0;
    } else if (target === "bottom") {
      surface.scrollTop = surface.scrollHeight;
    } else {
      const userItems = surface.querySelectorAll<HTMLElement>("[data-transcript-role='user']");
      if (userItems.length === 0) return;
      const latestUserItem = userItems[userItems.length - 1];
      surface.scrollTop = latestUserItem.offsetTop;
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
            aria-label="Jump to latest user prompt"
            aria-keyshortcuts="Shift+Home"
            title="Latest prompt (Shift+Home)"
            disabled={!hasUserMessage}
            onClick={() => jumpTo("latest-user")}
          >
            <MessageSquareText size={15} aria-hidden="true" />
          </button>
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
