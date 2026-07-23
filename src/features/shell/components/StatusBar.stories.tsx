// The docked status strip over the real store and mock bundle: one compact
// cluster of workspace-panel toggles.
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

/** With the mock bundle open: bundle-scoped and global panel toggles. */
export const BundleOpen: Story = {
  render: () => (
    <WithStore withBundle>
      <StatusBar />
    </WithStore>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() =>
      expect(canvas.getByRole("button", { name: "Toggle Git panel" })).toBeVisible(),
    );
    const git = canvas.getByRole("button", { name: "Toggle Git panel" });
    await expect(git).toBeVisible();
    await userEvent.click(git);
    await expect(git).toHaveAttribute("aria-pressed", "true");
    await expect(canvas.getByRole("button", { name: "Toggle agent panel" })).toBeVisible();
    await expect(canvas.queryByRole("button", { name: /validation/i })).not.toBeInTheDocument();
    await expect(canvas.queryByText("45 concepts")).not.toBeInTheDocument();
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
    await expect(canvas.queryByRole("button", { name: "Toggle Git panel" })).not.toBeInTheDocument();
  },
};
