import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { OkfMentionMenu } from "./OkfMentionMenu.tsx";

const meta = {
  title: "Agent/Conversation/OkfMentionMenu",
  component: OkfMentionMenu,
  decorators: [(Story) => <div style={{ width: "100%", maxWidth: 328 }}><Story /></div>],
  args: {
    options: [
      { id: "bundle", label: "Product knowledge", description: "Reference the active bundle", kind: "bundle" },
      { id: "orders", label: "Orders", description: "Metric", kind: "concept" },
      { id: "checkout", label: "Checkout pipeline", description: "Source", kind: "concept" },
    ],
    onSelect: fn(),
  },
} satisfies Meta<typeof OkfMentionMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Suggestions: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Orders, Metric" }));
    await expect(args.onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: "orders" }));
  },
};
