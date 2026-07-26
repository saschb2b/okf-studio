import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn } from "storybook/test";
import { mockCatalogEntry } from "@/mock/agentFixtures.ts";
import { AgentRegistryRow } from "./AgentRegistryRow.tsx";

const meta = {
  title: "Agent/Connections/AgentRegistryRow",
  component: AgentRegistryRow,
  args: {
    bundleRoot: "C:/knowledge/docs",
    entry: mockCatalogEntry(),
    onRefreshPreflight: fn(),
    onConnected: fn(),
    onConfigure: fn(),
  },
} satisfies Meta<typeof AgentRegistryRow>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Installable and not yet installed: the row's ordinary resting state. */
export const Available: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Claude Code")).toBeVisible();
  },
};

/** An agent that has to be configured by hand rather than installed. */
export const Configurable: Story = {
  args: {
    entry: mockCatalogEntry({
      id: "custom-acp",
      name: "Custom ACP agent",
      summary: "Point Studio at an executable that speaks the Agent Client Protocol.",
      availability: "configurable",
      distribution: null,
      authMethods: [],
    }),
  },
};

/** Announced but not shippable yet. Saying so beats implying it is available. */
export const Planned: Story = {
  args: {
    entry: mockCatalogEntry({
      id: "future-agent",
      name: "Future agent",
      summary: "Support is planned; nothing to install yet.",
      availability: "planned",
      distribution: null,
    }),
  },
};

/** A long summary and a long name, which is where a row's layout gives out. */
export const LongCopy: Story = {
  args: {
    entry: mockCatalogEntry({
      name: "An agent with a deliberately long product name for layout testing",
      summary:
        "A summary long enough to wrap across several lines, so the row is checked for a " +
        "bounded measure and for the action column staying put instead of being pushed " +
        "around by however much prose the catalog happens to carry for one entry.",
    }),
  },
};

/** No folder open, which gates connecting. */
export const NoBundle: Story = {
  args: { bundleRoot: null },
};
