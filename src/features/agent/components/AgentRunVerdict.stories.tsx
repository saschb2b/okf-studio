// The gate as a reader meets it: inside the turn, attached to the answer.

import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect } from "storybook/test";
import type { AttestationReport } from "@/shared/types.ts";
import { AgentRunVerdict } from "./AgentRunVerdict.tsx";

const REPORT: AttestationReport = {
  conceptId: "metrics/recognized-revenue",
  conceptTitle: "Recognized revenue",
  runtime: "bigquery",
  source: { kind: "file", path: "computations/recognized-revenue.sql", text: "SELECT 1" },
  contractError: null,
  verdict: "provenance-established",
  attestation: {
    missingReceiptFields: [],
    provenance: { state: "passed" },
    fidelity: {
      state: "unavailable",
      detail:
        "Fidelity is checked by the executor's runtime, by re-reading the result by job id.",
    },
    attested: false,
    stale: false,
  },
};

const meta = {
  title: "Agent/AgentRunVerdict",
  component: AgentRunVerdict,
  render: (args) => (
    <div style={{ width: 620, padding: "var(--space-12)", background: "var(--bg-elev)" }}>
      <p style={{ marginTop: 0, fontSize: "var(--fs-sm)" }}>
        Recognized revenue for fiscal 2026 was $12,345.
      </p>
      <AgentRunVerdict {...args} />
    </div>
  ),
} satisfies Meta<typeof AgentRunVerdict>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The agent ran the sanctioned query. */
export const Checked: Story = {
  args: { validation: { status: "checked", report: REPORT } },
  play: async ({ canvas }) => {
    await expect(canvas.getByText(/used the sanctioned computation/i)).toBeVisible();
  },
};

/** The failure the type exists to catch, arriving with the number itself. */
export const AgentWroteItsOwnQuery: Story = {
  args: {
    validation: {
      status: "checked",
      report: {
        ...REPORT,
        verdict: "failed",
        attestation: {
          ...REPORT.attestation!,
          provenance: {
            state: "failed",
            detail:
              "The executed_sql does not match the stored computation. An agent may supply parameter values and must not author the computation.",
          },
        },
      },
    },
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText(/cannot be trusted/i)).toBeVisible();
    // The prose is still shown: hiding it would remove the evidence a reader
    // needs to judge the failure.
    await expect(canvas.getByText(/\$12,345/)).toBeVisible();
  },
};

/** A claim that could not be read is reported, not swallowed. */
export const UnreadableClaim: Story = {
  args: {
    validation: {
      status: "invalid",
      message: "This bundle has no concept metrics/invented, so there is no contract to check the run against.",
    },
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText(/claim could not be read/i)).toBeVisible();
  },
};

/** No claim, no panel. */
export const NoClaim: Story = {
  args: { validation: { status: "none" } },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector(".agent-run-verdict")).toBeNull();
  },
};
