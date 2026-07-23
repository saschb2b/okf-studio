import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import type { ProfileReport } from "@/shared/types.ts";
import { AdvisoryProfilesView } from "./AdvisoryProfiles.tsx";

const ACTIVE_REPORT: ProfileReport = {
  schemaVersion: 1,
  profiles: [{
    namespace: "com.example.knowledge",
    version: "1.2.0",
    descriptorPath: "profiles/com.example.knowledge.json",
    status: "active",
    message: "Resolved from a version-pinned descriptor inside this bundle.",
    extra: {},
    descriptor: {
      schemaVersion: 1,
      namespace: "com.example.knowledge",
      version: "1.2.0",
      title: "Team knowledge",
      description: "Shared conventions for maintained product knowledge.",
      fields: [{
        id: "owner",
        scope: "concept",
        key: "owner",
        label: "Owner",
        description: "The responsible team.",
        valueType: "string",
        expectation: "recommended",
        conceptTypes: [],
        examples: ["Docs"],
      }],
      relationships: [{
        id: "supports",
        label: "Supports",
        inverse: "supported-by",
        description: "Provides evidence or implementation support.",
      }],
      checks: [],
    },
  }],
  diagnostics: [{
    namespace: "com.example.knowledge",
    ruleId: "owner-present",
    level: "recommendation",
    scope: "concept",
    file: "product/overview.md",
    conceptId: "product/overview",
    field: "owner",
    message: "Name the team responsible for this concept.",
  }],
  truncated: false,
};

const meta = {
  title: "Bundle/AdvisoryProfiles",
  component: AdvisoryProfilesView,
  decorators: [
    (Story) => (
      <div className="profile-story-frame">
        <Story />
      </div>
    ),
  ],
  args: {
    report: ACTIVE_REPORT,
    onOpenConcept: fn(),
  },
} satisfies Meta<typeof AdvisoryProfilesView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Active: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Not OKF validation")).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: /Open product\/overview/ }));
    await expect(args.onOpenConcept).toHaveBeenCalledWith("product/overview");
  },
};

export const Unavailable: Story = {
  args: {
    report: {
      schemaVersion: 1,
      profiles: [{
        namespace: "org.example.policy",
        version: "2.0.0",
        descriptorPath: "profiles/policy.json",
        status: "unavailable",
        message: "The descriptor namespace and version must match the root declaration.",
        descriptor: null,
        extra: { owner: "Platform" },
      }],
      diagnostics: [],
      truncated: false,
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Unavailable")).toBeVisible();
    await expect(canvas.queryByText("Bundle remains open")).not.toBeInTheDocument();
  },
};

export const Narrow: Story = {
  parameters: { viewport: { defaultViewport: "mobile1" } },
};
