import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { MOCK_BUNDLE } from "@/mock/fixture.ts";
import { WithStore } from "@/mock/withStore.tsx";
import { BundleDetailsDialog } from "./BundleDetailsDialog.tsx";

const meta = {
  title: "Bundle/BundleDetailsDialog",
  component: BundleDetailsDialog,
  decorators: [
    (Story) => (
      <WithStore>
        <Story />
      </WithStore>
    ),
  ],
  args: {
    open: true,
    bundle: MOCK_BUNDLE,
    onOpenChange: fn(),
  },
} satisfies Meta<typeof BundleDetailsDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Populated: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body);
    await expect(canvas.getByRole("dialog", { name: "Bundle details" })).toBeVisible();
    await expect(canvas.getByText("ODSF 0.1 · OKF 0.1")).toBeVisible();
    await expect(canvas.getByRole("button", {
      name: /open validation report: conformant with warnings, 1 warning/i,
    })).toBeVisible();
    await expect(canvas.getByRole("heading", { name: "Bundle metadata" })).toBeVisible();
    await expect(canvas.queryByRole("heading", { name: "Ignore rules" })).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole("tab", { name: "Ignore rules" }));
    await expect(await canvas.findByRole("heading", { name: "Ignore rules" })).toBeVisible();
    await userEvent.click(canvas.getByRole("tab", { name: "Profiles" }));
    await expect(await canvas.findByRole("heading", { name: "Advisory profiles" })).toBeVisible();
  },
};

export const Narrow: Story = {
  globals: { viewport: { value: "mobile1", isRotated: false } },
  play: Populated.play,
};

export const NoOptionalMetadata: Story = {
  args: {
    bundle: {
      ...MOCK_BUNDLE,
      okfVersion: null,
      odsfVersion: null,
      extra: {},
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body);
    await expect(canvas.getByText("Not declared")).toBeVisible();
    await expect(canvas.getByText("No additional bundle metadata is declared.")).toBeVisible();
    await userEvent.click(canvas.getByRole("tab", { name: "Profiles" }));
    await expect(canvas.getByText("No advisory profiles are declared.")).toBeVisible();
  },
};
