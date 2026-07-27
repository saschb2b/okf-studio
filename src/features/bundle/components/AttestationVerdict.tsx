// The verdict on one run of an Attested Computation.
//
// Shared by both doors — the reader's manual paste and (next) the agent panel's
// submitted receipt — because a gate that answers differently depending on who
// knocked is not a gate.
//
// The one thing this must never do is let `unavailable` read as a pass. Studio
// cannot check fidelity: that means re-reading the authoritative result by job
// id, and only the executor's runtime can. So the headline states what Studio
// *did* establish, and the outstanding check stays visible underneath rather
// than being folded into a green tick.

import { AlertTriangle, CircleSlash, ShieldCheck, ShieldX } from "lucide-react";
import type { AttestationReport, CheckOutcome, ContractError } from "@/shared/types.ts";
import "@/shared/styles/chrome.css";
import "./AttestationVerdict.css";

function contractErrorText(error: ContractError): string {
  switch (error.reason) {
    case "notAComputation":
      return "This concept is not an Attested Computation, so there is no contract to check a run against.";
    case "missingRuntime":
      return "The contract declares no runtime, so there is no way to interpret what ran.";
    case "noComputation":
      return "The contract names no computation, inline or stored, so there is nothing to compare a run against.";
    case "ambiguousComputation":
      return "The contract supplies both an inline computation and a stored one. Which of them ran would be a guess.";
    case "unreadableComputation":
      return `The stored computation could not be read: ${error.detail}`;
  }
}

function CheckRow({
  label,
  outcome,
  note,
}: {
  label: string;
  outcome: CheckOutcome;
  note?: string;
}) {
  // Each state gets its own icon and its own word. An unavailable check is not
  // drawn as a muted pass — it is drawn as the open question it is.
  const icon =
    outcome.state === "passed"
      ? <ShieldCheck size={14} aria-hidden="true" />
      : outcome.state === "failed"
        ? <ShieldX size={14} aria-hidden="true" />
        : <CircleSlash size={14} aria-hidden="true" />;
  const word =
    outcome.state === "passed"
      ? "Passed"
      : outcome.state === "failed"
        ? "Failed"
        : "Not checked here";

  return (
    <li className={`attestation-check attestation-check--${outcome.state}`}>
      <span className="attestation-check__icon">{icon}</span>
      <div>
        <p className="attestation-check__label">
          {label} <span className="attestation-check__state">{word}</span>
        </p>
        {"detail" in outcome && outcome.detail && (
          <p className="attestation-check__detail">{outcome.detail}</p>
        )}
        {note && <p className="attestation-check__detail">{note}</p>}
      </div>
    </li>
  );
}

export function AttestationVerdict({ report }: { report: AttestationReport }) {
  if (report.contractError) {
    return (
      <div className="attestation attestation--contract-unreadable" role="status">
        <p className="attestation__headline">
          <AlertTriangle size={15} aria-hidden="true" />
          <span>The contract cannot be checked</span>
        </p>
        {/* Not phrased as a failed run: telling someone their query failed when
            the contract was never readable sends them to debug the wrong
            thing. */}
        <p className="attestation__detail">{contractErrorText(report.contractError)}</p>
      </div>
    );
  }

  const attestation = report.attestation;
  if (!attestation) return null;
  const established = report.verdict === "provenance-established";

  return (
    <div className={`attestation attestation--${report.verdict}`} role="status">
      <p className="attestation__headline">
        {established
          ? <ShieldCheck size={15} aria-hidden="true" />
          : <ShieldX size={15} aria-hidden="true" />}
        <span>
          {established
            ? "This run used the sanctioned computation"
            : "This run cannot be trusted"}
        </span>
      </p>

      {/* Stated on a pass as well as a failure. A reader who takes "provenance
          established" for "attested" has been told something Studio did not
          check, and the honest limit is short enough to always show. */}
      <p className="attestation__detail">
        {established
          ? "Studio compared what ran against what the bundle sanctions. It cannot confirm the reported number matches the run's own result — only the executor's runtime can do that."
          : "A check Studio can run said no. The reported number should not be presented as coming from the sanctioned computation."}
      </p>

      <ul className="attestation__checks">
        <CheckRow label="Provenance" outcome={attestation.provenance} />
        <CheckRow label="Fidelity" outcome={attestation.fidelity} />
      </ul>

      {attestation.missingReceiptFields.length > 0 && (
        <div className="attestation__missing">
          <p className="attestation__missing-label">
            Evidence the contract requires, and the receipt did not carry:
          </p>
          <ul>
            {attestation.missingReceiptFields.map((field) => (
              <li key={field}><code>{field}</code></li>
            ))}
          </ul>
        </div>
      )}

      {/* A stale definition can still attest cleanly, so this warns and does not
          change the verdict. */}
      {attestation.stale && (
        <p className="attestation__stale">
          <AlertTriangle size={13} aria-hidden="true" />
          <span>
            The definition is past its <code>stale_after</code> date. The run may be
            faithful to a computation nobody has rechecked.
          </span>
        </p>
      )}
    </div>
  );
}
