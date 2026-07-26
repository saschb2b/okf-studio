import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn } from "storybook/test";
import { mockLocalModelProfile } from "@/mock/agentFixtures.ts";
import { LocalModelProfiles } from "./LocalModelProfiles.tsx";

const meta = {
  title: "Agent/Connections/LocalModelProfiles",
  component: LocalModelProfiles,
  args: {
    profiles: [mockLocalModelProfile()],
    formOpen: false,
    onFormOpenChange: fn(),
    onProfileSave: fn(),
    onProfileRemove: fn(),
    onConnected: fn(),
  },
} satisfies Meta<typeof LocalModelProfiles>;

export default meta;
type Story = StoryObj<typeof meta>;

/** One local endpoint configured. */
export const OneProfile: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Ollama · llama3.1")).toBeVisible();
  },
};

/** Several providers, including one holding a credential. */
export const SeveralProfiles: Story = {
  args: {
    profiles: [
      mockLocalModelProfile(),
      mockLocalModelProfile({
        id: "local-2",
        name: "LM Studio · qwen2.5-coder",
        provider: "lm-studio",
        baseUrl: "http://127.0.0.1:1234",
      }),
      mockLocalModelProfile({
        id: "local-3",
        name: "Remote vLLM",
        provider: "open-ai-compatible",
        baseUrl: "https://models.internal.example/v1",
        hasCredential: true,
      }),
    ],
  },
};

/** The empty state, which is the first thing most people see here. */
export const NoProfiles: Story = {
  args: { profiles: [] },
};

/** The add form open, which is the state the empty state routes into. */
export const FormOpen: Story = {
  args: { profiles: [], formOpen: true },
};
