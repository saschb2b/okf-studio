import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { ConversationTurnFrame, groupConversationItems } from "./ConversationTurn.tsx";
import { ConversationItemView } from "./items.tsx";
import type { ConversationItem, ConversationMessage } from "./types.ts";

const items: ConversationItem[] = [
  {
    id: "user-1",
    role: "user",
    text: "Reconcile the order definitions and validate the result.",
  },
  {
    id: "agent-1",
    role: "agent",
    turnId: "turn-1",
    text: "I will inspect the canonical concept and its dependants.",
  },
  {
    id: "tool-read",
    role: "tool",
    turnId: "turn-1",
    toolCallId: "read",
    title: "Read concepts/orders.md",
    toolKind: "read",
    status: "completed",
    locations: [{ path: "concepts/orders.md", line: 1 }],
    changeState: null,
    content: [],
  },
  {
    id: "tool-edit",
    role: "tool",
    turnId: "turn-1",
    toolCallId: "edit",
    title: "Edit concepts/orders.md",
    toolKind: "edit",
    status: "completed",
    locations: [{ path: "concepts/orders.md", line: 3 }],
    changeState: "staged",
    content: [{
      kind: "diff",
      path: "concepts/orders.md",
      diff: "@@ -3 +3 @@\n-One row per cart.\n+One row per completed checkout.\n",
      truncated: false,
    }],
  },
  {
    id: "plan-1",
    role: "plan",
    turnId: "turn-1",
    entries: [
      { content: "Inspect the definitions", priority: "high", status: "completed" },
      { content: "Validate the staged bundle", priority: "high", status: "completed" },
    ],
  },
  {
    id: "agent-2",
    role: "agent",
    turnId: "turn-1",
    text: "The definitions now agree. The staged change is ready for review.",
  },
];

function ConversationTurnExample({
  width,
  onReusePrompt,
}: {
  width: number;
  onReusePrompt: (message: ConversationMessage) => void;
}) {
  const turn = groupConversationItems(items)[0];
  return (
    <div className="agent-conversation" style={{ width: "100%", maxWidth: width }}>
      <div className="agent-conversation__messages">
        <ConversationTurnFrame turn={turn} onReusePrompt={onReusePrompt}>
          {turn.items.map((item) => (
            <div key={item.id} className="agent-conversation__item" data-transcript-role={item.role}>
              <ConversationItemView
                item={item}
                conceptIds={["concepts/orders"]}
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
    </div>
  );
}

const meta = {
  title: "Agent/Conversation/ConversationTurn",
  component: ConversationTurnExample,
  args: { width: 440, onReusePrompt: fn() },
} satisfies Meta<typeof ConversationTurnExample>;

export default meta;
type Story = StoryObj<typeof meta>;

export const PanelWidth: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getAllByRole("button", { name: "Copy response" })).toHaveLength(1);
    await expect(canvas.getByText(/One row per completed checkout/u)).not.toBeVisible();
    await expect(canvas.getByText("Plan completed")).toBeVisible();
    await expect(canvas.getByLabelText("Tool: Edit concepts/orders.md")).not.toHaveAttribute("open");
    await userEvent.click(canvas.getByRole("button", { name: "Reuse prompt" }));
    await expect(args.onReusePrompt).toHaveBeenCalledWith(expect.objectContaining({ id: "user-1" }));
  },
};

export const NarrowWidth: Story = { args: { width: 360 } };
