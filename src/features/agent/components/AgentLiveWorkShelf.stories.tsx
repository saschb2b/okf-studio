// The docked live-work shelf: the in-turn plan, a blocking permission
// decision ordered first, and the collapse affordance.
import type { Meta, StoryObj } from "@storybook/react-vite";
import { LivePlan, PermissionCard } from "./conversation/items.tsx";
import type { ConversationPlan } from "./conversation/types.ts";
import { AgentLiveWorkShelf } from "./AgentLiveWorkShelf.tsx";

const plan: ConversationPlan = {
  id: "plan-live",
  role: "plan",
  entries: [
    { content: "Find conflicting claims", priority: "high", status: "completed" },
    { content: "Trace source references", priority: "high", status: "in-progress" },
    { content: "Prepare a cited summary", priority: "medium", status: "pending" },
  ],
};

const meta = {
  title: "Agent/Panel/LiveWorkShelf",
  component: AgentLiveWorkShelf,
  decorators: [
    // The shelf docks above the composer; a panel-width frame keeps it honest.
    (Story) => <div style={{ width: 440, border: "1px solid var(--border)" }}><Story /></div>,
  ],
} satisfies Meta<typeof AgentLiveWorkShelf>;

export default meta;
type Story = StoryObj<typeof meta>;

export const PlanInProgress: Story = {
  args: {
    summary: "1 of 3 complete",
    children: <LivePlan plan={plan} />,
  },
};

/** A blocking permission decision renders before the plan and stays visible. */
export const BlockingPermission: Story = {
  args: {
    summary: "1 of 3 complete · 1 decision needed",
    blockingContent: (
      <PermissionCard
        permission={{
          requestId: "permission-shelf",
          connectionId: "connection-shelf",
          sessionId: "session-shelf",
          update: {
            kind: "requested",
            toolCallId: "tool-shelf",
            title: "Write concepts/orders.md into the staged revision",
            options: [
              { optionId: "allow-once", name: "Allow once", kind: "allow-once" },
              { optionId: "reject-once", name: "Reject", kind: "reject-once" },
            ],
            canRemember: true,
          },
        }}
      />
    ),
    children: <LivePlan plan={plan} />,
  },
};

export const NotCollapsible: Story = {
  args: {
    summary: "1 of 3 complete",
    collapsible: false,
    children: <LivePlan plan={plan} />,
  },
};
