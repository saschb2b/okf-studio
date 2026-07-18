import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent } from "storybook/test";
import type { OkfRoutineDefinition, OkfRoutineRun } from "@/features/agent/routines.ts";
import { OkfRoutineSettingsView } from "./OkfRoutineSettings.tsx";

const now = Date.UTC(2026, 6, 18, 12, 0, 0);
const routine: OkfRoutineDefinition = {
  schemaVersion: 1,
  id: "routine-health",
  name: "Daily bundle health",
  enabled: true,
  trigger: { mode: "scheduled", intervalMinutes: 1_440, catchUpAfterDowntime: false },
  scope: {
    bundleRoot: "C:/knowledge/docs",
    task: "health-rescan",
    agentId: null,
    modelId: null,
    toolIds: [],
    networkMode: "offline",
    sources: [],
    stagingAllowed: false,
  },
  timeoutSeconds: 30,
  nextRunAtMs: now + 86_400_000,
  createdAtMs: now - 86_400_000,
  updatedAtMs: now,
};
const attention: OkfRoutineRun = {
  schemaVersion: 1,
  id: "run-attention",
  routineId: routine.id,
  routineName: routine.name,
  bundleRoot: routine.scope.bundleRoot,
  scheduledTimeMs: now,
  actualStartMs: now,
  completedAtMs: now,
  scopeFingerprint: "sha256-scope",
  outcome: "attention",
  recoveryState: "complete",
  reason: "Health findings need review.",
  nextAction: "Open Health",
};

const meta = {
  title: "Agent/Routines/OkfRoutineSettings",
  component: OkfRoutineSettingsView,
  args: {
    bundleName: "OKF Studio docs",
    state: { status: "ready", workspace: { schemaVersion: 1, routines: [routine], runs: [attention] } },
    busyId: null,
    onCreate: fn(),
    onRun: fn(),
    onDelete: fn(),
  },
} satisfies Meta<typeof OkfRoutineSettingsView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Ready: Story = {
  play: async ({ canvas, args }) => {
    await expect(canvas.getByText("Daily bundle health")).toBeVisible();
    await expect(canvas.getByText("Health findings need review.")).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Run now" }));
    await expect(args.onRun).toHaveBeenCalledWith(routine.id);
  },
};

export const CreateManual: Story = {
  args: { state: { status: "ready", workspace: { schemaVersion: 1, routines: [], runs: [] } } },
  play: async ({ canvas, args }) => {
    await userEvent.clear(canvas.getByRole("textbox", { name: "Routine name" }));
    await userEvent.type(canvas.getByRole("textbox", { name: "Routine name" }), "Weekly audit");
    await userEvent.click(canvas.getByRole("button", { name: "Save routine" }));
    await expect(args.onCreate).toHaveBeenCalledWith("Weekly audit", false, null);
  },
};

export const CreateSourceCheck: Story = {
  args: { state: { status: "ready", workspace: { schemaVersion: 1, routines: [], runs: [] } } },
  play: async ({ canvas, args }) => {
    await userEvent.click(canvas.getByRole("checkbox", { name: "Check a bundle source" }));
    await userEvent.type(
      canvas.getByRole("textbox", { name: "Bundle-relative source" }),
      "assets/export.json",
    );
    await userEvent.click(canvas.getByRole("button", { name: "Save routine" }));
    await expect(args.onCreate).toHaveBeenCalledWith(
      "Bundle health check",
      false,
      "assets/export.json",
    );
  },
};

export const Loading: Story = {
  args: { state: { status: "loading" } },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("status")).toHaveTextContent("Loading local routines");
  },
};

export const Empty: Story = {
  args: { state: { status: "ready", workspace: { schemaVersion: 1, routines: [], runs: [] } } },
};

export const Error: Story = {
  args: { state: { status: "error", message: "Studio could not load local routines." } },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("alert")).toBeVisible();
  },
};

export const Narrow: Story = {
  parameters: { viewport: { defaultViewport: "mobile1" } },
};
