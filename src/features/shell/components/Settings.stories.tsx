import type { Meta, StoryObj } from "@storybook/react-vite";
import { useEffect } from "react";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { WithStore } from "@/mock/withStore.tsx";
import { useApp } from "@/shared/store.tsx";
import { Settings } from "./Settings.tsx";

function OpenSettings() {
  const { actions } = useApp();
  useEffect(() => actions.setSettingsOpen(true), [actions]);
  return <Settings />;
}

const meta = {
  title: "Shell/Settings",
  component: Settings,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof Settings>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AgentNotificationsOptIn: Story = {
  render: () => (
    <WithStore>
      <OpenSettings />
    </WithStore>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body);
    const notifications = await canvas.findByRole("checkbox", {
      name: "Background agent notifications",
    });
    const sound = canvas.getByRole("checkbox", { name: "Notification sound" });
    await expect(notifications).not.toBeChecked();
    await expect(sound).toHaveAttribute("aria-disabled", "true");
    await userEvent.click(notifications);
    await waitFor(() => expect(notifications).toBeChecked());
    await expect(sound).not.toHaveAttribute("aria-disabled", "true");
  },
};
