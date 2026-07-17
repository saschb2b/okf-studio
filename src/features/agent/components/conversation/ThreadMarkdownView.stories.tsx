import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent } from "storybook/test";
import { ThreadMarkdownView } from "./ThreadMarkdownView.tsx";

const markdown = `# Source reconciliation

Agent: Studio Agent

Bundle: OKF Studio

## You

> Reconcile the source claims.

## Agent

Two concepts disagree. The **checkout pipeline** is authoritative.
`;

const meta = {
  title: "Agent/Conversation/ThreadMarkdownView",
  component: ThreadMarkdownView,
  args: { title: "Source reconciliation", markdown, onClose: fn() },
} satisfies Meta<typeof ThreadMarkdownView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ReadOnlySource: Story = {
  play: async ({ args, canvas }) => {
    await expect(canvas.getByLabelText("Thread Markdown source")).toHaveTextContent(
      "The **checkout pipeline** is authoritative.",
    );
    await userEvent.click(canvas.getByRole("button", { name: "Close Markdown view" }));
    await expect(args.onClose).toHaveBeenCalledOnce();
  },
};
