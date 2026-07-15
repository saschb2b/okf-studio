import { ChevronDown, ListChecks } from "lucide-react";
import { useId, useState } from "react";
import type { ReactNode } from "react";

interface AgentLiveWorkShelfProps {
  summary: string;
  collapsible?: boolean;
  blockingContent?: ReactNode;
  children?: ReactNode;
}

export function AgentLiveWorkShelf({
  summary,
  collapsible = true,
  blockingContent,
  children,
}: AgentLiveWorkShelfProps) {
  const [expanded, setExpanded] = useState(true);
  const contentId = useId();

  return (
    <section className="agent-live-work" aria-label="Live work">
      <header className="agent-live-work__header">
        <ListChecks size={15} aria-hidden="true" />
        <div>
          <strong>Live work</strong>
          <span title={summary}>{summary}</span>
        </div>
        {collapsible && (
          <button
            type="button"
            className="btn ghost icon"
            aria-label={expanded ? "Collapse live work" : "Expand live work"}
            aria-expanded={expanded}
            aria-controls={contentId}
            onClick={() => setExpanded((current) => !current)}
          >
            <ChevronDown aria-hidden="true" size={15} />
          </button>
        )}
      </header>
      {blockingContent && (
        <div className="agent-live-work__blocking">
          {blockingContent}
        </div>
      )}
      {collapsible && expanded && children && (
        <div id={contentId} className="agent-live-work__content">
          {children}
        </div>
      )}
    </section>
  );
}
