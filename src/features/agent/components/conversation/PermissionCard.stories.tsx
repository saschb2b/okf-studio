// The blocking permission decision: options come from the agent, so the
// card must render whatever option set arrives — with and without an
// explicit reject, with and without the remember-for-thread choice.
import type { Meta, StoryObj } from "@storybook/react-vite";
import { PermissionCard } from "./items.tsx";
import type { PendingPermission } from "./types.ts";

const base: PendingPermission = {
  requestId: "permission-story",
  connectionId: "connection-story",
  sessionId: "session-story",
  update: {
    kind: "requested",
    toolCallId: "tool-story",
    title: "Write concepts/orders.md into the staged revision",
    options: [
      { optionId: "allow-once", name: "Allow once", kind: "allow-once" },
      { optionId: "reject-once", name: "Reject", kind: "reject-once" },
    ],
    canRemember: true,
  },
};

const meta = {
  title: "Agent/Conversation/PermissionCard",
  component: PermissionCard,
} satisfies Meta<typeof PermissionCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AllowAndReject: Story = {
  args: { permission: base },
};

/** No reject option advertised — the card supplies its own Cancel. */
export const WithoutRejectOption: Story = {
  args: {
    permission: {
      ...base,
      update: {
        ...base.update,
        options: [{ optionId: "allow-once", name: "Allow once", kind: "allow-once" }],
        canRemember: false,
      },
    },
  },
};

/** Untitled request — the card falls back to its generic explanation. */
export const UntitledRequest: Story = {
  args: {
    permission: {
      ...base,
      update: { ...base.update, title: null, canRemember: false },
    },
  },
};
