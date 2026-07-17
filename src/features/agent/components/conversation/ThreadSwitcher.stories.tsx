import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent } from "storybook/test";
import { ThreadSwitcher } from "./ThreadSwitcher.tsx";

const threads = [
  { id: "research", ordinal: 1, title: "Source research", status: "running" as const },
  { id: "review", ordinal: 2, title: "Review edits", status: "waiting" as const },
  { id: "failed", ordinal: 3, title: "Broken links", status: "failed" as const },
  { id: "staged", ordinal: 4, title: "Metric update", status: "staged" as const },
  { id: "idle", ordinal: 5, title: "New thread", status: "idle" as const },
];

const meta = {
  title: "Agent/Conversation/ThreadSwitcher",
  component: ThreadSwitcher,
  decorators: [(Story) => <div style={{ width: "100%" }}><Story /></div>],
  args: {
    agentName: "GitHub Copilot",
    threads,
    selectedThreadId: "research",
    maxReached: false,
    onSelect: fn(),
    onAdd: fn(),
  },
} satisfies Meta<typeof ThreadSwitcher>;

export default meta;
type Story = StoryObj<typeof meta>;

export const FiveLiveThreads: Story = {
  play: async ({ args, canvas }) => {
    await expect(canvas.getByRole("navigation", { name: "GitHub Copilot threads" }))
      .toBeInTheDocument();
    await expect(canvas.queryByText("GitHub Copilot")).not.toBeInTheDocument();
    const selected = canvas.getByRole("button", { name: /source research, running/i });
    await expect(selected).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(canvas.getByRole("button", { name: /review edits, waiting/i }));
    await expect(args.onSelect).toHaveBeenCalledWith("review");
    selected.focus();
    await userEvent.keyboard("{Control>}{PageDown}{/Control}");
    await expect(args.onSelect).toHaveBeenCalledWith("review");
  },
};
