import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent } from "storybook/test";
import { MOCK_BUNDLE, MOCK_FOLDER } from "@/mock/fixture.ts";
import { mockRetrieval } from "@/features/agent/retrieval/mockRetrieval.ts";
import type { RetrievalResult } from "@/features/agent/retrieval/types.ts";
import { RetrievalLab } from "./RetrievalLab.tsx";

const result = mockRetrieval(MOCK_BUNDLE, {
  query: "concept reader",
  route: "exact-lexical",
  contextBudgetTokens: 4096,
});

const meta = {
  title: "Agent/Retrieval/RetrievalLab",
  component: RetrievalLab,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div style={{ height: 760, minWidth: 0 }}>
        <Story />
      </div>
    ),
  ],
  args: {
    bundleRoot: MOCK_FOLDER,
    bundleName: MOCK_BUNDLE.name,
    initialResult: result,
    onClose: fn(),
    onOpenConcept: fn(),
    onReviewRepair: fn(),
  },
} satisfies Meta<typeof RetrievalLab>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Ready: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: /Evidence Lab/i })).toBeVisible();
    await expect(canvas.getByText(/does not contact an agent/i)).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Review sources" }));
    await expect(canvas.getByRole("heading", { name: "Evidence behind this answer" })).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Conversation" }));
    await expect(canvas.getByRole("heading", { name: /Evidence Lab/i })).toBeVisible();
    await userEvent.click(canvas.getByText("Technical report"));
    await userEvent.click(canvas.getByRole("button", { name: "Export technical report" }));
    await expect(canvas.findByText(/Saved retrieval-/i)).resolves.toBeVisible();
    await userEvent.click(canvas.getByText("Technical report"));
  },
};

export const CompareRoutes: Story = {
  play: async ({ canvas }) => {
    await userEvent.selectOptions(canvas.getByLabelText("Compare with"), "coverage");
    await userEvent.click(canvas.getByRole("button", { name: "Compare evidence" }));
    await expect(canvas.findByLabelText("Evidence comparison result")).resolves.toBeVisible();
    await expect(canvas.getByRole("button", { name: "Use this evidence set" })).toBeVisible();
  },
};

export const EmptyStart: Story = {
  args: { initialResult: undefined },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: "Investigate a question" })).toBeVisible();
    await userEvent.type(canvas.getByLabelText("Question to investigate"), "graph reader");
    await userEvent.click(canvas.getByRole("button", { name: "Find evidence" }));
    await expect(canvas.findByRole("heading", { name: "Evidence is available" })).resolves.toBeVisible();
  },
};

export const CancelledRun: Story = {
  args: {
    initialResult: undefined,
    retrieve: async () => new Promise<RetrievalResult>(() => undefined),
  },
  play: async ({ canvas }) => {
    await userEvent.type(canvas.getByLabelText("Question to investigate"), "a retained query");
    await userEvent.click(canvas.getByRole("button", { name: "Find evidence" }));
    await userEvent.click(canvas.getByRole("button", { name: "Stop" }));
    await expect(canvas.getByRole("status")).toHaveTextContent("Search stopped");
    await expect(canvas.getByLabelText("Question to investigate")).toHaveValue("a retained query");
    await expect(canvas.getByRole("button", { name: "Find evidence" })).toBeEnabled();
  },
};

export const ReviewOnlyRepair: Story = {
  args: {
    initialResult: {
      ...result,
      repairs: [
        {
          proposalId: "repair-concept-reader-description",
          kind: "add-description",
          conceptId: "features/concept-reader",
          rationale: "The concept needs a concise reviewed description for inventory retrieval.",
          evidenceSectionIds: [result.evidence.items[0].sectionId],
          expectedQuery: "concept reader",
          heldOutQueries: ["features/concept-reader", "Concept Reader"],
          expectedImprovement: "Improve discovery without reducing exact identity lookup.",
          requiresReview: true,
        },
      ],
    },
  },
  play: async ({ args, canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Review change" }));
    await expect(args.onReviewRepair).toHaveBeenCalledWith(
      expect.objectContaining({ conceptId: "features/concept-reader" }),
    );
  },
};

export const Narrow360: Story = {
  decorators: [(Story) => <div style={{ width: 360, maxWidth: "100%", height: 760, containerType: "inline-size" }}><Story /></div>],
  play: async ({ canvas, canvasElement }) => {
    await expect(canvas.getByRole("heading", { name: /Evidence Lab/i })).toBeVisible();
    await expect(canvasElement.scrollWidth).toBeLessThanOrEqual(canvasElement.clientWidth);
  },
};

export const Narrow440: Story = {
  decorators: [(Story) => <div style={{ width: 440, maxWidth: "100%", height: 760, containerType: "inline-size" }}><Story /></div>],
};

export const Narrow560: Story = {
  decorators: [(Story) => <div style={{ width: 560, maxWidth: "100%", height: 760, containerType: "inline-size" }}><Story /></div>],
};
