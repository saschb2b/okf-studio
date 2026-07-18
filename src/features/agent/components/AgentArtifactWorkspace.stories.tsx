import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import type { AgentArtifact, AgentArtifactItem } from "@/features/agent/artifact.ts";
import { AgentArtifactWorkspace } from "./AgentArtifactWorkspace.tsx";

const items: AgentArtifactItem[] = [
  {
    id: "inspect-current",
    label: "Inspect the current concept",
    detail: "Read the active concept and its direct graph neighbors before proposing edits.",
    status: "complete",
    conceptPath: "features/agent-panel.md",
    sourceIds: ["agent-panel"],
  },
  {
    id: "map-impact",
    label: "Map downstream impact",
    detail: "Separate observed links from inferred consumers.",
    status: "in-progress",
    conceptPath: "architecture/agent-system.md",
    sourceIds: ["agent-system"],
  },
];

const artifact: AgentArtifact = {
  schemaVersion: 1,
  artifactId: "impact-agent-panel",
  kind: "change-impact-map",
  revision: 3,
  parentRevision: 2,
  bundleFingerprint: "okf-health-revision-0123456789abcdef",
  title: "Agent Panel change impact",
  status: "complete",
  summary: "The panel contract affects its host boundary, task routing, and reviewed staging.",
  conceptReferences: [
    { path: "features/agent-panel.md", conceptId: "features/agent-panel", exists: true },
    { path: "architecture/agent-system.md", conceptId: "architecture/agent-system", exists: true },
    { path: "features/artifact-history.md", conceptId: "features/artifact-history", exists: false },
  ],
  sources: [
    {
      id: "agent-panel",
      label: "Agent Panel specification",
      kind: "bundle",
      reference: "features/agent-panel.md",
    },
    {
      id: "agent-system",
      label: "Agent system architecture",
      kind: "bundle",
      reference: "architecture/agent-system.md",
    },
  ],
  citations: [
    { sourceId: "agent-panel", claim: "Reviewed staging owns bundle mutation." },
    { sourceId: "agent-system", claim: "Task scope is selected before the turn starts." },
  ],
  fields: [
    {
      id: "target",
      label: "Target",
      value: "features/agent-panel.md",
      editable: true,
    },
    {
      id: "proposed-change",
      label: "Proposed change",
      value: "Add a persistent, revision-bound artifact workspace.",
      editable: true,
    },
  ],
  items,
  missingFields: [],
  large: false,
};

const meta = {
  title: "Agent/Work/AgentArtifactWorkspace",
  component: AgentArtifactWorkspace,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => <div style={{ height: 720, minWidth: 0 }}><Story /></div>,
  ],
  args: {
    state: { status: "ready", artifact, sentRevision: null },
    selectedConceptId: "features/agent-panel",
    sending: false,
    onShowConversation: fn(),
    onRetry: fn(),
    onOpenConcept: fn(),
    onSendRevision: fn(),
  },
} satisfies Meta<typeof AgentArtifactWorkspace>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Ready: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const change = canvas.getByLabelText("Proposed change");
    await userEvent.clear(change);
    await userEvent.type(change, "Keep artifacts beside the reader.");
    await expect(canvas.getByText("Local edits are not sent")).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Send revision 4" }));
    await waitFor(() => expect(args.onSendRevision).toHaveBeenCalled());
    await userEvent.click(canvas.getByRole("button", { name: /features\/agent-panel\.md/i }));
    await waitFor(() => expect(args.onOpenConcept).toHaveBeenCalledWith("features/agent-panel"));
  },
};

export const Loading: Story = {
  args: { state: { status: "loading" } },
};

export const Empty: Story = {
  args: { state: { status: "empty" } },
};

export const Partial: Story = {
  args: {
    state: {
      status: "ready",
      artifact: {
        ...artifact,
        status: "partial",
        fields: artifact.fields.slice(0, 1),
        missingFields: ["proposed-change"],
      },
      sentRevision: null,
    },
  },
};

export const Invalid: Story = {
  args: {
    state: {
      status: "invalid",
      message: "The artifact cites a source ID that it did not declare. The original response remains in the conversation.",
    },
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Validate again" }));
    await waitFor(() => expect(args.onRetry).toHaveBeenCalled());
  },
};

export const Stale: Story = {
  args: {
    state: {
      status: "stale",
      artifact,
      sentRevision: 4,
      message: "The agent returned revision 3 after revision 4 was sent.",
    },
  },
};

export const Large: Story = {
  args: {
    state: {
      status: "ready",
      artifact: {
        ...artifact,
        large: true,
        items: Array.from({ length: 140 }, (_, index) => ({
          ...items[index % items.length],
          id: `item-${index}`,
          label: `Affected concept ${index + 1}`,
        })),
      },
      sentRevision: null,
    },
  },
};

export const Narrow: Story = {
  parameters: {
    viewport: { defaultViewport: "mobile1" },
  },
};
