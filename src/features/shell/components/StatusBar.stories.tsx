// The docked status strip over the real store and mock bundle: the left
// region describes the open bundle (verdict, facts), the right holds only
// panel toggles. Function-first: edge-to-edge behind its hairline.
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { WithStore } from "@/mock/withStore.tsx";
import { StatusBar } from "./StatusBar.tsx";

const meta = {
  title: "Shell/StatusBar",
  component: StatusBar,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof StatusBar>;

export default meta;
type Story = StoryObj<typeof meta>;

/** With the mock bundle open: verdict + facts left, panel toggles right. */
export const BundleOpen: Story = {
  render: () => (
    <WithStore withBundle>
      <StatusBar />
    </WithStore>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() =>
      expect(canvas.getByRole("button", { name: /validation/i })).toBeVisible(),
    );
    const git = canvas.getByRole("button", { name: "Toggle Git panel" });
    await expect(git).toBeVisible();
    await userEvent.click(git);
    await expect(git).toHaveAttribute("aria-pressed", "true");
    await expect(canvas.getByRole("button", { name: "Toggle agent panel" })).toBeVisible();
    await expect(canvas.getByTitle("Concepts in this bundle")).toBeVisible();
  },
};

/** No bundle: only the always-available Agent toggle remains. */
export const NoBundle: Story = {
  render: () => (
    <WithStore>
      <StatusBar />
    </WithStore>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("button", { name: "Toggle agent panel" })).toBeVisible();
    await expect(canvas.queryByRole("button", { name: /validation/i })).not.toBeInTheDocument();
  },
};
