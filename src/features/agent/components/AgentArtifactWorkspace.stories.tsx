import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import type { AgentArtifact, AgentArtifactItem, AgentCriticReport } from "@/features/agent/artifact.ts";
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
  verification: {
    errors: 0,
    warnings: 1,
    completionBlocked: false,
    findings: [{
      ruleId: "artifact-proposed-concepts",
      ruleVersion: 1,
      category: "identity",
      level: "warning",
      message: "The artifact refers to concepts that do not yet exist in the active bundle.",
      fieldIds: [],
      conceptIds: ["features/artifact-history"],
      sourceIds: [],
    }],
  },
};

const criticReport: AgentCriticReport = {
  artifactId: artifact.artifactId,
  artifactRevision: artifact.revision,
  bundleFingerprint: artifact.bundleFingerprint,
  outcome: "concerns-found",
  completionBlocked: false,
  checks: [
    { category: "coverage", status: "checked", detail: "The declared impact scope was reviewed." },
    { category: "contradictions", status: "checked", detail: "No internal contradiction was found." },
    { category: "unsupported-claims", status: "checked", detail: "One claim needs a stronger source link." },
    { category: "missed-relationships", status: "checked", detail: "One possible consumer remains unverified." },
  ],
  findings: [{
    id: "unverified-consumer",
    category: "missed-relationships",
    severity: "question",
    basis: "inference",
    claim: "Does thread history also consume the artifact revision contract?",
    references: [{ kind: "field", id: "proposed-change" }],
    deterministicRuleIds: ["artifact-proposed-concepts"],
    deterministicRelationship: "disagrees",
  }],
  limitations: [
    {
      code: "isolated-read-only-session",
      detail: "The critic ran without a write grant and could not approve or apply changes.",
    },
  ],
  comparison: {
    agreements: [],
    disagreements: ["unverified-consumer"],
    unverifiedQuestions: ["unverified-consumer"],
  },
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
    criticState: { status: "idle" },
    criticProviderName: "Codex",
    selectedConceptId: "features/agent-panel",
    sending: false,
    onShowConversation: fn(),
    onRetry: fn(),
    onOpenConcept: fn(),
    onSendRevision: fn(),
    onRunCritic: fn(),
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
    await userEvent.click(canvas.getByRole("button", { name: "Run critic" }));
    await waitFor(() => expect(args.onRunCritic).toHaveBeenCalled());
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
        verification: {
          errors: 1,
          warnings: 0,
          completionBlocked: true,
          findings: [{
            ruleId: "artifact-completeness",
            ruleVersion: 1,
            category: "completeness",
            level: "error",
            message: "The artifact is partial and cannot be treated as complete.",
            fieldIds: ["proposed-change"],
            conceptIds: [],
            sourceIds: [],
          }],
        },
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
  args: {
    criticState: {
      status: "ready",
      report: criticReport,
      providerLimitations: ["The provider did not report full okf-audit capability."],
    },
  },
  parameters: {
    viewport: { defaultViewport: "mobile1" },
  },
};

export const CriticCompared: Story = {
  args: {
    criticState: {
      status: "ready",
      report: criticReport,
      providerLimitations: [],
    },
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("concerns found")).toBeVisible();
    await expect(canvas.getByText("Does thread history also consume the artifact revision contract?")).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Run again" }));
    await waitFor(() => expect(args.onRunCritic).toHaveBeenCalled());
  },
};

export const CriticUnavailable: Story = {
  args: {
    criticState: {
      status: "ready",
      report: {
        ...criticReport,
        outcome: "inconclusive",
        findings: [],
        checks: criticReport.checks.map((check) => check.category === "missed-relationships"
          ? { ...check, status: "unavailable", detail: "The provider could not inspect graph neighbors." }
          : check),
        limitations: [{
          code: "relationship-tool-unavailable",
          detail: "The provider did not expose relationship inspection in this session.",
        }],
        comparison: { agreements: [], disagreements: [], unverifiedQuestions: [] },
      },
      providerLimitations: ["okf-audit support is unavailable."],
    },
  },
};

export const CriticBlockedForStandardAgent: Story = {
  args: {
    criticProviderName: "Claude Agent",
    criticUnavailableReason: "Independent critique requires Studio Agent. Rust supplies only the declared evidence and exposes no tools to the critic session.",
    onRunCritic: undefined,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("button", { name: "Run critic" })).toBeDisabled();
    await expect(canvas.getByText(/requires Studio Agent/i)).toBeVisible();
  },
};

export const CriticLoading: Story = {
  args: {
    criticState: {
      status: "loading",
      limitations: [{
        code: "isolated-read-only-session",
        detail: "The critic runs without a write grant.",
      }],
    },
  },
};

export const CriticError: Story = {
  args: {
    criticState: {
      status: "error",
      message: "The critic returned a source ID that does not exist in this artifact.",
      limitations: [],
    },
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(args.onRunCritic).toHaveBeenCalled());
  },
};
