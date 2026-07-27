// The three message roles in the Zed-style document flow: the user's
// bordered editor-like block, agent markdown as plain document prose, and
// quiet status notices per tone.
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect } from "storybook/test";
import { Message } from "./items.tsx";

const meta = {
  title: "Agent/Conversation/Message",
  component: Message,
  args: {
    isRetrying: false,
    retryError: null,
    generationBlockedReason: null,
    generationError: null,
    isGeneratingProposal: false,
  },
} satisfies Meta<typeof Message>;

export default meta;
type Story = StoryObj<typeof meta>;

export const User: Story = {
  args: {
    message: {
      id: "user-story",
      role: "user",
      text: "Trace the conflicting source claims across the bundle.",
    },
  },
};

export const AgentMarkdown: Story = {
  args: {
    message: {
      id: "agent-story",
      role: "agent",
      text: "I found **two records** with conflicting claims:\n\n" +
        "1. `concepts/orders.md` counts draft carts\n" +
        "2. `metrics/weekly-active.md` excludes them\n\n" +
        "The `orders` concept is authoritative here — its definition cites the checkout pipeline.",
    },
  },
};

export const AgentContextSummary: Story = {
  args: {
    message: {
      id: "agent-summary-story",
      role: "agent",
      turnId: "turn-compact",
      contextSummary: { commandName: "compact" },
      text: "## Context summary\n\n- The thread is reviewing the active bundle.\n" +
        "- Proposed writes still require staged review and Apply.",
    },
  },
};

export const StatusNeutral: Story = {
  args: {
    message: {
      id: "status-story",
      role: "status",
      tone: "neutral",
      text: "Turn cancelled.",
    },
  },
};

export const StatusWarning: Story = {
  args: {
    message: {
      id: "status-warning",
      role: "status",
      tone: "warning",
      text: "The agent reached its token limit.",
    },
  },
};

export const StatusErrorWithRetry: Story = {
  args: {
    message: {
      id: "status-error",
      role: "status",
      tone: "error",
      text: "Turn failed. The agent process exited unexpectedly.",
    },
    onRetry: () => undefined,
  },
};

export const StatusRetryFailed: Story = {
  args: {
    message: {
      id: "status-retry-failed",
      role: "status",
      tone: "error",
      text: "Turn failed. The agent process exited unexpectedly.",
    },
    onRetry: () => undefined,
    retryError: "The connection is no longer active.",
  },
};

/**
 * An answer must be selectable so parts of it can be copied elsewhere.
 *
 * The app disables selection globally so dragging across chrome selects
 * nothing; the transcript was never opted back in, so no part of an answer could
 * be highlighted at all. Asserted against computed style in a real browser,
 * because that is the only place a stylesheet actually applies — a jsdom test
 * would pass whatever the CSS said.
 */
export const SelectableProse: Story = {
  args: {
    message: {
      id: "agent-selectable",
      role: "agent",
      turnId: "turn-selectable",
      text: "The sanctioned computation lives in the bundle, and a run is checked against it.",
    },
    showResponseActions: true,
  },
  play: async ({ canvasElement }) => {
    // Narrowed by a throw rather than by an assertion: the repo bans both `!`
    // and `as`, and a missing element is a real failure worth naming.
    const prose = canvasElement.querySelector(".agent-message__markdown");
    if (!prose) throw new Error("expected the agent message to render prose");
    await expect(getComputedStyle(prose).userSelect).toBe("text");

    // Interactive chrome inside a selectable message stays unselectable, so a
    // drag across the answer does not collect the words on its buttons.
    const button = canvasElement.querySelector(".agent-message button");
    if (button) {
      await expect(getComputedStyle(button).userSelect).toBe("none");
    }
  },
};
