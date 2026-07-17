import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent } from "storybook/test";
import { AgentSecurityHostDisclosure } from "./AgentConnectionCatalog.tsx";

const meta = {
  title: "Agent/Connection/AgentSecurityHostDisclosure",
  component: AgentSecurityHostDisclosure,
  args: {
    onRetry: fn(),
    state: {
      status: "ready",
      value: {
        platform: "windows",
        backend: "app-container",
        state: "ready",
        launchProfileAvailable: true,
      },
    },
  },
} satisfies Meta<typeof AgentSecurityHostDisclosure>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WindowsReady: Story = {
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByText("Restricted agent host: Restricted offline profile available"));
    await expect(canvas.getByText(/fresh offline AppContainer/u)).toBeVisible();
    await expect(canvas.getByText(/bounded file tools/u)).toBeVisible();
  },
};

export const WindowsProbeFailed: Story = {
  args: {
    state: {
      status: "ready",
      value: {
        platform: "windows",
        backend: "app-container",
        state: "probe-failed",
        launchProfileAvailable: false,
      },
    },
  },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByText("Restricted agent host: AppContainer probe failed"));
    await expect(canvas.getByText(/will not fall back/u)).toBeVisible();
  },
};

export const CheckError: Story = {
  args: { state: { status: "error" } },
  play: async ({ canvas, args }) => {
    await userEvent.click(canvas.getByText("Restricted agent host: Check failed"));
    await userEvent.click(canvas.getByRole("button", { name: "Retry" }));
    await expect(args.onRetry).toHaveBeenCalledOnce();
  },
};
