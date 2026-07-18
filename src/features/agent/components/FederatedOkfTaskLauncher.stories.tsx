import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { FederatedOkfTaskLauncher } from "@/features/agent/components/FederatedOkfTaskLauncher.tsx";
import type { OkfContextPlan, OkfTaskKickoff } from "@/features/agent/taskContext.ts";

const plan: OkfContextPlan = {
  schemaVersion: 1,
  taskId: "okf-research",
  capabilityIds: ["okf-inspect", "okf-research"],
  tools: ["read", "search", "web"],
  network: true,
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
  title: "Agent/Work/Federated OKF task launcher",
  component: FederatedOkfTaskLauncher,
  args: {
    requestId: "storybook-federated-launcher",
    activeRoot: "/mock/workspace/docs",
    origin: {
      kind: "concept",
      id: "concept:features/agent-panel",
      title: "Agent Panel",
      conceptId: "features/agent-panel",
    },
    status: "ready",
    tasks: ["okf-audit", "okf-enrich", "okf-research", "okf-change-impact"],
    selectedTaskId: "okf-research",
    plan,
    connectionName: "Codex",
    onTaskChange: fn(),
    onClose: fn(),
    onConnect: fn(),
    onAuthenticate: fn(),
    onRefresh: fn(),
    onStart: fn<(kickoff: OkfTaskKickoff) => void>(),
  },
} satisfies Meta<typeof FederatedOkfTaskLauncher>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Ready: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement.ownerDocument.body);
    const bundleSet = await canvas.findByRole("region", { name: "Bundle set" });
    await userEvent.click(within(bundleSet).getByRole("checkbox", {
      name: /Primer design system/i,
    }));
    const start = canvas.getByRole("button", { name: "Start task" });
    await expect(start).toBeEnabled();
    await userEvent.click(start);
    await waitFor(() => expect(args.onStart).toHaveBeenCalledOnce());
  },
};

export const Narrow: Story = {
  parameters: { viewport: { defaultViewport: "mobile1" } },
};

export const ExternalPromptDraft: Story = {
  args: {
    requestId: "storybook-external-launcher",
    origin: {
      kind: "external",
      id: "external:storybook",
      title: "Agent Panel",
      conceptId: "features/agent-panel",
    },
    tasks: ["okf-audit"],
    selectedTaskId: "okf-audit",
    plan: {
      ...plan,
      taskId: "okf-audit",
      capabilityIds: ["okf-inspect", "okf-audit"],
      tools: ["read", "search", "validate"],
      network: false,
    },
    promptDraft: "Check whether this concept still matches the implementation.",
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement.ownerDocument.body);
    const draft = await canvas.findByLabelText(/Prompt draft from external request/i);
    await userEvent.clear(draft);
    await userEvent.type(draft, "Audit the public contract.");
    await userEvent.click(canvas.getByRole("button", { name: "Start task" }));
    await waitFor(() => expect(args.onStart).toHaveBeenCalledOnce());
    const kickoff = args.onStart.mock.calls[0]?.[0];
    await expect(kickoff.prompt).toContain("Additional user-approved draft:\nAudit the public contract.");
  },
};
