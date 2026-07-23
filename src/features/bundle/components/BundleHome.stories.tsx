import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, waitFor, within } from "storybook/test";
import { WithStore } from "@/mock/withStore.tsx";
import { BundleHome } from "./BundleHome.tsx";

const meta = {
  title: "Bundle/BundleHome",
  component: BundleHome,
  parameters: { layout: "fullscreen" },
  render: () => (
    <WithStore withBundle>
      <div style={{ height: "100vh" }}>
        <BundleHome />
      </div>
    </WithStore>
  ),
} satisfies Meta<typeof BundleHome>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WorkingHome: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() =>
      expect(canvas.getByRole("region", { name: "Bundle home" })).toBeVisible(),
    );
    await expect(canvas.getByRole("heading", { name: "Activity" })).toBeVisible();
    await expect(
      canvas.getByRole("heading", { name: "Continue working" }),
    ).toBeVisible();
    await expect(
      canvas.getByRole("heading", { name: "Needs attention" }),
    ).toBeVisible();
    await expect(canvas.queryByRole("heading", { name: "Composition" }))
      .not.toBeInTheDocument();
  },
};

export const Narrow: Story = {
  globals: { viewport: { value: "mobile1", isRotated: false } },
  play: WorkingHome.play,
};
