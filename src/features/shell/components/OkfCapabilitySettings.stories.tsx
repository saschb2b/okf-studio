import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import { OkfCapabilitySettings } from "./OkfCapabilitySettings.tsx";
import "@/shared/styles/baseui.css";
import "@/shared/styles/chrome.css";
import "./Settings.css";

const meta = {
  title: "Shell/Settings/OKF capabilities",
  component: OkfCapabilitySettings,
  decorators: [
    (Story) => (
      <div className="ui-dialog settings-dialog">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof OkfCapabilitySettings>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Catalog: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText("okf-inspect")).toBeVisible();
    await userEvent.click(canvas.getByText("okf-inspect"));
    await expect(canvas.getByText("capabilities/inspect.md")).toBeVisible();
    await expect(canvas.getAllByText("v0.3.0").length).toBeGreaterThan(1);
    await expect(canvas.getAllByText("v0.2.0").length).toBeGreaterThan(1);
  },
};
