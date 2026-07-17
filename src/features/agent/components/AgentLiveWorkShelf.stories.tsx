// The docked live-work shelf: the in-turn plan, a blocking permission
// decision ordered first, and the collapse affordance.
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import { LivePlan, PermissionCard } from "./conversation/items.tsx";
import type { ConversationPlan } from "./conversation/types.ts";
import { AgentLiveWorkShelf } from "./AgentLiveWorkShelf.tsx";

const plan: ConversationPlan = {
  id: "plan-live",
  role: "plan",
  entries: [
    { content: "Find conflicting claims", priority: "high", status: "completed" },
    { content: "Trace source references", priority: "high", status: "in-progress" },
    { content: "Prepare a cited summary", priority: "medium", status: "pending" },
  ],
};

const transcriptItems = [
  "Inspect the existing bundle structure and validation output.",
  "I found three concepts that need stronger source links.",
  "Compare the documented claims with the attached evidence.",
  "The first two claims agree; the third needs a narrower statement.",
  "Check every backlink before drafting the corrective changes.",
  "The backlink scan is running across the active bundle.",
];

const meta = {
  title: "Agent/Panel/LiveWorkShelf",
  component: AgentLiveWorkShelf,
  decorators: [
    // The shelf docks above the composer; a panel-width frame keeps it honest.
    (Story) => (
      <div style={{ width: "min(100%, 440px)", border: "1px solid var(--border)" }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof AgentLiveWorkShelf>;

export default meta;
type Story = StoryObj<typeof meta>;

export const PlanInProgress: Story = {
  args: {
    summary: "1 of 3 complete",
    children: <LivePlan plan={plan} />,
  },
};

/** Transcript growth cannot squeeze active work below its readable dock size. */
export const StableUnderTranscriptPressure: Story = {
  args: {
    summary: "1 complete · 5 remaining",
    children: (
      <LivePlan
        plan={{
          ...plan,
          entries: [
            ...plan.entries,
            { content: "Compare validation output", priority: "medium", status: "pending" },
            { content: "Draft corrective changes", priority: "medium", status: "pending" },
            { content: "Run final bundle checks", priority: "low", status: "pending" },
          ],
        }}
      />
    ),
  },
  render: (args) => (
    <section
      className="agent-conversation"
      aria-label="Agent workspace pressure fixture"
      style={{ height: "min(600px, 100vh)" }}
    >
      <div className="agent-transcript">
        <div
          className="agent-conversation__messages"
          role="log"
          aria-label="Agent transcript"
        >
          {transcriptItems.map((item, index) => (
            <div
              key={item}
              className={index % 2 === 0 ? "agent-message agent-message--user" : "agent-message"}
            >
              <p>{item}</p>
            </div>
          ))}
        </div>
      </div>
      <AgentLiveWorkShelf {...args} />
      <form className="agent-composer">
        <div className="agent-composer__input-shell">
          <textarea aria-label="Message the agent" placeholder="Ask about this bundle..." />
        </div>
      </form>
    </section>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const shelf = canvas.getByRole("region", { name: "Live work" });
    const transcript = canvas.getByRole("log", { name: "Agent transcript" });
    await expect(shelf.getBoundingClientRect().height).toBeGreaterThanOrEqual(216);
    await expect(canvas.getAllByText("Trace source references")[0]).toBeVisible();
    await expect(transcript.scrollHeight).toBeGreaterThan(transcript.clientHeight);
    await expect(canvas.getByRole("textbox", { name: "Message the agent" })).toBeVisible();

    const collapse = canvas.getByRole("button", { name: "Collapse live work" });
    await userEvent.click(collapse);
    await expect(collapse).toHaveFocus();
    await expect(shelf.getBoundingClientRect().height).toBeLessThan(216);

    await userEvent.click(canvas.getByRole("button", { name: "Expand live work" }));
    await expect(shelf.getBoundingClientRect().height).toBeGreaterThanOrEqual(216);
  },
};

/** A blocking permission decision renders before the plan and stays visible. */
export const BlockingPermission: Story = {
  args: {
    summary: "1 of 3 complete · 1 decision needed",
    blockingContent: (
      <PermissionCard
        permission={{
          requestId: "permission-shelf",
          connectionId: "connection-shelf",
          sessionId: "session-shelf",
          update: {
            kind: "requested",
            toolCallId: "tool-shelf",
            title: "Write concepts/orders.md into the staged revision",
            options: [
              { optionId: "allow-once", name: "Allow once", kind: "allow-once" },
              { optionId: "reject-once", name: "Reject", kind: "reject-once" },
            ],
            canRemember: true,
          },
        }}
      />
    ),
    children: <LivePlan plan={plan} />,
  },
};

export const NotCollapsible: Story = {
  args: {
    summary: "1 of 3 complete",
    collapsible: false,
    children: <LivePlan plan={plan} />,
  },
};
