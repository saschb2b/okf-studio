import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent } from "storybook/test";
import { ContextPressureNotice } from "./ContextPressureNotice.tsx";

const baseUsage = {
  kind: "usage" as const,
  usedTokens: 96_000,
  contextWindowTokens: 100_000,
  cost: { amount: 1.24, currency: "USD" },
};

const meta = {
  title: "Agent/Conversation/ContextPressureNotice",
  component: ContextPressureNotice,
  args: {
    usage: baseUsage,
    recoveryCommand: {
      name: "compact",
      description: "Summarize the conversation and reduce context usage.",
    },
    busy: false,
    canStartFresh: true,
    onRunCommand: fn(),
    onStartFresh: fn(),
  },
} satisfies Meta<typeof ContextPressureNotice>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AdvertisedCompactCommand: Story = {
  play: async ({ canvas, args }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Run /compact" }));
    await expect(args.onRunCommand).toHaveBeenCalledWith(args.recoveryCommand);
  },
};

export const FreshThreadFallback: Story = {
  args: {
    usage: { ...baseUsage, usedTokens: 78_000 },
    recoveryCommand: null,
  },
  play: async ({ canvas, args }) => {
    await expect(canvas.queryByRole("button", { name: /Run/ })).toBeNull();
    await userEvent.click(canvas.getByRole("button", { name: "New thread from context" }));
    await expect(args.onStartFresh).toHaveBeenCalled();
  },
};
