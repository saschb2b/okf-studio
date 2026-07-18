import { describe, expect, it } from "vitest";
import { groupConversationItems } from "./ConversationTurn.tsx";
import type { ConversationItem } from "./types.ts";

describe("groupConversationItems", () => {
  it("keeps interleaved prose and tools inside one user turn", () => {
    const items: ConversationItem[] = [
      { id: "user-1", role: "user", text: "Inspect the order definition." },
      { id: "agent-1", role: "agent", turnId: "turn-1", text: "I will inspect it." },
      {
        id: "tool-1",
        role: "tool",
        turnId: "turn-1",
        toolCallId: "read-1",
        title: "Read concepts/orders.md",
        toolKind: "read",
        status: "completed",
        locations: [],
        changeState: null,
        content: [],
      },
      { id: "agent-2", role: "agent", turnId: "turn-1", text: "The definition is current." },
    ];

    const turns = groupConversationItems(items);
    expect(turns).toHaveLength(1);
    expect(turns[0].prompt?.text).toBe("Inspect the order definition.");
    expect(turns[0].items.map((item) => item.role)).toEqual(["agent", "tool", "agent"]);
  });

  it("starts a new group for each user prompt", () => {
    const items: ConversationItem[] = [
      { id: "user-1", role: "user", text: "First" },
      { id: "agent-1", role: "agent", turnId: "turn-1", text: "First answer" },
      { id: "user-2", role: "user", text: "Second" },
      { id: "agent-2", role: "agent", turnId: "turn-2", text: "Second answer" },
    ];

    expect(groupConversationItems(items).map((turn) => turn.prompt?.text)).toEqual([
      "First",
      "Second",
    ]);
  });
});
