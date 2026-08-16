import type { Meta, StoryObj } from "@storybook/react-vite";
import { Crosshair, Ellipsis, Pencil, Shield, X } from "lucide-react";
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
        <button type="button" className="btn ghost icon" aria-label="Rename thread">
          <Pencil size={14} aria-hidden="true" />
        </button>
        <button type="button" className="btn ghost icon" aria-label="Follow agent in Reader">
          <Crosshair size={14} aria-hidden="true" />
        </button>
        <button type="button" className="btn ghost icon" aria-label="View thread permissions">
          <Shield size={14} aria-hidden="true" />
        </button>
        <button type="button" className="btn ghost icon" aria-label="Close thread">
          <X size={14} aria-hidden="true" />
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

/**
 * Starting a thread has to stay clickable. The thread strip is a horizontal
 * scroller, so an add button that scrolls with the tabs sits past the right
 * edge at exactly the moment there are enough threads to want another one.
 * Checked as geometry against the strip, because in a scroller "nothing
 * overflows" holds true of every box whose contents are out of reach.
 */
async function expectAddThreadReachable(navigation: HTMLElement) {
  const add = navigation.querySelector<HTMLElement>(".agent-panel__thread--add");
  if (add === null) throw new Error("The thread strip has no add-thread button.");
  const strip = navigation.getBoundingClientRect();
  const button = add.getBoundingClientRect();
  await expect(button.left).toBeGreaterThanOrEqual(strip.left - 1);
  await expect(button.right).toBeLessThanOrEqual(strip.right + 1);
  await expect(button.width).toBeGreaterThanOrEqual(24);
}

export const PanelWidth: Story = {
  args: { width: 440 },
  play: async ({ canvas, canvasElement }) => {
    const navigation = canvas.getByRole("navigation", { name: "Codex threads" });
    const actions = canvas.getByRole("toolbar", { name: "Source research actions" });
    await expect(navigation).toBeVisible();
    await expect(actions).toBeVisible();
    await expect(navigation.getBoundingClientRect().right)
      .toBeLessThanOrEqual(actions.getBoundingClientRect().left);
    await expect(actions.scrollWidth).toBeLessThanOrEqual(actions.clientWidth);
    await expect(canvasElement.scrollWidth).toBeLessThanOrEqual(canvasElement.clientWidth);
    await expectAddThreadReachable(navigation);
  },
};

export const NarrowWidth: Story = {
  args: { width: 360 },
  play: async ({ canvas, canvasElement }) => {
    const navigation = canvas.getByRole("navigation", { name: "Codex threads" });
    const actions = canvas.getByRole("toolbar", { name: "Source research actions" });
    await expect(navigation.getBoundingClientRect().right)
      .toBeLessThanOrEqual(actions.getBoundingClientRect().left);
    await expect(actions.scrollWidth).toBeLessThanOrEqual(actions.clientWidth);
    await expect(canvasElement.scrollWidth).toBeLessThanOrEqual(canvasElement.clientWidth);
    await expectAddThreadReachable(navigation);
  },
};
