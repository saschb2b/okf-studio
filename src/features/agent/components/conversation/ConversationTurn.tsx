import type { ReactNode } from "react";
import { useRef } from "react";
import { Message } from "./items.tsx";
import { ResponseActions } from "./ResponseActions.tsx";
import type { ConversationItem, ConversationMessage } from "./types.ts";

export interface ConversationTurn {
  id: string;
  prompt: ConversationMessage | null;
  items: readonly ConversationItem[];
  turnId: string | null;
}

function itemTurnId(item: ConversationItem): string | null {
  if (item.role === "user") return null;
  return item.turnId ?? null;
}

export function groupConversationItems(items: readonly ConversationItem[]): ConversationTurn[] {
  const turns: ConversationTurn[] = [];
  let current: ConversationTurn | null = null;

  for (const item of items) {
    if (item.role === "user") {
      current = {
        id: `conversation-${item.id}`,
        prompt: item,
        items: [],
        turnId: null,
      };
      turns.push(current);
      continue;
    }

    const turnId = itemTurnId(item);
    if (!current || (
      current.prompt === null && current.turnId !== null && turnId !== null &&
      current.turnId !== turnId
    )) {
      current = {
        id: `conversation-${turnId ?? item.id}`,
        prompt: null,
        items: [],
        turnId,
      };
      turns.push(current);
    }

    current.items = [...current.items, item];
    if (current.turnId === null && turnId !== null) current.turnId = turnId;
  }

  return turns;
}

export interface ConversationTurnFrameProps {
  turn: ConversationTurn;
  children: ReactNode;
  onReusePrompt?: (message: ConversationMessage) => void;
}

export function ConversationTurnFrame({
  turn,
  children,
  onReusePrompt,
}: ConversationTurnFrameProps) {
  const responseRef = useRef<HTMLDivElement>(null);
  const prompt = turn.prompt;
  const responseText = turn.items
    .filter((item): item is ConversationMessage => item.role === "agent")
    .map((message) => message.text)
    .filter((text) => text.trim().length > 0)
    .join("\n\n");

  return (
    <section className="agent-turn" data-turn-id={turn.turnId ?? undefined}>
      {prompt && (
        <div data-transcript-role="user">
          <Message
            message={prompt}
            isRetrying={false}
            retryError={null}
            generationBlockedReason={null}
            generationError={null}
            isGeneratingProposal={false}
            onReusePrompt={onReusePrompt ? () => onReusePrompt(prompt) : undefined}
          />
        </div>
      )}
      {turn.items.length > 0 && (
        <div ref={responseRef} className="agent-turn__response">
          <div className="agent-turn__items">{children}</div>
          {responseText && (
            <ResponseActions selectionRootRef={responseRef} responseText={responseText} />
          )}
        </div>
      )}
    </section>
  );
}
