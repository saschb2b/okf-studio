import type { Meta, StoryObj } from "@storybook/react-vite";
import { useEffect } from "react";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { WithStore } from "@/mock/withStore.tsx";
import { useApp } from "@/shared/store.tsx";
import { ShortcutsHelp } from "./ShortcutsHelp.tsx";

function OpenShortcuts() {
  const { actions } = useApp();
  useEffect(() => actions.setHelp(true), [actions]);
  return <ShortcutsHelp />;
}

const meta = {
  title: "Shell/ShortcutsHelp",
  component: ShortcutsHelp,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof ShortcutsHelp>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The whole keymap, which is what the sheet is for: readable without scrolling. */
export const FullSheet: Story = {
  render: () => (
    <WithStore>
      <OpenShortcuts />
    </WithStore>
  ),
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    // By role: "Keyboard shortcuts" is both the dialog's title and the label of
    // the `?` binding it lists.
    await waitFor(() =>
      expect(body.getByRole("heading", { name: "Keyboard shortcuts" })).toBeInTheDocument(),
    );
    // Every group is present, and the sheet leads with the global bindings.
    for (const group of [
      "Global",
      "Layout and reading",
      "Navigate",
      "Tabs",
      "Visualizations",
      "Panels and tools",
    ]) {
      await expect(body.getByText(group)).toBeInTheDocument();
    }
  },
};

/** Filtering, which is how a reader finds one binding among forty. */
export const Filtered: Story = {
  render: () => (
    <WithStore>
      <OpenShortcuts />
    </WithStore>
  ),
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const filter = await waitFor(() => body.getByLabelText("Filter shortcuts"));
    await userEvent.type(filter, "tab");
    await waitFor(() => expect(body.getByText("New tab")).toBeInTheDocument());
    // Unrelated groups drop out entirely rather than rendering empty headings.
    await expect(body.queryByText("Visualizations")).not.toBeInTheDocument();
  },
};

/** A query that matches nothing still says where the full list lives. */
export const NoMatches: Story = {
  render: () => (
    <WithStore>
      <OpenShortcuts />
    </WithStore>
  ),
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const filter = await waitFor(() => body.getByLabelText("Filter shortcuts"));
    await userEvent.type(filter, "qqq");
    await waitFor(() => expect(body.getByText(/No shortcut matches/)).toBeInTheDocument());
  },
};
