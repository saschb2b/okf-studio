// The prompt input across the states a user actually meets. The composer sits
// in a resizable side panel, so the width fixtures matter as much as the
// states: the action bar is where labels run out of room first.
import { useState } from "react";
import { Plus } from "lucide-react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent } from "storybook/test";
import { AgentComposer } from "./AgentComposer.tsx";
import "@/features/agent/components/AgentConversation.css";

/** Stands in for AttachmentPicker, which loads concepts and threads. */
function AttachmentsSlot({ disabled = false }: { disabled?: boolean }) {
  return (
    <button
      type="button"
      className="agent-attachment-trigger btn ghost icon"
      aria-label="Add context"
      disabled={disabled}
    >
      <Plus size={16} aria-hidden="true" />
    </button>
  );
}

/** Stands in for AgentSessionControls, which reads the live session config. */
function SessionControlsSlot({ labels }: { labels: string[] }) {
  return (
    <div className="agent-session-controls">
      {labels.map((label) => (
        <button key={label} type="button" className="btn ghost">
          {label}
        </button>
      ))}
    </div>
  );
}

/**
 * The composer is a form control, so Send and Queue are submit buttons. The
 * wrapper carries `.agent-conversation` because the action bar's responsive
 * rules are container queries against that element. Without it the bar keeps
 * every label at every width and the narrow stories would lie.
 */
function ComposerHarness(props: React.ComponentProps<typeof AgentComposer>) {
  const [value, setValue] = useState(props.value);
  return (
    <div className="agent-conversation">
      <form
        className="agent-composer"
        onSubmit={(event) => event.preventDefault()}
        style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-lg)" }}
      >
        <AgentComposer {...props} value={value} onValueChange={setValue} />
      </form>
    </div>
  );
}

const meta = {
  title: "Agent/Conversation/AgentComposer",
  component: AgentComposer,
  render: (args) => <ComposerHarness {...args} />,
  decorators: [
    (Story) => (
      <div style={{ width: 560, maxWidth: "100%" }}>
        <Story />
      </div>
    ),
  ],
  args: {
    inputId: "composer-prompt",
    value: "",
    onValueChange: fn(),
    placeholder: "Ask about this bundle... Use @ for context",
    attachments: <AttachmentsSlot />,
    sessionControls: <SessionControlsSlot labels={["Sonnet", "Ask"]} />,
    onStop: fn(),
  },
} satisfies Meta<typeof AgentComposer>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Nothing typed and no turn yet, which is the quietest the bar ever gets:
 * the add button, the session controls, and an inert Send. No status, no
 * context reading, no cost.
 */
export const Empty: Story = {
  args: { sendDisabled: true },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByPlaceholderText("Ask about this bundle... Use @ for context"),
    ).toBeEnabled();
    await expect(canvas.getByRole("button", { name: "Send" })).toBeDisabled();
    await expect(canvas.queryByText(/context/)).toBeNull();
  },
};

/** A draft the user typed. Send is live. */
export const WithDraft: Story = {
  args: { value: "Which concepts contradict the retention policy?" },
  play: async ({ canvas }) => {
    const input = canvas.getByRole("textbox", { name: "Message the agent" });
    await userEvent.type(input, " Cite them.");
    await expect(input).toHaveValue(
      "Which concepts contradict the retention policy? Cite them.",
    );
  },
};

/**
 * The reading appears from 75% up, so this is the first state that carries
 * one. Cost stays in the tooltip: a running total to four decimals answered
 * no question at a glance and pushed the session controls into truncation.
 */
export const ContextApproachingFull: Story = {
  args: {
    value: "Summarize what changed since the last review.",
    usage: {
      visible: "78% context",
      detail: "156,000 of 200,000 context tokens used. Cumulative session cost: $1.53.",
    },
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("78% context")).toBeVisible();
    await expect(canvas.queryByText(/\$1\.53/)).toBeNull();
  },
};

/** At the ceiling. The recovery notice sits above the composer in the app. */
export const ContextNearlyFull: Story = {
  args: {
    value: "Continue from the previous answer.",
    usage: {
      visible: "94% context",
      detail: "188,400 of 200,000 context tokens used. Cumulative session cost: $4.10.",
    },
  },
};

/** A turn is running: Send becomes Queue, and Stop appears beside it. */
export const TurnRunning: Story = {
  args: {
    value: "Also check the migration notes.",
    turnActive: true,
    status: "Agent is working",
  },
  play: async ({ args, canvas }) => {
    await expect(canvas.getByRole("button", { name: "Queue" })).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Stop" }));
    await expect(args.onStop).toHaveBeenCalledOnce();
  },
};

/** The follow-up is held. Typing is blocked until the turn ends. */
export const FollowUpQueued: Story = {
  args: {
    value: "And list the orphaned concepts.",
    turnActive: true,
    queued: true,
    disabled: true,
    sendDisabled: true,
    status: "Follow-up queued",
    attachments: <AttachmentsSlot disabled />,
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("textbox", { name: "Message the agent" })).toBeDisabled();
    await expect(canvas.getByRole("button", { name: "Queued" })).toBeDisabled();
  },
};

/** Between submit and the first token. */
export const Submitting: Story = {
  args: {
    value: "Draft the release note.",
    disabled: true,
    isSubmitting: true,
    sendDisabled: true,
    status: "Starting turn",
    attachments: <AttachmentsSlot disabled />,
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("button", { name: "Sending..." })).toBeDisabled();
  },
};

/** Stop was pressed and the cancel is in flight. */
export const Stopping: Story = {
  args: {
    value: "Also check the migration notes.",
    turnActive: true,
    isCancelling: true,
    sendDisabled: true,
    status: "Agent is working",
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("button", { name: "Stopping..." })).toBeDisabled();
  },
};

/** The Studio Agent has its own placeholder and no bundle attachments. */
export const StudioAgent: Story = {
  args: {
    placeholder: "Message Studio Agent... Use @ for context",
    sessionControls: <SessionControlsSlot labels={["Studio Agent"]} />,
  },
};

/**
 * The narrow panel fixture. The action bar is the first thing to run out of
 * room, so this is the width that decides how many labels the bar can carry.
 */
export const NarrowPanel: Story = {
  args: {
    value: "Which concepts contradict the retention policy?",
    usage: { visible: "81% context", detail: "162,000 of 200,000 context tokens used." },
  },
  decorators: [
    (Story) => (
      <div style={{ width: 360 }}>
        <Story />
      </div>
    ),
  ],
};

/**
 * Every optional slot filled at the narrow width. This is the regression
 * guard: the bar used to truncate its own controls to "Default (recommend..."
 * because a permanent capability label and a four-decimal cost sat in front
 * of them.
 */
export const Crowded: Story = {
  args: {
    value: "Compare both definitions.",
    turnActive: true,
    status: "Agent is working",
    usage: {
      visible: "94% context",
      detail: "188,400 of 200,000 context tokens used. Session cost: $4.10.",
    },
    sessionControls: <SessionControlsSlot labels={["Sonnet", "Ask", "Default"]} />,
  },
  decorators: [
    (Story) => (
      <div style={{ width: 360 }}>
        <Story />
      </div>
    ),
  ],
};
