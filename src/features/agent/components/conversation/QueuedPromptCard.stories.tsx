import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent } from "storybook/test";
import { QueuedPromptCard } from "./QueuedPromptCard.tsx";

const meta = {
  title: "Agent/Conversation/QueuedPromptCard",
  component: QueuedPromptCard,
  decorators: [
    (Story) => (
      <div style={{ width: "100%", containerType: "inline-size" }}>
        <Story />
      </div>
    ),
  ],
  args: {
    prompt: {
      id: "queued-research",
      text: "Compare the conflicting definitions and cite the deciding source.",
      concepts: [{ id: "product/overview", title: "Product overview", type: "Product" }],
      sources: [],
    },
    onRecall: fn(),
    onRemove: fn(),
  },
} satisfies Meta<typeof QueuedPromptCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ReadyToRecall: Story = {
  play: async ({ args, canvas }) => {
    const recall = canvas.getByRole("button", { name: "Recall draft" });
    await expect(recall).toBeVisible();
    await userEvent.click(recall);
    await expect(args.onRecall).toHaveBeenCalledOnce();
  },
};

export const WithoutAttachments: Story = {
  args: {
    prompt: {
      id: "queued-plain",
      text: "Summarize the remaining uncertainty.",
      concepts: [],
      sources: [],
    },
  },
  play: async ({ args, canvas }) => {
    await expect(canvas.getByText("No attachments")).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Remove" }));
    await expect(args.onRemove).toHaveBeenCalledOnce();
  },
};
