import { Plus } from "lucide-react";
import { useRef } from "react";
import type { KeyboardEvent, RefObject } from "react";
import type { AgentThreadStatus } from "@/features/agent/threadStatus.ts";
import { ThreadStatusIndicator, threadStatusLabel } from "./ThreadStatusIndicator.tsx";
import "./ThreadSwitcher.css";

export interface ThreadSwitcherItem {
  id: string;
  ordinal: number;
  title: string;
  status: AgentThreadStatus;
}

export interface ThreadSwitcherProps {
  agentName: string;
  threads: readonly ThreadSwitcherItem[];
  selectedThreadId: string;
  maxReached: boolean;
  navRef?: RefObject<HTMLElement | null>;
  onSelect: (threadId: string) => void;
  onAdd: () => void;
}

export function ThreadSwitcher({
  agentName,
  threads,
  selectedThreadId,
  maxReached,
  navRef,
  onSelect,
  onAdd,
}: ThreadSwitcherProps) {
  const internalRef = useRef<HTMLElement>(null);
  const activeRef = navRef ?? internalRef;

  function cycle(direction: 1 | -1) {
    if (threads.length < 2) return;
    const currentIndex = threads.findIndex((thread) => thread.id === selectedThreadId);
    const next = threads[(currentIndex + direction + threads.length) % threads.length];
    onSelect(next.id);
    requestAnimationFrame(() => {
      activeRef.current?.querySelector<HTMLElement>(`[data-thread-id="${next.id}"]`)?.focus();
    });
  }

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
    if (event.key === "PageUp" || event.key === "PageDown") {
      event.preventDefault();
      cycle(event.key === "PageDown" ? 1 : -1);
    }
  }

  return (
    <nav
      ref={activeRef}
      className="agent-panel__threads"
      aria-label={`${agentName} threads`}
      aria-keyshortcuts="Control+PageUp Control+PageDown Meta+PageUp Meta+PageDown"
    >
      {threads.map((thread) => {
        const selected = thread.id === selectedThreadId;
        const label = `Thread ${thread.ordinal}: ${thread.title}`;
        const statusLabel = threadStatusLabel(thread.status);
        return (
          <button
            type="button"
            className="btn ghost agent-panel__thread"
            key={thread.id}
            aria-label={`Switch to ${label}, ${statusLabel}`}
            aria-pressed={selected}
            title={`${label} · ${statusLabel}`}
            data-thread-id={thread.id}
            onFocus={(event) => event.currentTarget.scrollIntoView({
              block: "nearest",
              inline: "nearest",
            })}
            onClick={() => onSelect(thread.id)}
            onKeyDown={handleKeyDown}
          >
            <span className="agent-panel__thread-number" aria-hidden="true">
              {thread.ordinal}
            </span>
            <ThreadStatusIndicator status={thread.status} />
            <span className="agent-panel__thread-label">{thread.title}</span>
          </button>
        );
      })}
      <button
        type="button"
        className="btn ghost agent-panel__thread agent-panel__thread--add"
        aria-label={`Start another thread with ${agentName}`}
        title={maxReached
          ? "Studio keeps at most 8 live threads per connection."
          : `Start another thread with ${agentName}`}
        disabled={maxReached}
        onFocus={(event) => event.currentTarget.scrollIntoView({
          block: "nearest",
          inline: "nearest",
        })}
        onClick={onAdd}
        onKeyDown={handleKeyDown}
      >
        <Plus size={14} aria-hidden="true" />
      </button>
    </nav>
  );
}
