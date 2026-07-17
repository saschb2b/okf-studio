// The agent's plan as a finished-turn card and as the live in-turn
// disclosure with its progress summary.
import type { Meta, StoryObj } from "@storybook/react-vite";
import { LivePlan, PlanCard } from "./items.tsx";
import type { ConversationPlan } from "./types.ts";

const plan: ConversationPlan = {
  id: "plan-story",
  role: "plan",
  entries: [
    { content: "Find conflicting claims", priority: "high", status: "completed" },
    { content: "Trace source references", priority: "high", status: "in-progress" },
    { content: "Prepare a cited summary", priority: "medium", status: "pending" },
  ],
};

const meta = {
  title: "Agent/Conversation/Plan",
  component: PlanCard,
} satisfies Meta<typeof PlanCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Card: Story = {
  args: { plan },
};

export const AllCompleted: Story = {
  args: {
    plan: {
      ...plan,
      entries: plan.entries.map((entry) => ({ ...entry, status: "completed" as const })),
    },
  },
};

export const Live: Story = {
  args: { plan },
  render: (args) => <LivePlan plan={args.plan} />,
};
