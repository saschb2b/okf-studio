import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn } from "storybook/test";
import { mockCustomProfile } from "@/mock/agentFixtures.ts";
import { CustomAgentProfiles } from "./CustomAgentProfiles.tsx";

const meta = {
  title: "Agent/Connections/CustomAgentProfiles",
  component: CustomAgentProfiles,
  args: {
    bundleRoot: "C:/knowledge/docs",
    profiles: [mockCustomProfile()],
    restrictedOfflineAvailable: true,
    onProfileSave: fn(),
    onProfileRemove: fn(),
    onConnected: fn(),
  },
} satisfies Meta<typeof CustomAgentProfiles>;

export default meta;
type Story = StoryObj<typeof meta>;

/** One profile, on a host where restricted-offline containment is available. */
export const OneProfile: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByText("In-house reviewer")).toBeVisible();
  },
};

/** A host without a containment backend: the security story changes, and the
 *  surface has to say so rather than imply a guarantee it cannot make. */
export const NoContainmentAvailable: Story = {
  args: { restrictedOfflineAvailable: false },
};

/** Several profiles, one with a long executable path and no arguments. */
export const SeveralProfiles: Story = {
  args: {
    profiles: [
      mockCustomProfile(),
      mockCustomProfile({
        id: "custom-2",
        name: "Local ACP bridge",
        executable:
          "C:/Users/sasch/AppData/Local/Programs/acp-bridge/bin/acp-bridge-with-a-long-name.exe",
        arguments: [],
        environment: [],
      }),
    ],
  },
};

/** The empty state. */
export const NoProfiles: Story = {
  args: { profiles: [] },
};

/** No folder open, which bounds what a custom agent may be pointed at. */
export const NoBundle: Story = {
  args: { bundleRoot: null, profiles: [] },
};
