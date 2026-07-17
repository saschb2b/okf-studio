import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent } from "storybook/test";
import { ResponseActions } from "./ResponseActions.tsx";

const meta = {
  title: "Agent/Conversation/ResponseActions",
  component: ResponseActions,
  args: {
    selectionAvailable: true,
    status: "idle",
    onCopySelection: fn(),
    onCopyResponse: fn(),
  },
} satisfies Meta<typeof ResponseActions>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SelectionAvailable: Story = {
  play: async ({ args, canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Copy selection" }));
    await expect(args.onCopySelection).toHaveBeenCalledOnce();
    await userEvent.click(canvas.getByRole("button", { name: "Copy response" }));
    await expect(args.onCopyResponse).toHaveBeenCalledOnce();
  },
};

export const NoSelection: Story = {
  args: { selectionAvailable: false, status: "response" },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("button", { name: "Copy selection" })).toBeDisabled();
    await expect(canvas.getByText("Response copied")).toBeVisible();
  },
};
