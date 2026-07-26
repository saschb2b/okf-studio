import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import { Message } from "./items.tsx";
import type { ConversationMessage } from "./types.ts";
import { TranscriptSurface } from "./TranscriptSurface.tsx";

const user = (id: string, text: string): ConversationMessage => ({ id, role: "user", text });
const agent = (id: string, text: string): ConversationMessage => ({ id, role: "agent", text });

const messages = [
  user("u1", "Trace the source of every order definition in the bundle."),
  agent("a1", "I found the primary definition in `concepts/orders.md` and a conflicting summary in the weekly metric."),
  agent("a2", "The metric excludes draft carts. The concept currently includes them, so the two surfaces disagree."),
  user("u2", "Use the checkout pipeline as authority and explain the affected concepts."),
  agent("a3", "The checkout pipeline records completed checkouts only. I will align the order concept, its metric note, and the glossary entry."),
  agent("a4", "The staged revision now keeps all three definitions consistent and preserves the source links for review."),
  agent("a5", "The order concept changes its grain statement, while the weekly metric keeps its calculation and gains a direct authority note."),
  agent("a6", "The glossary entry now distinguishes a cart from an order and links back to the canonical concept instead of repeating the definition."),
  agent("a7", "Validation reports no broken links. The revision is ready for a file-by-file review before anything reaches the bundle."),
];

function TranscriptExample({ width }: { width: number }) {
  return (
    <div className="agent-conversation" style={{ width, height: 320, border: "1px solid var(--border)" }}>
      <TranscriptSurface hasItems hasUserMessage contentVersion={messages}>
        {messages.map((message) => (
          <div key={message.id} data-transcript-role={message.role}>
            <Message
              message={message}
              isRetrying={false}
              retryError={null}
              generationBlockedReason={null}
              generationError={null}
              isGeneratingProposal={false}
            />
          </div>
        ))}
      </TranscriptSurface>
    </div>
  );
}

const meta = {
  title: "Agent/Conversation/TranscriptSurface",
  component: TranscriptExample,
} satisfies Meta<typeof TranscriptExample>;

export default meta;
type Story = StoryObj<typeof meta>;

export const PanelWidth: Story = {
  args: { width: 440 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const transcript = canvas.getByRole("region", { name: "Conversation transcript" });
    transcript.focus();
    await userEvent.keyboard("{Home}");
    await expect(canvas.getByRole("button", { name: "Jump to transcript top" })).toBeDisabled();
    await userEvent.keyboard("{End}");
    await expect(canvas.getByRole("button", { name: "Jump to transcript bottom" })).toBeDisabled();
  },
};

/**
 * Prompt stepping over real layout. The unit test drives it with stubbed
 * offsets, so this is the one that would catch a selector or offset mistake
 * against an actual scroller.
 */
export const PromptStepping: Story = {
  args: { width: 440 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const transcript = canvas.getByRole("region", { name: "Conversation transcript" });
    const back = canvas.getByRole("button", { name: "Jump to previous prompt" });
    const forward = canvas.getByRole("button", { name: "Jump to next prompt" });

    transcript.focus();
    await userEvent.keyboard("{End}");
    // Two prompts in this transcript, so from the tail there is one step back to
    // the second and another to the first, and then nowhere further.
    await userEvent.click(back);
    const atSecond = transcript.scrollTop;
    await expect(atSecond).toBeGreaterThan(0);
    await userEvent.click(back);
    await expect(transcript.scrollTop).toBeLessThan(atSecond);
    await expect(back).toBeDisabled();

    await userEvent.click(forward);
    await expect(transcript.scrollTop).toBe(atSecond);
    await expect(forward).toBeDisabled();
  },
};

export const NarrowWidth: Story = { args: { width: 360 } };
