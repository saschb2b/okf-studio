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
    await expect(canvas.getByRole("heading", { name: /Retrieval Lab/i })).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Inspect evidence" }));
    await expect(canvas.getByRole("heading", { name: "Evidence for this answer" })).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Conversation" }));
    await expect(canvas.getByRole("heading", { name: /Retrieval Lab/i })).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Export diagnostic" }));
    await expect(canvas.findByText(/Saved retrieval-/i)).resolves.toBeVisible();
  },
};

export const CompareRoutes: Story = {
  play: async ({ canvas }) => {
    await userEvent.selectOptions(canvas.getByLabelText("Compare with"), "coverage");
    await userEvent.click(canvas.getByRole("button", { name: "Compare routes" }));
    await expect(canvas.findByLabelText("Route comparison result")).resolves.toBeVisible();
  },
};

export const EmptyStart: Story = {
  args: { initialResult: undefined },
  play: async ({ canvas }) => {
    await expect(canvas.getByText(/Compare evidence paths/i)).toBeVisible();
    await userEvent.type(canvas.getByLabelText("Query"), "graph reader");
    await userEvent.click(canvas.getByRole("button", { name: "Run" }));
    await expect(canvas.findByText(/local route produced bounded evidence/i)).resolves.toBeVisible();
  },
};

export const CancelledRun: Story = {
  args: {
    initialResult: undefined,
    retrieve: async () => new Promise<RetrievalResult>(() => undefined),
  },
  play: async ({ canvas }) => {
    await userEvent.type(canvas.getByLabelText("Query"), "a retained query");
    await userEvent.click(canvas.getByRole("button", { name: "Run" }));
    await userEvent.click(canvas.getByRole("button", { name: "Cancel" }));
    await expect(canvas.getByRole("status")).toHaveTextContent("Retrieval cancelled");
    await expect(canvas.getByLabelText("Query")).toHaveValue("a retained query");
    await expect(canvas.getByRole("button", { name: "Run" })).toBeEnabled();
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
    await userEvent.click(canvas.getByRole("button", { name: "Review proposal" }));
    await expect(args.onReviewRepair).toHaveBeenCalledWith(
      expect.objectContaining({ conceptId: "features/concept-reader" }),
    );
  },
};

export const Narrow360: Story = {
  decorators: [(Story) => <div style={{ width: 360, maxWidth: "100%", height: 760 }}><Story /></div>],
};

export const Narrow440: Story = {
  decorators: [(Story) => <div style={{ width: 440, maxWidth: "100%", height: 760 }}><Story /></div>],
};

export const Narrow560: Story = {
  decorators: [(Story) => <div style={{ width: 560, maxWidth: "100%", height: 760 }}><Story /></div>],
};
