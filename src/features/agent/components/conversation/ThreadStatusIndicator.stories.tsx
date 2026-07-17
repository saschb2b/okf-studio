import type { Meta, StoryObj } from "@storybook/react-vite";
import { ThreadStatusIndicator } from "./ThreadStatusIndicator.tsx";

const meta = {
  title: "Agent/Conversation/ThreadStatusIndicator",
  component: ThreadStatusIndicator,
  args: { status: "idle", showLabel: true },
} satisfies Meta<typeof ThreadStatusIndicator>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AllStates: Story = {
  render: () => (
    <div style={{ display: "grid", gap: "var(--space-8)" }}>
      <ThreadStatusIndicator status="idle" showLabel />
      <ThreadStatusIndicator status="running" showLabel />
      <ThreadStatusIndicator status="waiting" showLabel />
      <ThreadStatusIndicator status="failed" showLabel />
      <ThreadStatusIndicator status="staged" showLabel />
    </div>
  ),
};
