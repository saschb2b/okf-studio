import { NO_PROVENANCE } from "@/mock/conceptFixtures.ts";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import type { Concept } from "@/shared/types.ts";
import { ConceptMoveDialog } from "./ConceptMoveDialog.tsx";

const concept: Concept = {
  id: "features/graph-view",
  type: "Feature",
  title: "Graph View",
  description: "Explore connected concepts.",
  tags: ["graph"],
  timestamp: "2026-07-23T12:00:00Z",
  resource: null,
  extra: { stable_id: "concept-stable-01" },
  body: "The graph links to [the reader](concept-reader.md).",
  links: ["features/concept-reader"],
  externalLinks: [],
  brokenLinks: [],
  citedBy: ["index"],
  ...NO_PROVENANCE,
  degree: 2,
};

const meta = {
  title: "Reader/ConceptMoveDialog",
  component: ConceptMoveDialog,
  args: {
    open: true,
    bundleRoot: "/mock/docs",
    concept,
    onOpenChange: fn(),
    onOpenMovedConcept: fn(),
  },
} satisfies Meta<typeof ConceptMoveDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Destination: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body);
    await expect(canvas.getByRole("dialog", { name: "Move concept" })).toBeVisible();
    await expect(canvas.getByLabelText("Destination path"))
      .toHaveValue("archive/graph-view.md");
  },
};

export const ReviewedAndValidated: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByRole("button", { name: "Review move" }));
    await expect(await canvas.findByRole("region", { name: "Move impact" }))
      .toHaveTextContent("3 files");

    while (canvas.queryAllByRole("button", { name: "Review file" }).length > 0) {
      await userEvent.click(canvas.getAllByRole("button", { name: "Review file" })[0]);
    }
    await userEvent.click(canvas.getAllByRole("button", { name: "Reject" })[0]);
    await expect(canvas.getByRole("button", { name: "Validate" })).toBeDisabled();
    for (const button of canvas.getAllByRole("button", { name: "Keep" })) {
      await userEvent.click(button);
    }
    const validate = canvas.getByRole("button", { name: "Validate" });
    await waitFor(() => expect(validate).toBeEnabled());
    await userEvent.click(validate);
    await expect(await canvas.findByRole("status", { name: "Concept move validation" }))
      .toHaveTextContent("OKF validation passed");
  },
};

export const Narrow: Story = {
  parameters: { viewport: { defaultViewport: "mobile1" } },
};
