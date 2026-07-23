import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect } from "storybook/test";
import { AccessNotice } from "./AccessNotice.tsx";

const meta = {
  title: "Reader/AccessNotice",
  component: AccessNotice,
  args: {
    hints: {
      hasMetadata: true,
      audiences: ["engineering", "release partners"],
      sensitivity: "Internal",
      knownSensitivity: "internal",
      handlingNotes: "Share the cited measurements only after review.",
      diagnostics: [],
    },
  },
  decorators: [
    (Story) => (
      <div style={{ width: "min(680px, calc(100vw - 32px))" }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof AccessNotice>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Guidance: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("complementary", { name: "Handling guidance" }))
      .toHaveTextContent("do not grant access");
  },
};

export const UnknownSensitivity: Story = {
  args: {
    hints: {
      hasMetadata: true,
      audiences: ["board"],
      sensitivity: "embargoed",
      knownSensitivity: null,
      handlingNotes: null,
      diagnostics: [
        "Unknown sensitivity value \"embargoed\" remains visible and receives no automatic rank.",
      ],
    },
  },
};
