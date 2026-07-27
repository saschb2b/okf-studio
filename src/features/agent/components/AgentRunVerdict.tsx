// The gate, in the thread: whether a turn's reported number came from the
// computation this bundle sanctions.
//
// It sits inside the turn rather than in a panel someone opens, because the
// failure it guards is an agent reporting a number from a query it wrote
// itself, and that claim is made *here*. Security research is consistent that
// a passive indicator is ignored while one that interrupts the task is heeded,
// so a badge on a concept page — which nobody consults while reading an answer
// — would be the ineffective shape.
//
// Studio still shows the agent's prose. Withholding the message would hide the
// evidence a reader needs to judge the failure, and would make a false negative
// far more costly than it needs to be. What changes is that the number arrives
// already labelled.

import { AlertTriangle } from "lucide-react";
import { AttestationVerdict } from "@/features/bundle/components/AttestationVerdict.tsx";
import type { AgentReceiptValidation } from "@/features/agent/receipt.ts";
import "./AgentRunVerdict.css";

export function AgentRunVerdict({ validation }: { validation: AgentReceiptValidation }) {
  if (validation.status === "none") return null;

  if (validation.status === "invalid") {
    // Surfaced rather than dropped. A turn that tried to claim attestation and
    // produced something unusable is a more interesting state than one that
    // never claimed anything, and swallowing it would let a broken claim read
    // as an ordinary answer.
    return (
      <div className="agent-run-verdict agent-run-verdict--invalid" role="status">
        <p className="agent-run-verdict__headline">
          <AlertTriangle size={15} aria-hidden="true" />
          <span>This turn claimed a checked run, and the claim could not be read</span>
        </p>
        <p className="agent-run-verdict__detail">{validation.message}</p>
      </div>
    );
  }

  return (
    <div className="agent-run-verdict">
      <AttestationVerdict report={validation.report} />
    </div>
  );
}
