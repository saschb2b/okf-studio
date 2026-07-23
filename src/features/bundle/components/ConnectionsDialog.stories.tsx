import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { MOCK_BUNDLE } from "@/mock/fixture.ts";
import { WithStore } from "@/mock/withStore.tsx";
import { ConnectionsDialog } from "./ConnectionsDialog.tsx";

const meta = {
  title: "Bundle/ConnectionsDialog",
  component: ConnectionsDialog,
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
} satisfies Meta<typeof ConnectionsDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ExternalSources: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body);
    await expect(canvas.getByRole("dialog", { name: "Bundle connections" })).toBeVisible();
    await expect(await canvas.findByRole("heading", { name: "External sources" })).toBeVisible();
    await expect(canvas.getByText("upstream")).toBeVisible();
  },
};

export const RelationshipExchange: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByRole("tab", { name: /relationship exchange/i }));
    await expect(
      await canvas.findByRole("heading", { name: "Relationship exchange" }),
    ).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Preview JSON-LD import" }));
    await expect(await canvas.findByText(/Previewed 1 relationship. Nothing was written/i))
      .toBeVisible();
  },
};

export const Diagnostics: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByRole("tab", { name: /diagnostics/i }));
    await expect(
      await canvas.findByRole("heading", { name: "Interoperability diagnostics" }),
    ).toBeVisible();
    await expect(canvas.getByText("product/overview")).toBeVisible();
  },
};

export const Narrow: Story = {
  globals: { viewport: { value: "mobile1", isRotated: false } },
  play: ExternalSources.play,
};
