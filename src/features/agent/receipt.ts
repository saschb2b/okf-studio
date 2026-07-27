// The gate's client half: an agent's claim that it ran a sanctioned computation.
//
// See src-tauri/src/agent/host/agent_receipt.rs for the check itself. The one
// property to preserve on this side: the agent supplies only its receipt. What
// the receipt is compared against is read from the bundle by the backend, so
// nothing here should ever accept a computation from the model.

import type { AttestationReport } from "@/shared/types.ts";

export const RECEIPT_FENCE = "```okf-receipt";

export type AgentReceiptValidation =
  | { status: "none" }
  /** A fence was present and unusable. Surfaced rather than dropped: a turn
   *  that tried to claim attestation and failed is a more interesting state
   *  than one that never claimed anything. */
  | { status: "invalid"; message: string }
  | { status: "checked"; report: AttestationReport };

/** Whether agent output claims a run at all. Cheap enough to run per token
 *  without going to the backend. */
export function claimsARun(markdown: string): boolean {
  return markdown.includes(RECEIPT_FENCE);
}
