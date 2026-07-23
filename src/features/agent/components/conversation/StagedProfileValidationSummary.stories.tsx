import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent } from "storybook/test";
import type { OkfProfileTaskContext } from "@/features/agent/profileContext.ts";
import { StagedProfileValidationSummary } from "./StagedProfileValidationSummary.tsx";

const profileContext: OkfProfileTaskContext = {
  schemaVersion: 1,
  basis: "advisory-profile",
  conformanceBoundary: "Profile advice does not change OKF validation.",
  coreRequirements: [{ key: "type", requirement: "OKF-required" }],
  profiles: [{
    namespace: "com.example.knowledge",
    version: "1.2.0",
    descriptorPath: "profiles/knowledge.json",
    status: "active",
    message: "Resolved from a local descriptor.",
    title: "Team knowledge",
    fields: [{
      id: "owner",
      scope: "concept",
      key: "owner",
      label: "Owner",
      description: "The responsible team.",
      valueType: "string",
      requirement: "Profile-required",
      conceptTypes: ["Guide"],
      examples: ["Docs"],
    }],
    relationships: [],
  }],
  diagnostics: [],
  edges: [],
  truncated: false,
};

const meta = {
  title: "Agent/Conversation/StagedProfileValidationSummary",
  component: StagedProfileValidationSummary,
  args: {
    profileContext,
    profile: {
      source: "selected-source",
      declared: 1,
      active: 1,
      unavailable: 0,
      diagnostics: [{
        namespace: "com.example.knowledge",
        ruleId: "owner-present",
        level: "recommendation",
        path: "guides/start.md",
        conceptId: "guides/start",
        field: "owner",
        message: "Name the responsible team.",
      }],
      truncated: false,
    },
  },
  decorators: [
    (Story) => (
      <div className="staged-profile-validation-story">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof StagedProfileValidationSummary>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AdviceRemains: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Not OKF validation")).toBeVisible();
    await expect(canvas.getByText(/selected source profile/u)).toBeVisible();
    await userEvent.click(canvas.getByText(/Review profile advice/u));
    await expect(canvas.getByText("Profile-required")).toBeVisible();
  },
};

export const Passed: Story = {
  args: {
    profile: {
      source: "draft",
      declared: 1,
      active: 1,
      unavailable: 0,
      diagnostics: [],
      truncated: false,
    },
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Profile checks passed")).toBeVisible();
    await expect(canvas.getByText(/draft declaration/u)).toBeVisible();
  },
};

export const Narrow: Story = {
  parameters: { viewport: { defaultViewport: "mobile1" } },
};
