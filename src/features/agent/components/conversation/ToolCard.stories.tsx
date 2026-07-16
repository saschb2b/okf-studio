// Every visual state of a conversation tool call: the quiet Zed-style rows
// for lookups, and the bordered cards mutations/commands get — including the
// streamed inline diff and command-output bodies.
import type { Meta, StoryObj } from "@storybook/react-vite";
import { ToolCard } from "./items.tsx";
import type { ConversationTool } from "./types.ts";

const base: ConversationTool = {
  id: "tool-story",
  role: "tool",
  turnId: "turn-story",
  toolCallId: "story",
  title: "Search the bundle",
  toolKind: "search",
  status: "completed",
  locations: [],
  changeState: null,
  content: [],
};

const meta = {
  title: "Agent/Conversation/ToolCard",
  component: ToolCard,
} satisfies Meta<typeof ToolCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const RowCompleted: Story = {
  args: { tool: base },
};

export const RowRunning: Story = {
  args: { tool: { ...base, title: "Read concepts/orders.md", toolKind: "read", status: "in-progress" } },
};

export const RowFailed: Story = {
  args: { tool: { ...base, title: "Fetch https://example.com/spec", toolKind: "fetch", status: "failed" } },
};

export const RowWithInlineLocation: Story = {
  args: {
    tool: {
      ...base,
      title: "Read the active concept",
      toolKind: "read",
      locations: [{ path: "concepts/orders.md", line: 12 }],
    },
  },
};

export const RowWithManyLocations: Story = {
  args: {
    tool: {
      ...base,
      locations: [
        { path: "concepts/orders.md", line: 12 },
        { path: "concepts/customers.md", line: 3 },
        { path: "metrics/weekly-active.md", line: null },
      ],
    },
  },
};

export const EditCardWithDiff: Story = {
  args: {
    tool: {
      ...base,
      title: "Edit concepts/orders.md",
      toolKind: "edit",
      changeState: "staged",
      content: [{
        kind: "diff",
        path: "concepts/orders.md",
        diff: "@@ -1,4 +1,4 @@\n # Orders\n \n-One row per cart.\n+One row per completed checkout; draft carts never land here.\n",
        truncated: false,
      }],
    },
  },
};

export const EditCardNotStaged: Story = {
  args: {
    tool: {
      ...base,
      title: "Edit concepts/orders.md",
      toolKind: "edit",
      changeState: "not-staged",
      locations: [{ path: "concepts/orders.md", line: null }],
    },
  },
};

export const CommandCardWithOutput: Story = {
  args: {
    tool: {
      ...base,
      title: "node okf-validate.mjs bundle --strict",
      toolKind: "execute",
      content: [{
        kind: "text",
        text: 'OKF v0.1 check of "bundle": 139 concept(s), 0 error(s), 0 warning(s); 0 broken link(s), 0 orphan(s) [--strict]. Conformant.',
        truncated: false,
      }],
    },
  },
};

export const CardTruncatedDiff: Story = {
  args: {
    tool: {
      ...base,
      title: "Edit concepts/orders.md",
      toolKind: "edit",
      content: [{
        kind: "diff",
        path: "concepts/orders.md",
        diff: "@@ -1,2 +1,2 @@\n-old\n+new\n",
        truncated: true,
      }],
    },
  },
};
