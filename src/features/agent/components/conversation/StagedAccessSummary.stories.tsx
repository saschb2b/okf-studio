import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect } from "storybook/test";
import { StagedAccessSummary } from "./StagedAccessSummary.tsx";

const meta = {
  title: "Agent/Conversation/StagedAccessSummary",
  component: StagedAccessSummary,
  args: {
    nodes: [{
      id: "release/plan",
      title: "Release plan",
      conceptType: "Plan",
      staged: true,
      access: {
        hasMetadata: true,
        audiences: ["engineering", "release partners"],
        sensitivity: "internal",
        knownSensitivity: "internal",
        handlingNotes: "Review before sending outside the team.",
        diagnostics: [],
      },
    }],
  },
  decorators: [
    (Story) => (
      <div style={{ width: "min(520px, calc(100vw - 32px))" }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof StagedAccessSummary>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Review: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("region", { name: "Staged handling guidance" }))
      .toHaveTextContent("neither authorize");
  },
};

export const UnknownValue: Story = {
  args: {
    nodes: [{
      id: "release/plan",
      title: "Release plan",
      conceptType: "Plan",
      staged: true,
      access: {
        hasMetadata: true,
        audiences: ["board"],
        sensitivity: "embargoed",
        knownSensitivity: null,
        handlingNotes: null,
        diagnostics: [
          "Unknown sensitivity value \"embargoed\" remains visible and receives no automatic rank.",
        ],
      },
    }],
  },
};
