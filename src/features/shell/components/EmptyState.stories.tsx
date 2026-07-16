// First-run surface: what a user sees before any bundle is open.
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";
import { WithStore } from "@/mock/withStore.tsx";
import { EmptyState } from "./EmptyState.tsx";

const meta = {
  title: "Shell/EmptyState",
  component: EmptyState,
} satisfies Meta<typeof EmptyState>;

export default meta;
type Story = StoryObj<typeof meta>;

export const FirstRun: Story = {
  render: () => (
    <WithStore>
      <EmptyState />
    </WithStore>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getAllByRole("button", { name: /open folder/i })[0]).toBeEnabled();
  },
};
