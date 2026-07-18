import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent } from "storybook/test";
import { FederatedBundleSet } from "@/features/agent/components/FederatedBundleSet.tsx";
import type { BundleLibraryEntry, FederatedBundleStatus } from "@/features/agent/federation.ts";

const entries: BundleLibraryEntry[] = [
  {
    bundleId: "00000000-0000-4000-8000-000000000001",
    title: "OKF Studio specification",
    kind: "localFolder",
    conceptCount: 56,
    types: ["Feature", "Architecture", "Product Roadmap"],
    tags: ["studio", "okf"],
    revisionFingerprint: "okf-health-revision-0000000000000001",
    grantState: "available",
    lastSeenEpochMs: 1_750_000_000_003,
    active: true,
  },
  {
    bundleId: "00000000-0000-4000-8000-000000000002",
    title: "Primer design system",
    kind: "localFolder",
    conceptCount: 60,
    types: ["Component", "Guideline", "Pattern"],
    tags: ["design-system"],
    revisionFingerprint: "okf-health-revision-0000000000000002",
    grantState: "available",
    lastSeenEpochMs: 1_750_000_000_002,
    active: false,
  },
  {
    bundleId: "00000000-0000-4000-8000-000000000003",
    title: "Team handbook with a deliberately long retained identity",
    kind: "localFolder",
    conceptCount: 202,
    types: ["Guide", "Policy", "Runbook"],
    tags: ["operations"],
    revisionFingerprint: "okf-health-revision-0000000000000003",
    grantState: "available",
    lastSeenEpochMs: 1_750_000_000_001,
    active: false,
  },
];

const meta = {
  title: "Agent/Work/Federated bundle set",
  component: FederatedBundleSet,
  parameters: { layout: "centered" },
  decorators: [
    (Story) => <div style={{ width: "min(560px, calc(100vw - 32px))" }}><Story /></div>,
  ],
  args: {
    entries,
    selectedIds: [entries[0].bundleId],
    state: "ready",
    onToggle: fn(),
    onRetry: fn(),
  },
} satisfies Meta<typeof FederatedBundleSet>;

export default meta;
type Story = StoryObj<typeof meta>;

function InteractiveSet() {
  const [selectedIds, setSelectedIds] = useState([entries[0].bundleId]);
  return (
    <FederatedBundleSet
      state="ready"
      entries={entries}
      selectedIds={selectedIds}
      onToggle={(bundleId, selected) => setSelectedIds((current) =>
        selected ? [...current, bundleId] : current.filter((id) => id !== bundleId)
      )}
      onRetry={() => undefined}
    />
  );
}

export const Ready: Story = {
  render: () => <InteractiveSet />,
  play: async ({ canvas }) => {
    const primer = canvas.getByRole("checkbox", { name: /Primer design system/i });
    await userEvent.click(primer);
    await expect(primer).toBeChecked();
    await expect(canvas.getByText("1 evidence bundle")).toBeInTheDocument();
  },
};

const partialStatuses: FederatedBundleStatus[] = [
  {
    bundleId: entries[0].bundleId,
    title: entries[0].title,
    grantState: "available",
    revisionFingerprint: entries[0].revisionFingerprint,
    expectedFingerprint: entries[0].revisionFingerprint,
  },
  {
    bundleId: entries[1].bundleId,
    title: entries[1].title,
    grantState: "changed",
    revisionFingerprint: "okf-health-revision-current",
    expectedFingerprint: entries[1].revisionFingerprint,
  },
  {
    bundleId: entries[2].bundleId,
    title: entries[2].title,
    grantState: "revoked",
    revisionFingerprint: entries[2].revisionFingerprint,
    expectedFingerprint: entries[2].revisionFingerprint,
  },
];

export const PartialUnavailable: Story = {
  args: {
    statuses: partialStatuses,
    selectedIds: entries.map((entry) => entry.bundleId),
  },
};

export const Loading: Story = { args: { state: "loading", entries: [], selectedIds: [] } };
export const Previewing: Story = {
  args: { state: "previewing", selectedIds: entries.slice(0, 2).map((entry) => entry.bundleId) },
};
export const Empty: Story = { args: { state: "empty", entries: [], selectedIds: [] } };
export const Error: Story = {
  args: { state: "error", entries: [], selectedIds: [], error: "The bundle library could not be read." },
  play: async ({ canvas, args }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Retry" }));
    await expect(args.onRetry).toHaveBeenCalledOnce();
  },
};

export const Narrow: Story = {
  decorators: [(Story) => <div style={{ width: 328 }}><Story /></div>],
};
