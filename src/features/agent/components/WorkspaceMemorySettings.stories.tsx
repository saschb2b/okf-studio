import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent } from "storybook/test";
import { createOmissionPreference, createTaskRecord } from "@/features/agent/workspaceMemory.ts";
import { WorkspaceMemorySettingsView } from "./WorkspaceMemorySettings.tsx";

const now = Date.UTC(2026, 6, 18, 10, 0, 0);
const preference = createOmissionPreference({
  bundleRoot: "C:/knowledge/docs",
  taskId: "okf-enrich",
  conceptId: "reference/glossary",
  conceptTitle: "Glossary",
  validationFingerprint: "revision-current",
  now,
});
const taskRecord = createTaskRecord({
  bundleRoot: "C:/knowledge/docs",
  taskId: "okf-audit",
  validationFingerprint: "revision-previous",
  now: now - 3_600_000,
});

const meta = {
  title: "Agent/Memory/WorkspaceMemorySettings",
  component: WorkspaceMemorySettingsView,
  args: {
    bundleName: "OKF Studio docs",
    fingerprint: "revision-current",
    state: { status: "ready", items: [preference, taskRecord] },
    deletingId: null,
    onDelete: fn(),
  },
} satisfies Meta<typeof WorkspaceMemorySettingsView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Ready: Story = {
  play: async ({ canvas, args }) => {
    await expect(canvas.getByText("2 items")).toBeVisible();
    await expect(canvas.getByText("preference · current")).toBeVisible();
    await expect(canvas.getByText("task record · stale")).toBeVisible();
    await userEvent.click(canvas.getByRole("button", {
      name: /Delete memory Omit Glossary/u,
    }));
    await expect(args.onDelete).toHaveBeenCalledWith(preference.id);
  },
};

export const Loading: Story = {
  args: { state: { status: "loading" } },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("status")).toHaveTextContent("Loading");
  },
};

export const Empty: Story = {
  args: { state: { status: "ready", items: [] } },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("No memory for this bundle.")).toBeVisible();
  },
};

export const Error: Story = {
  args: { state: { status: "error", message: "Studio could not load workspace memory." } },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("alert")).toBeVisible();
  },
};

export const Narrow: Story = {
  parameters: { viewport: { defaultViewport: "mobile1" } },
};
