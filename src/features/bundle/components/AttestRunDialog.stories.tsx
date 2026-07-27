// The dialog rendered, because the previous version's problems — no footer, an
// action button floating mid-content, its own invented spacing — were all
// things only visible when looking at it. It had no story.

import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { mockConcept } from "@/mock/conceptFixtures.ts";
import type { AttestationReport } from "@/shared/types.ts";
import { AttestRunDialog } from "./AttestRunDialog.tsx";

const CONCEPT = mockConcept({
  id: "metrics/recognized-revenue",
  type: "Attested Computation",
  title: "Recognized revenue",
  computation: {
    runtime: "bigquery",
    parameters: [{ name: "fiscal_year", type: "integer", required: true }],
    computation: "computations/recognized-revenue.sql",
    executor: { resource: null, receipt: ["job_id", "executed_sql", "result"] },
    attester: { resource: "computations/attester.py" },
  },
});

function report(verdict: AttestationReport["verdict"]): AttestationReport {
  return {
    conceptId: CONCEPT.id,
    conceptTitle: CONCEPT.title,
    runtime: "bigquery",
    source: { kind: "file", path: "computations/recognized-revenue.sql", text: "SELECT 1" },
    contractError: null,
    verdict,
    attestation: {
      missingReceiptFields: [],
      provenance:
        verdict === "provenance-established"
          ? { state: "passed" }
          : { state: "failed", detail: "The executed_sql is not the sanctioned computation." },
      fidelity: {
        state: "unavailable",
        detail:
          "Fidelity is checked by the executor's runtime, by re-reading the result by job id.",
      },
      attested: false,
      stale: false,
    },
  };
}

const meta = {
  title: "Bundle/AttestRunDialog",
  component: AttestRunDialog,
  args: {
    open: true,
    onOpenChange: fn(),
    bundleRoot: "/mock/workspace/docs",
    concept: CONCEPT,
    attest: () => Promise.resolve(report("provenance-established")),
  },
} satisfies Meta<typeof AttestRunDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty. The required evidence is listed before anything is pasted. */
export const Empty: Story = {
  play: async ({ canvasElement }) => {
    const dialog = within(canvasElement.ownerDocument.body);
    await expect(dialog.getByText("Required evidence")).toBeVisible();
    // Nothing to check yet, so the action is unavailable rather than failing.
    await expect(dialog.getByRole("button", { name: "Check" })).toBeDisabled();
  },
};

/** The chips fill in as a receipt is pasted — the point of the live row. */
export const RequirementsFillIn: Story = {
  play: async ({ canvasElement }) => {
    const dialog = within(canvasElement.ownerDocument.body);
    const field = dialog.getByLabelText(/receipt json/i);
    await userEvent.click(field);
    await userEvent.paste(
      JSON.stringify({ job_id: "bq:1", executed_sql: "SELECT 1", result: "12345" }),
    );
    await waitFor(async () => {
      // Every declared field now reads as present. Matched on the whole
      // normalized string: testing-library trims, so a leading-space matcher
      // silently finds nothing.
      await expect(dialog.getAllByText(/^present$/).length).toBe(3);
    });
    await expect(dialog.getByRole("button", { name: "Check" })).toBeEnabled();
  },
};

/** A partial receipt: the missing field is visible before pressing Check. */
export const PartialReceipt: Story = {
  play: async ({ canvasElement }) => {
    const dialog = within(canvasElement.ownerDocument.body);
    await userEvent.click(dialog.getByLabelText(/receipt json/i));
    await userEvent.paste(JSON.stringify({ job_id: "bq:1" }));
    await waitFor(async () => {
      await expect(dialog.getAllByText(/^missing$/).length).toBe(2);
    });
  },
};

/** Not JSON at all. The error replaces the requirements row in the same slot. */
export const InvalidJson: Story = {
  play: async ({ canvasElement }) => {
    const dialog = within(canvasElement.ownerDocument.body);
    await userEvent.click(dialog.getByLabelText(/receipt json/i));
    await userEvent.paste("not json");
    await userEvent.click(dialog.getByRole("button", { name: "Check" }));
    await expect(await dialog.findByRole("alert")).toHaveTextContent(/not valid JSON/i);
  },
};

/** The verdict, below the form and above the footer. */
export const WithVerdict: Story = {
  play: async ({ canvasElement }) => {
    const dialog = within(canvasElement.ownerDocument.body);
    await userEvent.click(dialog.getByLabelText(/receipt json/i));
    await userEvent.paste(
      JSON.stringify({ job_id: "bq:1", executed_sql: "SELECT 1", result: "12345" }),
    );
    await userEvent.click(dialog.getByRole("button", { name: "Check" }));
    await expect(
      await dialog.findByText(/used the sanctioned computation/i),
    ).toBeVisible();
    // Re-running is the obvious next act, so the action says so.
    await expect(dialog.getByRole("button", { name: "Check again" })).toBeVisible();
  },
};

/** A failed run, which is the state the dialog exists to make unmissable. */
export const FailedRun: Story = {
  args: { attest: () => Promise.resolve(report("failed")) },
  play: async ({ canvasElement }) => {
    const dialog = within(canvasElement.ownerDocument.body);
    await userEvent.click(dialog.getByLabelText(/receipt json/i));
    await userEvent.paste(
      JSON.stringify({ job_id: "bq:1", executed_sql: "SELECT 2", result: "999" }),
    );
    await userEvent.click(dialog.getByRole("button", { name: "Check" }));
    await expect(await dialog.findByText(/cannot be trusted/i)).toBeVisible();
  },
};
