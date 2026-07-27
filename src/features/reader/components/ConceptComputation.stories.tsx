// The computation contract across the shapes a bundle produces, including the
// incomplete ones — a contract missing its attester or receipt cannot gate
// anything, and the panel has to say so rather than render a tidy blank.

import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect } from "storybook/test";
import { mockConcept } from "@/mock/conceptFixtures.ts";
import { ConceptComputation } from "./ConceptComputation.tsx";

function Rail({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ width: 320, padding: "var(--space-12)", background: "var(--bg-elev)" }}>
      {children}
    </div>
  );
}

const COMPLETE = {
  runtime: "bigquery",
  parameters: [
    { name: "year", type: "integer", required: true },
    { name: "region", type: "string", required: false },
  ],
  computation: null,
  executor: {
    resource: "references/skills/run-on-bq.md",
    receipt: ["job_id", "executed_sql", "result"],
  },
  attester: { resource: "references/attesters/revenue.py" },
};

const meta = {
  title: "Reader/ConceptComputation",
  component: ConceptComputation,
  render: (args) => (
    <Rail>
      <ConceptComputation {...args} />
    </Rail>
  ),
} satisfies Meta<typeof ConceptComputation>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Everything declared, with the computation inline under its heading. */
export const InlineComputation: Story = {
  args: {
    concept: mockConcept({
      type: "Attested Computation",
      title: "Revenue for fiscal year",
      computation: COMPLETE,
    }),
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("bigquery")).toBeVisible();
    // The constraint the type exists to enforce.
    await expect(canvas.getByText(/must not author or\s+edit the computation/)).toBeVisible();
    await expect(canvas.getByText("required")).toBeVisible();
    await expect(canvas.getByText("job_id")).toBeVisible();
  },
};

/**
 * Stored in a file. The panel names the path; the reading column renders its
 * text under the same `# Computation` heading the inline form uses, so a reader
 * cannot tell which form the producer chose.
 */
export const FileComputation: Story = {
  args: {
    concept: mockConcept({
      type: "Attested Computation",
      computation: {
        ...COMPLETE,
        computation: "references/computations/lib/revenue.sql",
      },
    }),
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByText("references/computations/lib/revenue.sql"),
    ).toBeVisible();
    await expect(canvas.getByText(/shown under the/)).toBeVisible();
  },
};

/**
 * No receipt fields and no attester. The contract parses, and gates nothing —
 * the validator reports both, and the panel states them rather than leaving a
 * tidy blank where the checks should be.
 */
export const CannotGate: Story = {
  args: {
    concept: mockConcept({
      type: "Attested Computation",
      computation: {
        runtime: "python",
        parameters: [],
        computation: null,
        executor: { resource: null, receipt: [] },
        attester: { resource: null },
      },
    }),
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByText(/nothing for an attester to inspect/),
    ).toBeVisible();
    await expect(
      canvas.getByText(/nothing turns a receipt into a verdict/),
    ).toBeVisible();
    await expect(canvas.getByText(/takes no inputs/)).toBeVisible();
  },
};

/** An ordinary concept carries no contract, and the panel renders nothing. */
export const NotAComputation: Story = {
  args: { concept: mockConcept() },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector(".concept-computation")).toBeNull();
  },
};

/** Long paths and many parameters, which is where the rail gives out. */
export const LongValues: Story = {
  args: {
    concept: mockConcept({
      type: "Attested Computation",
      computation: {
        runtime: "bigquery",
        parameters: [
          { name: "fiscal_year", type: "integer", required: true },
          { name: "reporting_region_code", type: "string", required: true },
          { name: "include_intercompany", type: "boolean", required: false },
        ],
        computation:
          "references/computations/lib/finance/recognized-revenue-by-fiscal-year-and-region.sql",
        executor: {
          resource: "references/skills/run-on-bigquery-with-service-account.md",
          receipt: ["job_id", "executed_sql", "result", "bytes_processed"],
        },
        attester: {
          resource: "references/attesters/finance/revenue-sql-equality.py",
        },
      },
    }),
  },
};
