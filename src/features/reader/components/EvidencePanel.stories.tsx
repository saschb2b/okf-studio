import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent } from "storybook/test";
import { inspectConceptEvidence } from "@/shared/evidence.ts";
import { EvidencePanel } from "./EvidencePanel.tsx";

const evidence = inspectConceptEvidence({
  provenance: {
    report: {
      title: "Public research report",
      uri: "https://example.com/report",
      observed_at: "2026-07-22T12:00:00Z",
      source_digest: `sha256-${"a".repeat(64)}`,
      evidence_digest: `sha256-${"b".repeat(64)}`,
      adapter: { id: "html", version: 1 },
      discovery: "url",
      media_type: "text/html",
      locator: "Results, paragraph 4",
    },
  },
  evidence: {
    report: {
      provenance_id: "report",
      locator: "Results, paragraph 4",
      last_checked_at: "2026-07-22T12:30:00Z",
      last_status: "available",
      last_fingerprint: `sha256-${"a".repeat(64)}`,
    },
  },
}, "The reported result increased.[^report]\n\nMissing.[^missing]");

const meta = {
  title: "Reader/EvidencePanel",
  component: EvidencePanel,
  parameters: { layout: "centered" },
  decorators: [
    (Story) => (
      <aside
        className="reader-rail"
        style={{ width: "min(320px, calc(100vw - 32px))" }}
      >
        <Story />
      </aside>
    ),
  ],
} satisfies Meta<typeof EvidencePanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AuthoredAndChecked: Story = {
  args: { evidence, onOpenExternal: fn() },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Available")).toBeVisible();
    await expect(canvas.getByText(/Body line 3/)).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Check source" }));
    await expect(await canvas.findByText("Changed")).toBeVisible();
  },
};

export const Narrow: Story = {
  args: { evidence, onOpenExternal: fn() },
  globals: { viewport: { value: "mobile1", isRotated: false } },
};

export const UnavailableObservation: Story = {
  args: {
    evidence: inspectConceptEvidence({
      evidence: {
        report: {
          title: "Public research report",
          uri: "https://example.com/report",
          locator: "Results, paragraph 4",
          last_checked_at: "2026-07-22T12:30:00Z",
          last_status: "unavailable",
        },
      },
    }, "The reported result increased.[^report]"),
    onOpenExternal: fn(),
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Unavailable")).toBeVisible();
    await expect(canvas.getByText(/not a truth verdict/i)).toBeVisible();
  },
};
