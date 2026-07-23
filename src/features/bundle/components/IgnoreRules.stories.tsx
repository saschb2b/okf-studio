import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent } from "storybook/test";
import { IgnoreRules } from "./IgnoreRules.tsx";

const meta = {
  title: "Bundle/IgnoreRules",
  component: IgnoreRules,
  parameters: { layout: "centered" },
  decorators: [
    (Story) => (
      <div style={{ width: "min(680px, calc(100vw - 32px))" }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof IgnoreRules>;

export default meta;
type Story = StoryObj<typeof meta>;

export const RootRules: Story = {
  args: { bundleRoot: "/mock/workspace/docs" },
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("4 excluded · 3 root rules")).toBeVisible();
    await expect(canvas.getByText(/not encryption/i)).toBeVisible();
    await userEvent.click(canvas.getByText("Inspect exclusions"));
    await expect(canvas.getByText("drafts/private-notes.md")).toBeVisible();
  },
};

export const Narrow: Story = {
  args: { bundleRoot: "/mock/workspace/docs" },
  globals: { viewport: { value: "mobile1", isRotated: false } },
};
