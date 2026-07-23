import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import { MetadataInspector } from "./MetadataInspector.tsx";

const values = {
  profile: {
    namespace: "com.example.knowledge",
    version: "2.1.0",
    checks: ["ownership", "freshness", "citations"],
  },
  producer: {
    name: "Example catalog",
    build: 1842,
    reviewed: true,
  },
  handling: "Internal guidance. Confirm before external distribution.",
};

const meta = {
  title: "Reader/MetadataInspector",
  component: MetadataInspector,
  args: {
    title: "Bundle metadata",
    source: "index.md",
    values,
  },
  decorators: [
    (Story) => (
      <div className="metadata-story-frame">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof MetadataInspector>;

export default meta;
type Story = StoryObj<typeof meta>;

export const NestedMetadata: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("com.example.knowledge")).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Copy profile" }));
  },
};

export const Narrow: Story = {
  parameters: { viewport: { defaultViewport: "mobile1" } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByLabelText("Bundle metadata from index.md")).toBeVisible();
    await expect(canvas.getByText(/Confirm before external distribution/)).toBeVisible();
  },
};
