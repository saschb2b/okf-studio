import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { mockConnection } from "@/mock/agentFixtures.ts";
import { NewAgentThreadMenu } from "./NewAgentThreadMenu.tsx";

const meta = {
  title: "Agent/Threads/NewAgentThreadMenu",
  component: NewAgentThreadMenu,
  args: {
    bundleRoot: "C:/knowledge/docs",
    connections: [mockConnection()],
    onNewThread: fn(),
    onConnected: fn(),
    onOpenCatalog: fn(),
  },
} satisfies Meta<typeof NewAgentThreadMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

/** One agent connected: starting a thread on it is the primary path. */
export const OneConnection: Story = {
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    // The menu is a Base UI portal, so it mounts a tick after the click.
    await userEvent.click(body.getByRole("button", { name: "Connect another agent" }));
    await waitFor(() => expect(body.getByRole("menu")).toBeInTheDocument());
  },
};

/** Several connected agents, so the menu has to be picked from rather than confirmed. */
export const SeveralConnections: Story = {
  args: {
    connections: [
      mockConnection(),
      mockConnection({
        connectionId: "conn-2",
        profileId: "gemini-cli",
        agent: { name: "gemini-cli", title: "Gemini CLI", version: "0.9.1" },
      }),
      mockConnection({
        connectionId: "conn-3",
        profileId: "in-house",
        agent: { name: "in-house", title: "In-house reviewer", version: "0.2.0" },
      }),
    ],
  },
};

/** Nothing connected yet: the menu has to route to the catalog, not dead-end. */
export const NoConnections: Story = {
  args: { connections: [] },
};

/** No folder open, which gates what a thread can be started against. */
export const NoBundle: Story = {
  args: { bundleRoot: null, connections: [] },
};
