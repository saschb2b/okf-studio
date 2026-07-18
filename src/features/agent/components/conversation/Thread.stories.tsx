// The conversation as a whole — a realistic transcript at panel width, so
// the Zed document flow (prose as the document, quiet tool rows, carded
// mutations, bordered user blocks) is judged as a composition, not per item.
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import { useState } from "react";
import type { AgentTurnEvent } from "@/features/agent/connection.ts";
import { applyTurnEvent, ConversationItemView, Message, ToolCard } from "./items.tsx";
import { ConversationTurnFrame, groupConversationItems } from "./ConversationTurn.tsx";
import type { ConversationItem } from "./types.ts";
import type { ConversationMessage, ConversationPlan, ConversationTool } from "./types.ts";

const user = (id: string, text: string): ConversationMessage => ({ id, role: "user", text });
const agent = (id: string, text: string): ConversationMessage => ({ id, role: "agent", turnId: "turn-1", text });
const tool = (id: string, over: Partial<ConversationTool>): ConversationTool => ({
  id,
  role: "tool",
  turnId: "turn-1",
  toolCallId: id,
  title: "Tool",
  toolKind: "other",
  status: "completed",
  locations: [],
  changeState: null,
  content: [],
  ...over,
});

function Thread({ width }: { width: number }) {
  const plan: ConversationPlan = {
    id: "plan",
    role: "plan",
    turnId: "turn-1",
    entries: [
      { content: "Find conflicting claims", priority: "high", status: "completed" },
      { content: "Reconcile the definitions", priority: "high", status: "completed" },
    ],
  };
  const turn = groupConversationItems([
    user("u1", "Reconcile the order definitions across the bundle."),
    tool("t1", { title: "Read concepts/orders.md", toolKind: "read" }),
    tool("t2", { title: "Search the bundle for \"draft cart\"", toolKind: "search", locations: [
      { path: "concepts/orders.md", line: 3 },
      { path: "metrics/weekly-active.md", line: 11 },
    ] }),
    agent("a1", "Two definitions disagree: `concepts/orders.md` **counts draft carts**, while the metric excludes them. The checkout pipeline is the authority, so I am aligning the concept to it."),
    tool("t3", {
      title: "Edit concepts/orders.md",
      toolKind: "edit",
      changeState: "staged",
      content: [{
        kind: "diff",
        path: "concepts/orders.md",
        diff: "@@ -1,3 +1,3 @@\n # Orders\n \n-One row per cart, including drafts.\n+One row per completed checkout; draft carts never land here.\n",
        truncated: false,
      }],
    }),
    tool("t4", {
      title: "node okf-validate.mjs . --strict",
      toolKind: "execute",
      content: [{ kind: "text", text: "0 error(s), 0 warning(s); 0 broken link(s), 0 orphan(s). Conformant.", truncated: false }],
    }),
    plan,
    agent("a2", "Both definitions now agree; the staged change is ready for your review."),
  ])[0];
  return (
    <div className="agent-conversation" style={{ width, border: "1px solid var(--border)" }}>
      <ConversationTurnFrame turn={turn} onReusePrompt={() => undefined}>
        {turn.items.map((item) => (
          <div key={item.id} className="agent-conversation__item" data-transcript-role={item.role}>
            <ConversationItemView
              item={item}
              conceptIds={[]}
              onOpenConcept={() => undefined}
              isRetrying={false}
              retryError={null}
              generationBlockedReason={null}
              generationError={null}
              isGeneratingProposal={false}
              showResponseActions={false}
            />
          </div>
        ))}
      </ConversationTurnFrame>
    </div>
  );
}

function ChronologicalTurn() {
  const [items, setItems] = useState<ConversationItem[]>([]);

  function replayTurn() {
    const base = {
      connectionId: "connection-story",
      sessionId: "session-story",
      turnId: "turn-story",
    };
    const updates: AgentTurnEvent["update"][] = [
      { kind: "text", text: "I will inspect the relevant concepts first.", messageId: null },
      {
        kind: "tool-call",
        toolCallId: "read-story",
        title: "Read concepts/orders.md",
        toolKind: "read",
        status: "in-progress",
        locations: [{ path: "concepts/orders.md", line: 1 }],
        changeState: null,
        content: [],
      },
      {
        kind: "tool-call",
        toolCallId: "read-story",
        title: null,
        toolKind: null,
        status: "completed",
        locations: null,
        changeState: null,
        content: null,
      },
      {
        kind: "text",
        text: "The concept conflicts with the checkout definition, so I will trace its sources next.",
        messageId: null,
      },
    ];
    setItems([]);
    for (const update of updates) {
      applyTurnEvent({ ...base, update }, setItems);
    }
  }

  return (
    <div className="agent-conversation" style={{ width: "min(100%, 440px)" }}>
      <button type="button" className="btn" onClick={replayTurn}>Replay streamed turn</button>
      <div className="agent-conversation__messages" data-testid="turn-sequence">
        {items.map((item) => (
          <div key={item.id} data-transcript-role={item.role}>
            {item.role === "agent" ? (
              <Message
                message={item}
                isRetrying={false}
                retryError={null}
                generationBlockedReason={null}
                generationError={null}
                isGeneratingProposal={false}
              />
            ) : item.role === "tool" ? (
              <ToolCard tool={item} />
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

const meta = {
  title: "Agent/Conversation/Thread",
  component: Thread,
} satisfies Meta<typeof Thread>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The default panel width. */
export const PanelWidth: Story = { args: { width: 440 } };

/** The narrow floor — nothing may clip or overlap. */
export const NarrowWidth: Story = { args: { width: 360 } };

/** Later prose stays below the tool that preceded it instead of joining the first response block. */
export const ChronologicalToolSequence: Story = {
  args: { width: 440 },
  render: () => <ChronologicalTurn />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Replay streamed turn" }));
    const roles = Array.from(
      canvas.getByTestId("turn-sequence").querySelectorAll("[data-transcript-role]"),
      (item) => item.getAttribute("data-transcript-role"),
    );
    await expect(roles).toEqual(["agent", "tool", "agent"]);
    await expect(canvas.getByText("I will inspect the relevant concepts first.")).toBeVisible();
    await expect(canvas.getByLabelText("Tool: Read concepts/orders.md")).toBeVisible();
    await expect(canvas.getByText(/The concept conflicts with the checkout definition/u)).toBeVisible();
  },
};
