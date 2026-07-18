import type { Meta, StoryObj } from "@storybook/react-vite";
import { useEffect } from "react";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { WithStore } from "@/mock/withStore.tsx";
import { useApp } from "@/shared/store.tsx";
import { Settings } from "./Settings.tsx";
import type { SettingsProps } from "./Settings.tsx";

function OpenSettings(props: SettingsProps) {
  const { actions } = useApp();
  useEffect(() => actions.setSettingsOpen(true), [actions]);
  return <Settings {...props} />;
}

const meta = {
  title: "Shell/Settings",
  component: Settings,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof Settings>;

export default meta;
type Story = StoryObj<typeof meta>;

export const General: Story = {
  render: () => (
    <WithStore>
      <OpenSettings initialSection="general" />
    </WithStore>
  ),
  play: async ({ canvasElement }) => {
    const screen = within(canvasElement.ownerDocument.body);
    const heading = await screen.findByRole("heading", { name: "General" });
    await waitFor(() => expect(heading).toBeVisible());
    await expect(screen.getByRole("textbox", { name: "Bundle scan depth" })).toHaveValue("8");
  },
};

export const AgentNotificationsOptIn: Story = {
  render: () => (
    <WithStore>
      <OpenSettings initialSection="agents" />
    </WithStore>
  ),
  play: async ({ canvasElement }) => {
    const screen = within(canvasElement.ownerDocument.body);
    const notifications = await screen.findByRole("checkbox", {
      name: "Background agent notifications",
    });
    const sound = screen.getByRole("checkbox", { name: "Notification sound" });
    await expect(notifications).not.toBeChecked();
    await expect(sound).toHaveAttribute("aria-disabled", "true");
    await userEvent.click(notifications);
    await waitFor(() => expect(notifications).toBeChecked());
    await expect(sound).not.toHaveAttribute("aria-disabled", "true");
  },
};

export const SearchToSetting: Story = {
  render: () => (
    <WithStore>
      <OpenSettings initialQuery="memory" />
    </WithStore>
  ),
  play: async ({ canvasElement }) => {
    const screen = within(canvasElement.ownerDocument.body);
    const heading = await screen.findByRole("heading", { name: "Search results" });
    await waitFor(() => expect(heading).toBeVisible());
    const memoryResult = screen.getByRole("button", { name: /workspace memory/i });
    await userEvent.click(memoryResult);
    await waitFor(() => expect(screen.getByRole("heading", { name: "Knowledge" })).toBeVisible());
    await waitFor(() => expect(screen.getByText("Open a bundle to manage its knowledge settings")).toBeVisible());
    await expect(screen.getByRole("searchbox", { name: "Search settings" })).toHaveValue("");
  },
};

export const SearchResults: Story = {
  render: () => (
    <WithStore>
      <OpenSettings initialQuery="agent" />
    </WithStore>
  ),
  play: async ({ canvasElement }) => {
    const screen = within(canvasElement.ownerDocument.body);
    const heading = await screen.findByRole("heading", { name: "Search results" });
    await waitFor(() => expect(heading).toBeVisible());
    await expect(screen.getByRole("button", { name: /background agent notifications/i })).toBeVisible();
    await expect(screen.getByRole("button", { name: /okf capability pack/i })).toBeVisible();
  },
};

export const NoSearchResults: Story = {
  render: () => (
    <WithStore>
      <OpenSettings initialQuery="satellite telemetry" />
    </WithStore>
  ),
  play: async ({ canvasElement }) => {
    const screen = within(canvasElement.ownerDocument.body);
    const empty = await screen.findByText("No settings found");
    await waitFor(() => expect(empty).toBeVisible());
    await expect(screen.getByText(/try a broader term/i)).toBeVisible();
  },
};

export const KnowledgeWithoutBundle: Story = {
  render: () => (
    <WithStore>
      <OpenSettings initialSection="knowledge" />
    </WithStore>
  ),
  play: async ({ canvasElement }) => {
    const screen = within(canvasElement.ownerDocument.body);
    const empty = await screen.findByText("Open a bundle to manage its knowledge settings");
    await waitFor(() => expect(empty).toBeVisible());
  },
};

export const KnowledgeWithBundle: Story = {
  render: () => (
    <WithStore withBundle>
      <OpenSettings initialSection="knowledge" />
    </WithStore>
  ),
  play: async ({ canvasElement }) => {
    const screen = within(canvasElement.ownerDocument.body);
    const activeBundle = await screen.findByText("Active bundle");
    await waitFor(() => expect(activeBundle).toBeVisible());
    await expect(screen.getAllByText("OKF Studio (sample)").length).toBeGreaterThan(0);
    await expect(await screen.findByRole("region", { name: "Workspace memory" })).toBeVisible();
  },
};

export const Narrow: Story = {
  parameters: {
    viewport: { defaultViewport: "mobile1" },
  },
  render: () => (
    <WithStore>
      <OpenSettings initialSection="appearance" />
    </WithStore>
  ),
  play: async ({ canvasElement }) => {
    const screen = within(canvasElement.ownerDocument.body);
    await expect(await screen.findByLabelText("Category")).toHaveValue("appearance");
  },
};
