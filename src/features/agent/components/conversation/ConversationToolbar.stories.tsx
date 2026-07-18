import type { Meta, StoryObj } from "@storybook/react-vite";
import { Crosshair, Ellipsis, Shield } from "lucide-react";
import { expect, fn } from "storybook/test";
import { ConversationToolbar } from "./ConversationToolbar.tsx";
import { ThreadSwitcher } from "./ThreadSwitcher.tsx";

const threads = [
  { id: "research", ordinal: 1, title: "Source research", status: "running" as const },
  { id: "review", ordinal: 2, title: "Review staged edits", status: "staged" as const },
  { id: "notes", ordinal: 3, title: "Release notes", status: "idle" as const },
];

function ToolbarExample({ width }: { width: number }) {
  return (
    <div className="agent-conversation" style={{ width: "100%", maxWidth: width }}>
      <ConversationToolbar
        titleId="toolbar-story-title"
        title="Source research"
        navigation={(
          <ThreadSwitcher
            agentName="Codex"
            threads={threads}
            selectedThreadId="research"
            maxReached={false}
            onSelect={fn()}
            onAdd={fn()}
          />
        )}
      >
        <button type="button" className="btn ghost icon" aria-label="Follow agent in Reader">
          <Crosshair size={14} aria-hidden="true" />
        </button>
        <button type="button" className="btn ghost icon" aria-label="View thread permissions">
          <Shield size={14} aria-hidden="true" />
        </button>
        <button type="button" className="btn ghost icon" aria-label="More thread actions">
          <Ellipsis size={14} aria-hidden="true" />
        </button>
      </ConversationToolbar>
    </div>
  );
}

const meta = {
  title: "Agent/Conversation/ConversationToolbar",
  component: ToolbarExample,
} satisfies Meta<typeof ToolbarExample>;

export default meta;
type Story = StoryObj<typeof meta>;

export const PanelWidth: Story = {
  args: { width: 440 },
  play: async ({ canvas, canvasElement }) => {
    await expect(canvas.getByRole("navigation", { name: "Codex threads" })).toBeVisible();
    await expect(canvas.getByRole("toolbar", { name: "Source research actions" })).toBeVisible();
    await expect(canvasElement.scrollWidth).toBeLessThanOrEqual(canvasElement.clientWidth);
  },
};

export const NarrowWidth: Story = {
  args: { width: 360 },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.scrollWidth).toBeLessThanOrEqual(canvasElement.clientWidth);
  },
};
