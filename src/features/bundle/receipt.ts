// Parsing a pasted run receipt.
//
// The engine takes a flat map of field name to text, because the only thing it
// does with a value is compare it or check it is present. A real receipt out of
// a query runtime is not flat and is not all strings — BigQuery reports a row
// count as a number and a dry-run flag as a boolean — so refusing anything that
// is not `Record<string, string>` would reject the receipts this exists to
// check.

/** A parsed receipt, or the reason it could not be used. */
export type ReceiptParse =
  | { ok: true; receipt: Record<string, string>; dropped: string[] }
  | { ok: false; error: string };

/**
 * Parse receipt JSON into the flat field map the engine takes.
 *
 * Scalars are coerced to text, since that is what a comparison needs. Nested
 * objects and arrays are **dropped and named** rather than stringified: a
 * `{"rows": [...]}` serialized into a field would compare against nothing
 * meaningful, and silently keeping it would let a receipt look complete when
 * the field the contract wanted is not really there.
 */
export function parseReceipt(text: string): ReceiptParse {
  const trimmed = text.trim();
  if (!trimmed) return { ok: false, error: "Paste the receipt a run returned." };

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return { ok: false, error: "That is not valid JSON." };
  }

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {
      ok: false,
      error: "A receipt is a JSON object of field names to values.",
    };
  }

  const receipt: Record<string, string> = {};
  const dropped: string[] = [];
  for (const [key, value] of Object.entries(parsed)) {
    if (value === null || value === undefined) {
      dropped.push(key);
    } else if (typeof value === "object") {
      dropped.push(key);
    } else {
      receipt[key] = String(value);
    }
  }

  if (Object.keys(receipt).length === 0) {
    return { ok: false, error: "That receipt carries no usable fields." };
  }
  return { ok: true, receipt, dropped };
}
