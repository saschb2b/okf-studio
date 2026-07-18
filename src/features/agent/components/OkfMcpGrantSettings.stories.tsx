import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { OkfMcpGrantControl } from "@/features/agent/components/OkfMcpGrantSettings.tsx";

const meta = {
  title: "Agent/Settings/One-shot MCP grant",
  component: OkfMcpGrantControl,
  args: {
    grant: null,
    busy: false,
    copied: false,
    error: null,
    onCreate: fn(),
    onCopy: fn(),
  },
  decorators: [(Story) => (
    <div style={{ boxSizing: "border-box", width: "calc(100vw - 2rem)", maxWidth: "27rem", padding: "1rem" }}>
      <Story />
    </div>
  )],
} satisfies Meta<typeof OkfMcpGrantControl>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Idle: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Create one-shot grant" }));
    await expect(args.onCreate).toHaveBeenCalledOnce();
  },
};

export const Ready: Story = {
  args: {
    grant: {
      command: "C:\\Program Files\\OKF Studio\\okf-viewer.exe",
      args: ["--okf-mcp-grant", "C:\\Temp\\okf-studio-mcp-grants\\grant-redacted.json", "redacted-one-shot-token"],
      expiresAt: Date.now() + 60_000,
    },
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const descriptor = canvas.getByLabelText<HTMLTextAreaElement>("One-shot MCP descriptor");
    await expect(descriptor.value).toContain("okf-studio");
    await userEvent.click(canvas.getByRole("button", { name: "Copy descriptor" }));
    await expect(args.onCopy).toHaveBeenCalledOnce();
  },
};

export const Creating: Story = { args: { busy: true } };
export const Error: Story = { args: { error: "The active bundle grant was revoked." } };
export const Narrow: Story = { parameters: { viewport: { defaultViewport: "mobile1" } } };
