// The navigator over the real store and mock bundle: index tree, search
// field, and the filter lens, at the app's sidebar width.
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, waitFor, within } from "storybook/test";
import { WithStore } from "@/mock/withStore.tsx";
import { Sidebar } from "./Sidebar.tsx";

const meta = {
  title: "Navigation/Sidebar",
  component: Sidebar,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div style={{ display: "flex", width: 280, height: 560, overflow: "hidden" }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Sidebar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const BundleOpen: Story = {
  render: () => (
    <WithStore withBundle>
      <Sidebar />
    </WithStore>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() =>
      expect(canvas.getByLabelText("Search and filter concepts")).toBeVisible(),
    );
  },
};
