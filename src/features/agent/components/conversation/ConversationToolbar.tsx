import type { ReactNode } from "react";
import "../AgentConversation.css";

export interface ConversationToolbarProps {
  titleId: string;
  title: string;
  navigation?: ReactNode;
  children: ReactNode;
}

export function ConversationToolbar({
  titleId,
  title,
  navigation,
  children,
}: ConversationToolbarProps) {
  return (
    <header className={`agent-conversation__toolbar${navigation ? " agent-conversation__toolbar--with-navigation" : ""}`}>
      <h2 id={titleId} className="sr-only">{title}</h2>
      {navigation}
      <div
        className="agent-conversation__toolbar-actions"
        role="toolbar"
        aria-label={`${title} actions`}
      >
        {children}
      </div>
    </header>
  );
}
