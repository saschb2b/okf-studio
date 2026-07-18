import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent } from "storybook/test";
import { MOCK_BUNDLE } from "@/mock/fixture.ts";
import { mockRetrieval } from "@/features/agent/retrieval/mockRetrieval.ts";
import type { RetrievalResult } from "@/features/agent/retrieval/types.ts";
import { RetrievalInspector } from "./RetrievalInspector.tsx";

const ready = mockRetrieval(MOCK_BUNDLE, {
  query: "concept reader",
  route: "exact-lexical",
  contextBudgetTokens: 4096,
});

const meta = {
  title: "Agent/Retrieval/RetrievalInspector",
  component: RetrievalInspector,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div style={{ height: 720, minWidth: 0 }}>
        <Story />
      </div>
    ),
  ],
  args: {
    result: ready,
    onClose: fn(),
    onOpenConcept: fn(),
    onRerun: fn(),
  },
} satisfies Meta<typeof RetrievalInspector>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Ready: Story = {
  play: async ({ args, canvas }) => {
    await expect(canvas.getByRole("heading", { name: "Evidence for this answer" })).toBeVisible();
    const source = canvas.getByRole("button", { name: /Concept Reader/i });
    await userEvent.click(source);
    await expect(args.onOpenConcept).toHaveBeenCalledWith("features/concept-reader");
    await userEvent.selectOptions(canvas.getByLabelText("Route"), "lexical-graph");
    await expect(args.onRerun).toHaveBeenCalledWith("lexical-graph");
  },
};

export const Empty: Story = {
  args: { result: emptyResult(ready) },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: "No evidence matched" })).toBeVisible();
    await expect(canvas.getByText(/Check the query/i)).toBeVisible();
  },
};

export const PartialAndOversized: Story = {
  args: {
    result: mockRetrieval(MOCK_BUNDLE, {
      query: "concept",
      route: "coverage",
      contextBudgetTokens: 80,
    }),
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText(
      "Relevant evidence was omitted because it did not fit the context budget.",
    )).toBeVisible();
  },
};

export const Conflict: Story = {
  args: {
    result: {
      ...ready,
      evidence: {
        ...ready.evidence,
        requiresAbstention: true,
        caveats: [{
          kind: "conflict",
          conceptIds: ["policies/current", "policies/old"],
          message: "Two reviewed sources make different current-state claims.",
        }],
      },
      diagnostic: {
        class: "conflicting-evidence",
        summary: "Selected sources make competing claims.",
        affectedConceptIds: ["policies/current", "policies/old"],
        suggestedAction: "Inspect both sources before answering.",
      },
    },
  },
};

export const ProviderUnavailable: Story = {
  args: {
    result: {
      ...ready,
      receipt: {
        ...ready.receipt,
        providers: [{
          capability: "dense-retrieval",
          providerId: null,
          state: "unavailable",
          remoteTextShared: false,
          detail: "No embedding provider is configured; Studio used the complete local fallback.",
        }],
      },
    },
  },
};

export const Stale: Story = {
  args: {
    result: {
      ...ready,
      evidence: {
        ...ready.evidence,
        caveats: [{
          kind: "stale",
          conceptIds: ready.evidence.items.map((item) => item.conceptId),
          message: "This receipt belongs to an older bundle fingerprint.",
        }],
      },
      diagnostic: {
        class: "stale-manifest",
        summary: "The result remains readable but is stale.",
        affectedConceptIds: ready.evidence.items.map((item) => item.conceptId),
        suggestedAction: "Rebuild and rerun the retained query.",
      },
    },
  },
};

export const Rerunning: Story = {
  args: { rerunning: true },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("button", { name: "Rerunning…" })).toBeDisabled();
  },
};

export const RerunFailed: Story = {
  args: { rerunError: "The bundle changed while Studio was rebuilding the manifest." },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("alert")).toHaveTextContent("bundle changed");
  },
};

export const Narrow360: Story = {
  decorators: [(Story) => <div style={{ width: 360, maxWidth: "100%", height: 720 }}><Story /></div>],
};

export const Narrow440: Story = {
  decorators: [(Story) => <div style={{ width: 440, maxWidth: "100%", height: 720 }}><Story /></div>],
};

export const Narrow560LongContent: Story = {
  decorators: [(Story) => <div style={{ width: 560, maxWidth: "100%", height: 720 }}><Story /></div>],
  args: { result: longResult(ready) },
};

function emptyResult(result: RetrievalResult): RetrievalResult {
  return {
    ...result,
    evidence: {
      ...result.evidence,
      items: [],
      estimatedTokens: 0,
      bytes: 0,
      requiresAbstention: true,
    },
    receipt: { ...result.receipt, candidates: [], contextTokensUsed: 0 },
    diagnostic: {
      class: "empty-results",
      summary: "No evidence matched this query in the granted bundle.",
      affectedConceptIds: [],
      suggestedAction: "Check the query or use a broader available route.",
    },
  };
}

function longResult(result: RetrievalResult): RetrievalResult {
  const first = result.evidence.items[0];
  return {
    ...result,
    evidence: {
      ...result.evidence,
      items: Array.from({ length: 18 }, (_, index) => ({
        ...first,
        sectionId: `${first.sectionId}-${index}`,
        conceptId: `${first.conceptId}/nested/very-long-concept-identity-${index}`,
        conceptTitle: `Evidence source ${index + 1} with a long title that must wrap without moving the score column`,
        text: `${first.text}\n\n${"Long evidence remains readable. ".repeat(12)}`,
      })),
    },
  };
}
