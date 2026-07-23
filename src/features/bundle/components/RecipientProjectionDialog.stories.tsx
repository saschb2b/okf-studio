import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { MOCK_BUNDLE } from "@/mock/fixture.ts";
import type { ProjectionExportResult } from "@/features/bundle/projection.ts";
import {
  ProjectionResult,
  RecipientProjectionDialog,
} from "./RecipientProjectionDialog.tsx";

const meta = {
  title: "Bundle/RecipientProjectionDialog",
  component: RecipientProjectionDialog,
  args: {
    open: true,
    bundle: MOCK_BUNDLE,
    onOpenChange: fn(),
  },
} satisfies Meta<typeof RecipientProjectionDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

async function prepareReview(canvasElement: HTMLElement) {
  const canvas = within(canvasElement.ownerDocument.body);
  await userEvent.type(canvas.getByLabelText("Recipient"), "Research partner");
  await userEvent.click(canvas.getByLabelText("Include concepts with no sensitivity hint"));
  await userEvent.click(canvas.getByRole("button", { name: "Select all" }));
  await userEvent.click(canvas.getByRole("button", { name: "Review plan" }));
  await expect(await canvas.findByText("Reviewed plan")).toBeVisible();
  return canvas;
}

function exportResult(
  status: ProjectionExportResult["status"],
): ProjectionExportResult {
  return {
    schemaVersion: 1,
    status,
    destination: "/exports/okf-studio-research-partner",
    destinationFolderName: "okf-studio-research-partner",
    auditReport: "/exports/okf-studio-research-partner.erasure-audit.json",
    audit: {
      schemaVersion: 1,
      passed: status !== "blocked-by-audit",
      checkedFiles: 7,
      checkedBytes: 18_640,
      checkedTerms: 13,
      findings: status === "blocked-by-audit"
        ? [{
            path: "index.md",
            category: "omitted-title",
            value: "Private roadmap",
            occurrences: 1,
          }]
        : [],
      truncated: false,
      diagnostics: [],
    },
    validation: { errors: 0, warnings: 0, issues: [], truncated: false },
    sourceUnchanged: true,
    replacedExistingProjection: false,
  };
}

export const SelectionForm: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body);
    await expect(canvas.getByRole("dialog", { name: "Recipient projection" })).toBeVisible();
    await expect(canvas.getByRole("button", { name: "Review plan" })).toBeDisabled();
    await expect(canvas.getByText("No filesystem writes occur during review.")).toBeVisible();
  },
};

export const ReviewedPlan: Story = {
  play: async ({ canvasElement }) => {
    const canvas = await prepareReview(canvasElement);
    await expect(canvas.getByText(/concepts ready for an explicit export/i)).toBeVisible();
    await expect(canvas.getByText(/Source fingerprint/)).toBeVisible();
  },
};

export const ExistingDestination: Story = {
  render: () => <ProjectionResult result={exportResult("existing-destination")} />,
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: "Destination already exists" })).toBeVisible();
    await expect(canvas.getByText(/did not replace the existing folder/i)).toBeVisible();
  },
};

export const AuditBlocked: Story = {
  render: () => <ProjectionResult result={exportResult("blocked-by-audit")} />,
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: "Export blocked by erasure audit" }))
      .toBeVisible();
    await expect(canvas.getByText(/Private roadmap/)).toBeVisible();
  },
};

export const Narrow: Story = {
  globals: { viewport: { value: "mobile1", isRotated: false } },
  play: SelectionForm.play,
};
