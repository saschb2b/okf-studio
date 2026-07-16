// The add-context popover: the full menu, the capability-limited variant
// (disabled entries with explanations), and the concept-search flow. The
// popup renders in a portal, so assertions query the document body.
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { AttachmentPicker } from "./AttachmentPicker.tsx";

const concepts = [
  { id: "product/overview", title: "Product overview", type: "Product" },
  { id: "concepts/orders", title: "Orders", type: "Concept" },
  { id: "metrics/weekly-active", title: "Weekly active users", type: "Metric" },
];

const meta = {
  title: "Agent/Conversation/AttachmentPicker",
  component: AttachmentPicker,
  args: {
    concepts,
    activeConceptId: "concepts/orders",
    attachedConcepts: [],
    issues: [
      { level: "warning", message: "Missing description", conceptId: "concepts/orders" },
    ],
    attachedIssueKeys: new Set<string>(),
    sourceCount: 0,
    onCaptureReaderSelection: () => ({
      status: "unavailable" as const,
      reason: "Select text in the reader first.",
    }),
    disabled: false,
    bundleAttachmentsSupported: true,
    imageSupported: true,
    threadSupport: "ready" as const,
    onLoadThreads: fn(() => Promise.resolve([])),
    onThreadAttach: fn(() => Promise.resolve()),
    nativePicker: null,
    onConceptAttach: fn(),
    onIssueAttach: fn(),
    onSourceAttach: fn(),
    onNativePick: fn(),
  },
} satisfies Meta<typeof AttachmentPicker>;

export default meta;
type Story = StoryObj<typeof meta>;

function body(canvasElement: HTMLElement) {
  return within(canvasElement.ownerDocument.body);
}

export const MenuOpen: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Add context or sources" }));
    const doc = body(canvasElement);
    await waitFor(() => expect(doc.getByText("Bundle concepts")).toBeVisible());
    await expect(doc.getByText("Previous thread")).toBeVisible();
    await expect(doc.getByText("Images")).toBeVisible();
  },
};

/** A text-only agent: bundle, selection, issue, and image entries disabled with reasons. */
export const LimitedAgent: Story = {
  args: {
    bundleAttachmentsSupported: false,
    imageSupported: false,
    threadSupport: "unsupported",
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Add context or sources" }));
    const doc = body(canvasElement);
    await waitFor(() =>
      expect(doc.getByRole("button", { name: "Attach context" })).toBeDisabled(),
    );
    await expect(doc.getByRole("button", { name: "Add images" })).toBeDisabled();
    await expect(doc.getByText("This agent does not accept images")).toBeVisible();
    await expect(doc.getByRole("button", { name: "Add source" })).toBeEnabled();
  },
};

/** Search narrows the concept list; picking one reports the attachment. */
export const ConceptSearch: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Add context or sources" }));
    const doc = body(canvasElement);
    await userEvent.click(await doc.findByRole("button", { name: "Attach context" }));
    await userEvent.type(
      await doc.findByRole("searchbox", { name: "Search concepts to attach" }),
      "weekly",
    );
    await expect(doc.queryByText("Product overview")).not.toBeInTheDocument();
    await userEvent.click(
      doc.getByRole("button", { name: "Add Weekly active users to context" }),
    );
    await waitFor(() =>
      expect(args.onConceptAttach).toHaveBeenCalledWith(
        expect.objectContaining({ id: "metrics/weekly-active" }),
      ),
    );
  },
};

/** At the source cap every add path is disabled. */
export const AtSourceLimit: Story = {
  args: { sourceCount: 8 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Add context or sources" }));
    const doc = body(canvasElement);
    await waitFor(() =>
      expect(doc.getByRole("button", { name: "Add source" })).toBeDisabled(),
    );
    await expect(doc.getByRole("button", { name: "Add files" })).toBeDisabled();
  },
};
