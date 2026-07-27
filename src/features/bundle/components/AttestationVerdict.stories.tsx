// Every verdict state, including the ones that must not look like a pass.

import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect } from "storybook/test";
import type { AttestationReport } from "@/shared/types.ts";
import { AttestationVerdict } from "./AttestationVerdict.tsx";

const PASSING: NonNullable<AttestationReport["attestation"]> = {
  missingReceiptFields: [],
  provenance: { state: "passed" },
  fidelity: {
    state: "unavailable",
    detail:
      "Fidelity is checked by the executor's runtime, by re-reading the result by job id.",
  },
  attested: false,
  stale: false,
};

const BASE: AttestationReport = {
  conceptId: "metrics/revenue",
  conceptTitle: "Recognized revenue",
  runtime: "bigquery",
  source: { kind: "file", path: "computations/revenue.sql", text: "SELECT 1" },
  contractError: null,
  verdict: "provenance-established",
  attestation: PASSING,
};

const meta = {
  title: "Bundle/AttestationVerdict",
  component: AttestationVerdict,
  render: (args) => (
    <div style={{ width: 560, padding: "var(--space-12)", background: "var(--bg-elev)" }}>
      <AttestationVerdict {...args} />
    </div>
  ),
} satisfies Meta<typeof AttestationVerdict>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Everything Studio can check passed — and it still says what it did not check. */
export const ProvenanceEstablished: Story = {
  args: { report: BASE },
  play: async ({ canvas }) => {
    await expect(canvas.getByText(/used the sanctioned computation/i)).toBeVisible();
    // The limit is stated on a pass, not only on a failure. A reader who takes
    // this for full attestation has been told something Studio did not check.
    await expect(canvas.getByText(/cannot confirm the reported number/i)).toBeVisible();
    await expect(canvas.getByText("Not checked here")).toBeVisible();
  },
};

/** The failure the type exists to catch: an agent ran its own query. */
export const Substituted: Story = {
  args: {
    report: {
      ...BASE,
      verdict: "failed",
      attestation: {
        ...PASSING,
        provenance: {
          state: "failed",
          detail: "The executed_sql does not match the stored computation.",
        },
      },
    },
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText(/cannot be trusted/i)).toBeVisible();
    await expect(canvas.getByText("Failed")).toBeVisible();
  },
};

/** Declared evidence the run did not return. */
export const MissingEvidence: Story = {
  args: {
    report: {
      ...BASE,
      verdict: "failed",
      attestation: { ...PASSING, missingReceiptFields: ["job_id", "result"] },
    },
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("job_id")).toBeVisible();
  },
};

/**
 * Nothing to compare. This is the state that must never read as a pass — an
 * unavailable check is where a gate silently stops gating.
 */
export const NothingToCompare: Story = {
  args: {
    report: {
      ...BASE,
      verdict: "failed",
      attestation: {
        ...PASSING,
        provenance: {
          state: "unavailable",
          detail: "The receipt carries no executed-computation field to compare.",
        },
      },
    },
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText(/cannot be trusted/i)).toBeVisible();
    await expect(canvas.getAllByText("Not checked here").length).toBe(2);
  },
};

/** A stale definition warns without changing the verdict. */
export const StaleDefinition: Story = {
  args: {
    report: { ...BASE, attestation: { ...PASSING, stale: true } },
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText(/used the sanctioned computation/i)).toBeVisible();
    await expect(canvas.getByText(/nobody has rechecked/i)).toBeVisible();
  },
};

/** A bundle defect, phrased as one rather than as a failed run. */
export const ContractUnreadable: Story = {
  args: {
    report: {
      ...BASE,
      runtime: null,
      source: null,
      attestation: null,
      verdict: "contract-unreadable",
      contractError: { reason: "ambiguousComputation" },
    },
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText(/contract cannot be checked/i)).toBeVisible();
    await expect(canvas.getByText(/would be a guess/i)).toBeVisible();
  },
};
