import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";
import { ReliabilityNotice } from "@/features/reader/components/ReliabilityNotice.tsx";
import type { ReliabilityAssessment } from "@/shared/reliability.ts";
import "./Reader.css";

const assessment: ReliabilityAssessment = {
  hasMetadata: true,
  state: "superseded",
  lifecycle: "active",
  confidence: 0.72,
  effectiveFrom: "2026-01-01",
  effectiveUntil: null,
  reviewAfter: "2026-06-01",
  contradictedBy: [],
  supersededBy: ["policies/current"],
  diagnostics: ["An active concept also declares a replacement."],
};

const meta = {
  title: "Reader/ReliabilityNotice",
  component: ReliabilityNotice,
  decorators: [
    (Story) => <div style={{ maxWidth: 720, padding: 16 }}><Story /></div>,
  ],
} satisfies Meta<typeof ReliabilityNotice>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Superseded: Story = {
  args: { assessment },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Superseded")).toBeVisible();
    await expect(canvas.getByText("Replacement: policies/current")).toBeVisible();
    await expect(canvas.getByText(/has not verified the claim/i)).toBeVisible();
  },
};

export const Narrow: Story = {
  args: { assessment },
  parameters: { viewport: { defaultViewport: "mobile1" } },
};
