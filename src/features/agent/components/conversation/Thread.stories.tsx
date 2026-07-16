// The conversation as a whole — a realistic transcript at panel width, so
// the Zed document flow (prose as the document, quiet tool rows, carded
// mutations, bordered user blocks) is judged as a composition, not per item.
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Message, PlanCard, ToolCard } from "./items.tsx";
import type { ConversationMessage, ConversationPlan, ConversationTool } from "./types.ts";

const user = (id: string, text: string): ConversationMessage => ({ id, role: "user", text });
const agent = (id: string, text: string): ConversationMessage => ({ id, role: "agent", text });
const tool = (id: string, over: Partial<ConversationTool>): ConversationTool => ({
  id,
  role: "tool",
  turnId: "turn-1",
  toolCallId: id,
  title: "Tool",
  toolKind: "other",
  status: "completed",
  locations: [],
  changeState: null,
  content: [],
  ...over,
});

function Thread({ width }: { width: number }) {
  const plan: ConversationPlan = {
    id: "plan",
    role: "plan",
    entries: [
      { content: "Find conflicting claims", priority: "high", status: "completed" },
      { content: "Reconcile the definitions", priority: "high", status: "completed" },
    ],
  };
  return (
    <div className="agent-conversation" style={{ width, border: "1px solid var(--border)" }}>
      <Message message={user("u1", "Reconcile the order definitions across the bundle.")} isRetrying={false} retryError={null} generationBlockedReason={null} generationError={null} isGeneratingProposal={false} />
      <ToolCard tool={tool("t1", { title: "Read concepts/orders.md", toolKind: "read" })} />
      <ToolCard tool={tool("t2", { title: "Search the bundle for \"draft cart\"", toolKind: "search", locations: [
        { path: "concepts/orders.md", line: 3 },
        { path: "metrics/weekly-active.md", line: 11 },
      ] })} />
      <Message message={agent("a1", "Two definitions disagree: `concepts/orders.md` **counts draft carts**, while the metric excludes them. The checkout pipeline is the authority, so I am aligning the concept to it.")} isRetrying={false} retryError={null} generationBlockedReason={null} generationError={null} isGeneratingProposal={false} />
      <ToolCard tool={tool("t3", {
        title: "Edit concepts/orders.md",
        toolKind: "edit",
        changeState: "staged",
        content: [{
          kind: "diff",
          path: "concepts/orders.md",
          diff: "@@ -1,3 +1,3 @@\n # Orders\n \n-One row per cart, including drafts.\n+One row per completed checkout; draft carts never land here.\n",
          truncated: false,
        }],
      })} />
      <ToolCard tool={tool("t4", {
        title: "node okf-validate.mjs . --strict",
        toolKind: "execute",
        content: [{ kind: "text", text: "0 error(s), 0 warning(s); 0 broken link(s), 0 orphan(s). Conformant.", truncated: false }],
      })} />
      <PlanCard plan={plan} />
      <Message message={agent("a2", "Both definitions now agree; the staged change is ready for your review.")} isRetrying={false} retryError={null} generationBlockedReason={null} generationError={null} isGeneratingProposal={false} />
    </div>
  );
}

const meta = {
  title: "Agent/Conversation/Thread",
  component: Thread,
} satisfies Meta<typeof Thread>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The default panel width. */
export const PanelWidth: Story = { args: { width: 440 } };

/** The narrow floor — nothing may clip or overlap. */
export const NarrowWidth: Story = { args: { width: 360 } };
