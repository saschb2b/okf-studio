// The gate, through the browser stand-in.
//
// The Rust module carries the authoritative tests; these cover the stand-in,
// which is what the browser build and the component suites check through. A
// stand-in that answered differently would make every test of the gate a test
// of nothing.

import { describe, expect, it } from "vitest";
import { validateAgentReceipt } from "@/shared/ipc.ts";
import { claimsARun } from "./receipt.ts";

const ROOT = "/mock/workspace/docs";
const CONCEPT = "metrics/recognized-revenue";

function fence(body: unknown): string {
  return ["The figure is 12,345.", "", "```okf-receipt", JSON.stringify(body), "```", ""].join("\n");
}

const SANCTIONED =
  "SELECT SUM(o.amount_usd) AS recognized_revenue FROM `finance.orders` AS o WHERE o.fiscal_year = 2026 AND (NULL IS NULL OR o.region = NULL) AND o.status = 'recognized'";

describe("claimsARun", () => {
  it("is false for ordinary prose", () => {
    expect(claimsARun("Revenue was 12,345.")).toBe(false);
    expect(claimsARun(fence({ schemaVersion: 1 }))).toBe(true);
  });
});

describe("validateAgentReceipt", () => {
  it("passes a run of the sanctioned computation, coercing a numeric result", async () => {
    const result = await validateAgentReceipt(
      ROOT,
      fence({
        schemaVersion: 1,
        conceptId: CONCEPT,
        receipt: { job_id: "bq:1", executed_sql: SANCTIONED, result: 12345 },
      }),
      "2026-07-27",
    );
    expect(result.status).toBe("checked");
    expect(result.status === "checked" && result.report.verdict).toBe("provenance-established");
  });

  it("fails a run whose query the agent wrote", async () => {
    const result = await validateAgentReceipt(
      ROOT,
      fence({
        schemaVersion: 1,
        conceptId: CONCEPT,
        receipt: {
          job_id: "bq:2",
          executed_sql: "SELECT SUM(amount_usd) FROM `finance.raw_orders`",
          result: "99999",
        },
      }),
      "2026-07-27",
    );
    expect(result.status === "checked" && result.report.verdict).toBe("failed");
  });

  it("refuses a receipt naming a concept the bundle does not have", async () => {
    // The agent cannot smuggle in the contract it wants to be judged against.
    const result = await validateAgentReceipt(
      ROOT,
      fence({
        schemaVersion: 1,
        conceptId: "metrics/invented",
        receipt: { executed_sql: "SELECT 1" },
      }),
      "2026-07-27",
    );
    expect(result.status).toBe("invalid");
  });

  it("refuses a nested receipt field rather than stringifying it", async () => {
    const result = await validateAgentReceipt(
      ROOT,
      fence({ schemaVersion: 1, conceptId: CONCEPT, receipt: { rows: [1, 2] } }),
      "2026-07-27",
    );
    expect(result.status === "invalid" && result.message).toMatch(/nothing to compare/);
  });

  it("reports a malformed fence instead of dropping it", async () => {
    // A turn that tried to claim attestation and failed is a more interesting
    // state than one that never claimed anything.
    const markdown = ["Figure.", "", "```okf-receipt", "{not json", "```", ""].join("\n");
    expect((await validateAgentReceipt(ROOT, markdown, "2026-07-27")).status).toBe("invalid");
  });

  it("is silent for a turn that claims nothing", async () => {
    expect((await validateAgentReceipt(ROOT, "Revenue was 12,345.", "2026-07-27")).status).toBe(
      "none",
    );
  });
});
