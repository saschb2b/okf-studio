import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { useState } from "react";
import { OkfTaskLauncher } from "@/features/agent/components/OkfTaskLauncher.tsx";
import { OKF_TASKS, type OkfContextPlan, type OkfTaskId } from "@/features/agent/taskContext.ts";

const origin = {
  kind: "concept" as const,
  id: "concept:features/agent-panel",
  title: "Agent Panel",
  conceptId: "features/agent-panel",
};

const plan: OkfContextPlan = {
  schemaVersion: 1,
  taskId: "okf-audit",
  capabilityIds: ["okf-inspect", "okf-audit"],
  tools: ["read", "search", "validate"],
  network: false,
  writes: false,
  bundleFingerprint: "okf-revision-4a18c2ef",
  objects: [{
    id: "features/agent-panel",
    title: "Agent Panel",
    type: "Feature",
    path: "features/agent-panel.md",
    reason: "active-concept",
    required: false,
    estimatedBytes: 1840,
  }],
  sources: [],
  validation: { errors: 0, warnings: 2 },
  budget: {
    maxBytes: 131072,
    maxEstimatedTokens: 32768,
    selectedBytes: 1840,
    selectedEstimatedTokens: 460,
  },
  omissions: [],
};

const meta = {
  title: "Agent/Work/OKF task launcher",
  component: OkfTaskLauncher,
  args: {
    open: true,
    origin,
    status: "ready",
    tasks: ["okf-audit", "okf-enrich", "okf-research", "okf-change-impact"],
    selectedTaskId: "okf-audit",
    plan,
    connectionName: "Codex",
    onTaskChange: fn(),
    onClose: fn(),
    onConnect: fn(),
    onAuthenticate: fn(),
    onRefresh: fn(),
    onStart: fn(),
  },
  render: function LauncherStory(args) {
    const [selectedTaskId, setSelectedTaskId] = useState<OkfTaskId>(args.selectedTaskId);
    const selectedTask = OKF_TASKS[selectedTaskId];
    const selectedPlan = args.plan ? {
      ...args.plan,
      taskId: selectedTaskId,
      capabilityIds: selectedTask.capabilityIds,
      tools: selectedTask.tools,
      network: selectedTask.network,
      writes: selectedTask.writes,
    } : undefined;
    return (
      <OkfTaskLauncher
        {...args}
        selectedTaskId={selectedTaskId}
        plan={selectedPlan}
        onTaskChange={(taskId) => {
          setSelectedTaskId(taskId);
          args.onTaskChange(taskId);
        }}
      />
    );
  },
} satisfies Meta<typeof OkfTaskLauncher>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Ready: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement.ownerDocument.body);
    await expect(await canvas.findByRole("dialog", { name: "Start OKF work" })).toBeVisible();
    await userEvent.click(canvas.getByRole("radio", { name: /Research with cited evidence/i }));
    await expect(canvas.getByRole("radio", { name: /Research with cited evidence/i })).toBeChecked();
    await userEvent.click(canvas.getByRole("button", { name: "Start task" }));
    await expect(args.onStart).toHaveBeenCalledOnce();
  },
};

export const FirstUse: Story = {
  args: { status: "first-use", plan: undefined },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement.ownerDocument.body);
    await userEvent.click(await canvas.findByRole("button", { name: "Connect an agent" }));
    await expect(args.onConnect).toHaveBeenCalledOnce();
  },
};

export const Authentication: Story = {
  args: { status: "authentication", plan: undefined },
};

export const Unsupported: Story = {
  args: { status: "unsupported", tasks: [], plan: undefined },
};

export const StalePlan: Story = {
  args: { status: "stale" },
};

export const ContextOverflow: Story = {
  args: {
    status: "overflow",
    plan: {
      ...plan,
      omissions: [{
        kind: "bundle-object",
        id: "features/structured-agent-work",
        reason: "budget-exceeded",
      }],
    },
  },
};

export const ActiveThreadConflict: Story = {
  args: { status: "active-thread-conflict" },
};

export const Narrow: Story = {
  parameters: { viewport: { defaultViewport: "mobile1" } },
};
