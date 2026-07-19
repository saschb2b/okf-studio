import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent } from "storybook/test";
import { MOCK_BUNDLE } from "@/mock/fixture.ts";
import { mockRetrieval } from "@/features/agent/retrieval/mockRetrieval.ts";
import { RetrievalEvidenceSummary } from "./RetrievalEvidenceSummary.tsx";

const readyResult = mockRetrieval(MOCK_BUNDLE, {
  query: "concept reader",
  route: "lexical-graph",
  contextBudgetTokens: 4096,
});

const meta = {
  title: "Agent/Retrieval/RetrievalEvidenceSummary",
  component: RetrievalEvidenceSummary,
  parameters: { layout: "padded" },
  decorators: [
    (Story) => (
      <div style={{ width: 640, maxWidth: "100%" }}>
        <Story />
      </div>
    ),
  ],
  args: {
    result: readyResult,
    onInspect: fn(),
  },
} satisfies Meta<typeof RetrievalEvidenceSummary>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Ready: Story = {
  play: async ({ args, canvas }) => {
    const trigger = canvas.getByRole("button", { name: /Inspect evidence/i });
    await expect(trigger).toHaveTextContent(/excerpt.*Related concepts/i);
    await expect(trigger).toHaveTextContent("Inspect");
    await expect(trigger.getBoundingClientRect().height).toBeLessThanOrEqual(40);
    await userEvent.click(trigger);
    await expect(args.onInspect).toHaveBeenCalledOnce();
  },
};

export const ConflictingEvidence: Story = {
  args: {
    result: {
      ...readyResult,
      evidence: {
        ...readyResult.evidence,
        requiresAbstention: true,
        caveats: [{
          kind: "conflict",
          conceptIds: readyResult.evidence.items.slice(0, 2).map((item) => item.conceptId),
          message: "The selected sources make competing claims.",
        }],
      },
      diagnostic: {
        class: "conflicting-evidence",
        summary: "Selected sources make competing claims.",
        affectedConceptIds: readyResult.evidence.items.slice(0, 2).map((item) => item.conceptId),
        suggestedAction: "Inspect the competing sources.",
      },
    },
  },
  play: async ({ canvas }) => {
    const trigger = canvas.getByRole("button", { name: /Inspect evidence/i });
    await expect(trigger).toHaveTextContent("Conflicting evidence");
    await expect(trigger).toHaveAccessibleName(/selected sources disagree/i);
    await expect(canvas.queryByText(/Answer must qualify uncertainty/i)).not.toBeInTheDocument();
  },
};

export const RemoteProviderDisclosure: Story = {
  args: {
    result: {
      ...readyResult,
      receipt: {
        ...readyResult.receipt,
        providers: readyResult.receipt.providers.map((provider) => ({
          ...provider,
          state: "configured" as const,
          remoteTextShared: true,
        })),
      },
    },
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Shared remotely")).toBeVisible();
  },
};

export const Narrow360: Story = {
  decorators: [
    (Story) => (
      <div style={{ width: 360, maxWidth: "100%", containerType: "inline-size" }}>
        <Story />
      </div>
    ),
  ],
  play: async ({ canvas, canvasElement }) => {
    await expect(canvas.getByRole("button", { name: /Inspect evidence/i })).toBeVisible();
    await expect(canvasElement.scrollWidth).toBeLessThanOrEqual(canvasElement.clientWidth);
  },
};
