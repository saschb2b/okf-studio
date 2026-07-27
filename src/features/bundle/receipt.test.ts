import { describe, expect, it } from "vitest";
import { parseReceipt } from "./receipt.ts";

describe("parseReceipt", () => {
  it("coerces scalars, because a real receipt is not all strings", () => {
    // BigQuery reports a row count as a number and a dry-run flag as a boolean.
    // Refusing those would reject the receipts this exists to check.
    const parsed = parseReceipt('{"job_id":"bq:1","rows":42,"dry_run":false}');
    expect(parsed.ok && parsed.receipt).toEqual({
      job_id: "bq:1",
      rows: "42",
      dry_run: "false",
    });
  });

  it("drops and names nested values rather than stringifying them", () => {
    // A `{"rows":[...]}` serialized into a field would compare against nothing
    // meaningful, and keeping it silently would let a receipt look complete when
    // the field the contract wanted is not really present.
    const parsed = parseReceipt('{"job_id":"bq:1","rows":[1,2],"meta":{"a":1},"none":null}');
    expect(parsed.ok && parsed.receipt).toEqual({ job_id: "bq:1" });
    expect(parsed.ok && parsed.dropped).toEqual(["rows", "meta", "none"]);
  });

  it("rejects what is not a receipt", () => {
    expect(parseReceipt("")).toEqual({ ok: false, error: expect.any(String) });
    expect(parseReceipt("not json").ok).toBe(false);
    expect(parseReceipt("[1,2]").ok).toBe(false);
    expect(parseReceipt('"a string"').ok).toBe(false);
    expect(parseReceipt("null").ok).toBe(false);
    // Parses, but there is nothing to check.
    expect(parseReceipt('{"rows":[1]}').ok).toBe(false);
  });
});
