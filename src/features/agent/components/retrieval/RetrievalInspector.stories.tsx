import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent } from "storybook/test";
import { MOCK_BUNDLE } from "@/mock/fixture.ts";
import { mockRetrieval } from "@/features/agent/retrieval/mockRetrieval.ts";
import type { RetrievalResult } from "@/features/agent/retrieval/types.ts";
import { RetrievalInspector } from "./RetrievalInspector.tsx";
import "../AgentConversation.css";

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
    await expect(canvas.getByRole("heading", { name: "Evidence behind this answer" })).toBeVisible();
    await expect(canvas.getByRole("heading", { name: "Evidence is available" })).toBeVisible();
    const source = canvas.getByRole("button", { name: /Concept Reader/i });
    await userEvent.click(source);
    await expect(args.onOpenConcept).toHaveBeenCalledWith("features/concept-reader");
    await userEvent.selectOptions(canvas.getByLabelText("Search method"), "lexical-graph");
    await userEvent.click(canvas.getByRole("button", { name: "Search evidence again" }));
    await expect(args.onRerun).toHaveBeenCalledWith("lexical-graph");
    await userEvent.click(canvas.getByText("Technical details"));
    await expect(canvas.getByRole("heading", { name: "Candidates considered" })).toBeVisible();
    await expect(canvas.getByRole("columnheader", { name: "Decision" })).toBeVisible();
    await userEvent.click(canvas.getByText("Technical details"));
  },
};

export const Empty: Story = {
  args: { result: emptyResult(ready) },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: "No supporting evidence found" })).toBeVisible();
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
    await expect(canvas.getByRole("heading", { name: "The evidence may be incomplete" }))
      .toBeVisible();
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
          conceptIds: ready.evidence.items.slice(0, 2).map((item) => item.conceptId),
          message: "Two reviewed sources make different current-state claims.",
        }],
      },
      diagnostic: {
        class: "conflicting-evidence",
        summary: "Selected sources make competing claims.",
        affectedConceptIds: ready.evidence.items.slice(0, 2).map((item) => item.conceptId),
        suggestedAction: "Inspect both sources before answering.",
      },
    },
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: "Sources disagree" })).toBeVisible();
    await expect(canvas.getByText(/not an app error/i)).toBeVisible();
    await expect(canvas.getAllByText("May conflict").length).toBeGreaterThan(0);
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
  play: async ({ canvas }) => {
    const capability = canvas.getByRole("heading", { name: "Search capabilities" });
    await expect(capability).not.toBeVisible();
    await userEvent.click(canvas.getByText("Technical details"));
    await expect(capability).toBeVisible();
    await expect(canvas.getByText("Semantic matching")).toBeVisible();
    await expect(canvas.getByText("Not configured")).toBeVisible();
    await userEvent.click(canvas.getByText("Technical details"));
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
    await expect(canvas.getByRole("button", { name: "Searching…" })).toBeDisabled();
    await expect(canvas.getByText(/Searching the bundle/i)).toBeVisible();
  },
};

export const RerunFailed: Story = {
  args: { rerunError: "The bundle changed while Studio was rebuilding the manifest." },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("alert")).toHaveTextContent("bundle changed");
  },
};

export const Narrow360: Story = {
  decorators: [(Story) => <div style={{ width: 360, maxWidth: "100%", height: 720, containerType: "inline-size" }}><Story /></div>],
  play: async ({ canvas, canvasElement }) => {
    await expect(canvas.getByRole("heading", { name: "Evidence behind this answer" })).toBeVisible();
    await expect(canvasElement.scrollWidth).toBeLessThanOrEqual(canvasElement.clientWidth);
  },
};

export const Narrow440: Story = {
  decorators: [(Story) => <div style={{ width: 440, maxWidth: "100%", height: 720, containerType: "inline-size" }}><Story /></div>],
};

export const Narrow560LongContent: Story = {
  decorators: [(Story) => <div style={{ width: 560, maxWidth: "100%", height: 720, containerType: "inline-size" }}><Story /></div>],
  args: { result: longResult(ready) },
};

export const ConversationReplacement: Story = {
  decorators: [
    (Story) => (
      <div className="agent-conversation" style={{ height: 720 }}>
        <div
          className="agent-conversation__transcript-owner"
          data-testid="retained-transcript"
          hidden
        >
          Retained conversation
        </div>
        <Story />
        <div
          data-testid="composer-boundary"
          style={{ flex: "0 0 96px", padding: "var(--space-12)", borderTop: "1px solid var(--border)" }}
        >
          Composer
        </div>
      </div>
    ),
  ],
  play: async ({ canvas }) => {
    const transcript = canvas.getByTestId("retained-transcript");
    const composer = canvas.getByTestId("composer-boundary");
    const heading = canvas.getByRole("heading", { name: "Evidence behind this answer" });
    const inspector = heading.closest<HTMLElement>(".retrieval-inspector");
    if (!inspector) throw new Error("The retrieval inspector was not rendered.");

    await expect(getComputedStyle(transcript).display).toBe("none");
    await expect(inspector.getBoundingClientRect().bottom)
      .toBeLessThanOrEqual(composer.getBoundingClientRect().top);
  },
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
