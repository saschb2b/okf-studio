import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { MOCK_BUNDLE } from "@/mock/fixture.ts";
import { ConceptRetirementDialog } from "./ConceptRetirementDialog.tsx";

const concept = MOCK_BUNDLE.concepts.find((candidate) => candidate.id === "product/overview")
  ?? MOCK_BUNDLE.concepts[0];

const meta = {
  title: "Reader/ConceptRetirementDialog",
  component: ConceptRetirementDialog,
  args: {
    open: true,
    bundle: MOCK_BUNDLE,
    concept,
    onOpenChange: fn(),
    onOpenConcept: fn(),
  },
} satisfies Meta<typeof ConceptRetirementDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Choices: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body);
    await expect(canvas.getByRole("dialog", { name: "Retire concept" })).toBeVisible();
    await expect(canvas.getByRole("radio", { name: /Deprecate/i })).toBeChecked();
    await expect(canvas.getByRole("button", { name: "Review deprecate" })).toBeDisabled();
  },
};

export const DeleteReview: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByRole("radio", { name: /Delete/i }));
    await userEvent.selectOptions(
      canvas.getByLabelText(/Replacement concept/i),
      MOCK_BUNDLE.concepts.find((candidate) => candidate.id !== concept.id)?.id ?? "",
    );
    await userEvent.type(canvas.getByLabelText("Reason"), "The replacement now owns this guidance");
    await userEvent.click(canvas.getByRole("checkbox", { name: /I understand Apply/i }));
    await userEvent.click(canvas.getByRole("button", { name: "Review delete" }));
    await expect(await canvas.findByRole("region", { name: "Retirement impact" }))
      .toHaveTextContent("The concept leaves the active bundle");

    while (canvas.queryAllByRole("button", { name: "Review file" }).length > 0) {
      await userEvent.click(canvas.getAllByRole("button", { name: "Review file" })[0]);
    }
    for (const button of canvas.getAllByRole("button", { name: "Keep" })) {
      await userEvent.click(button);
    }
    const validate = canvas.getByRole("button", { name: "Validate" });
    await waitFor(() => expect(validate).toBeEnabled());
    await userEvent.click(validate);
    await expect(await canvas.findByRole("status", { name: "Concept retirement validation" }))
      .toHaveTextContent("OKF validation passed");
  },
};

export const Narrow: Story = {
  parameters: { viewport: { defaultViewport: "mobile1" } },
};
