import type { Dispatch, SetStateAction } from "react";
import { describe, expect, it } from "vitest";
import type { AgentTurnEvent } from "@/features/agent/connection.ts";
import { applyTurnEvent } from "./items.tsx";
import type { ConversationItem } from "./types.ts";

function turn(update: AgentTurnEvent["update"]): AgentTurnEvent {
  return {
    connectionId: "connection-1",
    sessionId: "session-1",
    turnId: "turn-1",
    update,
  };
}

function conversationUpdates() {
  let items: ConversationItem[] = [];
  const setItems: Dispatch<SetStateAction<ConversationItem[]>> = (action) => {
    items = typeof action === "function" ? action(items) : action;
  };
  return {
    apply(update: AgentTurnEvent["update"]) {
      applyTurnEvent(turn(update), setItems);
    },
    items: () => items,
  };
}

describe("applyTurnEvent", () => {
  it("keeps assistant text in chronological segments around tool calls", () => {
    const transcript = conversationUpdates();

    transcript.apply({ kind: "text", text: "I will inspect the bundle. ", messageId: null });
    transcript.apply({ kind: "text", text: "Starting now.", messageId: null });
    transcript.apply({
      kind: "tool-call",
      toolCallId: "read-1",
      title: "Read concepts/orders.md",
      toolKind: "read",
      status: "in-progress",
      locations: [],
      changeState: null,
      content: [],
    });
    transcript.apply({
      kind: "tool-call",
      toolCallId: "read-1",
      title: null,
      toolKind: null,
      status: "completed",
      locations: null,
      changeState: null,
      content: null,
    });
    transcript.apply({ kind: "text", text: "The bundle has one conflict. ", messageId: null });
    transcript.apply({ kind: "text", text: "I will trace it next.", messageId: null });

    expect(transcript.items().map((item) => item.role)).toEqual([
      "agent",
      "tool",
      "agent",
    ]);
    expect(transcript.items()).toMatchObject([
      { id: "agent-turn-1", text: "I will inspect the bundle. Starting now." },
      { id: "tool-turn-1-read-1", status: "completed" },
      { id: "agent-turn-1-2", text: "The bundle has one conflict. I will trace it next." },
    ]);
  });

  it("does not split streamed prose when a plan update is stored out of band", () => {
    const transcript = conversationUpdates();

    transcript.apply({ kind: "text", text: "First chunk. ", messageId: "message-1" });
    transcript.apply({
      kind: "plan",
      entries: [{ content: "Inspect the bundle", priority: "high", status: "in-progress" }],
    });
    transcript.apply({ kind: "text", text: "Second chunk.", messageId: "message-1" });

    expect(transcript.items()).toMatchObject([
      { role: "agent", text: "First chunk. Second chunk." },
      { role: "plan" },
    ]);
  });
});
