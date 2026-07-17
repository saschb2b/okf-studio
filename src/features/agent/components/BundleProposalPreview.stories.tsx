// The okf-proposal preview under an agent message: parsed through the real
// parser (the story fixture is the wire format), the invalid fallback, and
// the generate-into-staging affordance across its gate states.
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { parseBundleProposal } from "@/features/agent/bundleProposal.ts";
import { BundleProposalPreview } from "./BundleProposalPreview.tsx";

const PROPOSAL_MARKDOWN = "Here is the proposed structure.\n\n```okf-proposal\n" + JSON.stringify({
  concepts: [
    { path: "product/overview.md", title: "Overview", type: "Product", links: ["architecture/system.md"] },
    { path: "architecture/system.md", title: "System", type: "Architecture", links: [] },
    { path: "architecture/ipc.md", title: "IPC & Security", type: "Architecture", links: ["architecture/system.md"] },
  ],
  indexes: [
    { path: "index.md", concepts: ["product/overview.md"] },
    { path: "architecture/index.md", concepts: ["architecture/system.md", "architecture/ipc.md"] },
  ],
}) + "\n```";

const ready = parseBundleProposal(PROPOSAL_MARKDOWN);
const invalid = parseBundleProposal("```okf-proposal\n{not json}\n```");

const meta = {
  title: "Agent/Staging/BundleProposalPreview",
  component: BundleProposalPreview,
  args: {
    result: ready,
    onGenerate: fn(),
    generationBlockedReason: null,
    generationError: null,
    isGenerating: false,
  },
} satisfies Meta<typeof BundleProposalPreview>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Ready: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: /Generate in staging/i }));
    await waitFor(() => expect(args.onGenerate).toHaveBeenCalled());
  },
};

export const InvalidBlock: Story = {
  args: { result: invalid },
};

/** Generation gated (no thread grant yet) — the reason replaces the button's action. */
export const GenerationBlocked: Story = {
  args: { generationBlockedReason: "Allow edits in this thread to generate the draft." },
};

export const GenerationFailed: Story = {
  args: { generationError: "Staging rejected one path outside the bundle." },
};

export const Generating: Story = {
  args: { isGenerating: true },
};
