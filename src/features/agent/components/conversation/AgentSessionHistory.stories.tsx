import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import type { ComponentProps } from "react";
import { useState } from "react";
import { AgentSessionHistory } from "./AgentSessionHistory.tsx";

const sessions = [
  ["session-1", "Source inventory", "2026-07-17T08:15:00Z"],
  ["session-2", "Validation repair", "2026-07-17T07:40:00Z"],
  ["session-3", "Metrics glossary", "2026-07-16T18:05:00Z"],
  ["session-4", "Dataset change plan", "2026-07-16T14:22:00Z"],
  ["session-5", "Untitled research", "2026-07-15T11:10:00Z"],
].map(([sessionId, title, updatedAt]) => ({ sessionId, title, updatedAt }));

function HistoryStory(args: ComponentProps<typeof AgentSessionHistory>) {
  const [query, setQuery] = useState("");
  return (
    <div style={{ width: "100%", maxWidth: 440, height: 520 }}>
      <AgentSessionHistory
        {...args}
        query={query}
        onQueryChange={setQuery}
      />
    </div>
  );
}

const meta = {
  title: "Agent/Conversation/AgentSessionHistory",
  component: AgentSessionHistory,
  parameters: { layout: "fullscreen" },
  args: {
    state: { status: "ready", sessions, hasMore: false },
    query: "",
    pendingSessionId: null,
    importDisabledReason: null,
    onQueryChange: () => undefined,
    onBack: () => undefined,
    onRefresh: () => undefined,
    onImport: () => undefined,
  },
  render: (args) => <HistoryStory {...args} />,
} satisfies Meta<typeof AgentSessionHistory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ReadyList: Story = {};

export const SearchAndImport: Story = {
  args: { onImport: fn() },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByRole("searchbox", { name: "Search agent sessions" }), "validation");
    await expect(canvas.getByText("Validation repair")).toBeVisible();
    await expect(canvas.queryByText("Source inventory")).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Import" }));
    await expect(args.onImport).toHaveBeenCalledWith(sessions[1]);
  },
};

export const Empty: Story = {
  args: {
    state: { status: "ready", sessions: [], hasMore: false },
  },
};

export const Unavailable: Story = {
  args: {
    state: { status: "error", message: "The agent stopped before it returned history." },
  },
};
