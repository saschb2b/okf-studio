// The panel is the agent feature's top-level composition and had no story at
// all: every one of its parts was inspectable in isolation while the thing that
// arranges them was not. It is fully store-bound, so it boots over the browser
// mock rather than taking props.

import type { Meta, StoryObj } from "@storybook/react-vite";
import { useEffect } from "react";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { WithStore } from "@/mock/withStore.tsx";
import { useApp } from "@/shared/store.tsx";
import { AgentPanel } from "./AgentPanel.tsx";

function OpenPanel() {
  const { actions } = useApp();
  useEffect(() => actions.togglePanel("agent", true), [actions]);
  return <AgentPanel />;
}

const meta = {
  title: "Agent/AgentPanel",
  component: AgentPanel,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof AgentPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

const panel = () => (
  <WithStore withBundle>
    <OpenPanel />
  </WithStore>
);

/**
 * Opened with nothing connected — what a reader meets first, and the state that
 * has to route them somewhere rather than presenting an empty box.
 */
export const NothingConnected: Story = {
  render: panel,
  play: async ({ canvasElement }) => {
    const doc = canvasElement.ownerDocument;
    // Asserted structurally rather than on copy: the point is that the panel
    // mounts and offers a next step, and pinning wording here would make this
    // story fail on an unrelated copy edit.
    await waitFor(() => expect(doc.querySelector(".agent-panel")).toBeTruthy());
    await waitFor(() =>
      expect(doc.querySelectorAll(".agent-panel button, .agent-panel a").length).toBeGreaterThan(0),
    );
  },
};

/**
 * The catalog, reached from the empty state. This is the panel's widest layout
 * and the one most likely to go ragged, since every row carries a name, a
 * summary of arbitrary length, and an action.
 */
export const Catalog: Story = {
  render: panel,
  play: async ({ canvasElement }) => {
    const doc = canvasElement.ownerDocument;
    const body = within(doc.body);
    // By name, not by position: the panel's first button is its close control,
    // so clicking blindly dismissed the surface under test.
    const connect = await waitFor(() =>
      body.getByRole("button", { name: "Connect an agent" }),
    );
    await userEvent.click(connect);
    await waitFor(() => expect(doc.querySelector("[data-agent-catalog-focus]")).toBeTruthy());
  },
};

/** Narrow, since the panel docks beside the workspace and is resized often. */
export const Narrow: Story = {
  render: panel,
  globals: { viewport: { value: "mobile1" } },
};
