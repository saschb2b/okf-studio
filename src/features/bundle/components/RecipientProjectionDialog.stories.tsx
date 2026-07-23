import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { MOCK_BUNDLE } from "@/mock/fixture.ts";
import type {
  ProjectionExportResult,
  ProjectionInput,
  ProjectionPlan,
} from "@/features/bundle/projection.ts";
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
  await userEvent.type(canvas.getByLabelText("Recipient or group"), "Research partner");
  await userEvent.click(canvas.getByRole("button", { name: "Select all" }));
  await userEvent.click(canvas.getByRole("button", { name: "Preview bundle" }));
  await expect(await canvas.findByText("Your new bundle is ready to save")).toBeVisible();
  return canvas;
}

function exportResult(
  status: ProjectionExportResult["status"],
): ProjectionExportResult {
  return {
    schemaVersion: 1,
    status,
    destination: "/exports/research-partner-okf",
    destinationFolderName: "research-partner-okf",
    auditReport: "/exports/research-partner-okf.erasure-audit.json",
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

function emptyPlan(input: ProjectionInput): ProjectionPlan {
  return {
    schemaVersion: 1,
    revision: "okf-projection-empty-review",
    sourceBundleFingerprint: "mock-bundle-fingerprint",
    recipient: input.recipient,
    recipientAudiences: input.recipientAudiences,
    maxSensitivity: input.maxSensitivity,
    includeUnknownSensitivity: input.includeUnknownSensitivity,
    destinationFolderName: "research-partner-okf",
    included: [],
    omissions: [{
      kind: "concept",
      id: "product/overview",
      title: "Overview",
      reason: "audience-mismatch",
    }],
    linkConsequences: [],
    redactions: [],
    ignoredRuleCount: 0,
    ignoredPathsTruncated: false,
    warnings: ["No selected concept passed the reviewed audience and sensitivity hints."],
  };
}

export const SelectionForm: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body);
    await expect(canvas.getByRole("dialog", { name: "Create a shareable bundle" })).toBeVisible();
    await expect(canvas.getByRole("button", { name: "Preview bundle" })).toBeDisabled();
    await expect(canvas.getByText("Name the recipient and choose at least one concept."))
      .toBeVisible();
    await expect(canvas.getByText("Sharing safeguards")).toBeVisible();
    await userEvent.click(canvas.getByText("Sharing safeguards"));
    await expect(
      canvas.getByLabelText("Include selected concepts without a recognized sensitivity label"),
    ).toBeChecked();
  },
};

export const ReviewedPlan: Story = {
  play: async ({ canvasElement }) => {
    const canvas = await prepareReview(canvasElement);
    await expect(canvas.getByText(/concepts are ready for the new bundle/i)).toBeVisible();
    await expect(canvas.getByRole("button", { name: /Choose save location/i })).toBeEnabled();
    await userEvent.click(canvas.getByText("How Studio protects the source"));
    await expect(canvas.getByText(/Preview fingerprint/)).toBeVisible();
  },
};

export const ExistingDestination: Story = {
  render: () => <ProjectionResult result={exportResult("existing-destination")} />,
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: "A copy with this name already exists" }))
      .toBeVisible();
    await expect(canvas.getByText(/left the existing folder unchanged/i)).toBeVisible();
  },
};

export const NothingEligible: Story = {
  args: {
    planProjection: (_bundleRoot, input) => Promise.resolve(emptyPlan(input)),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body);
    await userEvent.type(canvas.getByLabelText("Recipient or group"), "Research partner");
    await userEvent.click(canvas.getByLabelText("Share Overview"));
    await userEvent.click(canvas.getByRole("button", { name: "Preview bundle" }));
    await expect(
      await canvas.findByRole("heading", {
        name: "Nothing can be shared with these safeguards",
      }),
    ).toBeVisible();
    await expect(canvas.getByRole("button", { name: "Choose save location" })).toBeDisabled();
    await expect(canvas.getByRole("button", { name: "Back to selection" })).toBeEnabled();
  },
};

export const AuditBlocked: Story = {
  render: () => <ProjectionResult result={exportResult("blocked-by-audit")} />,
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: "Save blocked by the privacy check" }))
      .toBeVisible();
    await expect(canvas.getByText(/Private roadmap/)).toBeVisible();
  },
};

export const Narrow: Story = {
  globals: { viewport: { value: "mobile1", isRotated: false } },
  play: SelectionForm.play,
};
