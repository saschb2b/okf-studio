// The contract of an OKF v0.2 Attested Computation, in the Reader's rail.
//
// The type exists so a consumer can check that a reported number came from the
// sanctioned computation rather than from an agent writing plausible SQL. This
// panel shows the contract that makes the check possible: how it runs, which
// holes an agent may fill, what evidence a run must return, and what turns that
// evidence into a verdict.
//
// Promoting `runtime`, `parameters`, `computation`, `executor` and `attester` to
// spec fields moved them out of `extra`, and the metadata inspector renders
// `extra` — so without this panel these concepts showed *less* than before v0.2
// support landed. This closes that.
//
// Checking a run against this contract is the button at the foot of the panel.
// That is a tool for someone who already holds a receipt, not a gate — Studio
// does not run computations, so a receipt is produced elsewhere. The gate
// belongs where a number is actually asserted, which is the agent panel.

import { FileCode2, Play, ShieldCheck } from "lucide-react";
import { useState } from "react";
import type { Concept } from "@/shared/types.ts";
import { AttestRunDialog } from "@/features/bundle/components/AttestRunDialog.tsx";
import "@/shared/styles/chrome.css";
import "./ConceptComputation.css";

interface ConceptComputationProps {
  concept: Concept;
  /** Absent in stories that render the contract alone; the check needs a
   *  bundle to read the sanctioned computation back out of. */
  bundleRoot?: string;
}

/** Whether this concept carries a computation contract worth showing. */
export function hasComputation(concept: Concept): boolean {
  return concept.computation !== null;
}

export function ConceptComputation({ concept, bundleRoot }: ConceptComputationProps) {
  const [attesting, setAttesting] = useState(false);
  const contract = concept.computation;
  if (!contract) return null;

  // Exactly one of the two forms should be present; the validator reports a
  // concept that supplies both or neither, so the panel just describes what it
  // finds rather than repeating that judgement.
  const inline = contract.computation === null;
  const receipt = contract.executor?.receipt ?? [];

  return (
    <div className="concept-computation">
      <p className="concept-computation__runtime">
        <Play size={14} aria-hidden="true" />
        <span>
          Runs on <code>{contract.runtime || "an undeclared runtime"}</code>
        </span>
      </p>

      {/* The line that makes the type worth anything, stated where a reader
          weighing the contract will see it. */}
      <p className="concept-computation__rule">
        An agent may supply values for the parameters below. It must not author or
        edit the computation.
      </p>

      <div className="concept-computation__section">
        <h4>Parameters</h4>
        {contract.parameters.length === 0
          ? <p className="concept-computation__empty">None. The computation takes no inputs.</p>
          : (
            <ul className="concept-computation__parameters">
              {contract.parameters.map((parameter) => (
                <li key={parameter.name}>
                  <code>{parameter.name}</code>
                  {parameter.type && <span className="concept-computation__type">{parameter.type}</span>}
                  {parameter.required && (
                    <span className="concept-computation__required">required</span>
                  )}
                </li>
              ))}
            </ul>
          )}
      </div>

      <div className="concept-computation__section">
        <h4>Computation</h4>
        <p className="concept-computation__where">
          <FileCode2 size={13} aria-hidden="true" />
          {/* Both forms land under the same heading in the reading column, so a
              reader never has to care which one the producer chose. The path is
              still named here, because "which file runs" is part of the
              contract even once its text is on screen. */}
          {inline
            ? <span>Inline, under the <code>#&nbsp;Computation</code> heading below.</span>
            : (
              <span>
                Stored at <code>{contract.computation}</code>, shown under the{" "}
                <code>#&nbsp;Computation</code> heading below.
              </span>
            )}
        </p>
      </div>

      <div className="concept-computation__section">
        <h4>Evidence a run must return</h4>
        {receipt.length === 0
          ? (
            <p className="concept-computation__empty">
              None declared, so a run returns nothing for an attester to inspect.
            </p>
          )
          : (
            <ul className="concept-computation__receipt">
              {receipt.map((field) => <li key={field}><code>{field}</code></li>)}
            </ul>
          )}
        {contract.executor?.resource && (
          <p className="concept-computation__where">
            Run instructions: <code>{contract.executor.resource}</code>
          </p>
        )}
      </div>

      <div className="concept-computation__section">
        <h4>Attester</h4>
        <p className="concept-computation__where">
          <ShieldCheck size={13} aria-hidden="true" />
          {contract.attester?.resource
            ? <span>Checked by <code>{contract.attester.resource}</code>, deterministic code and never a model.</span>
            : <span className="concept-computation__empty">None declared, so nothing turns a receipt into a verdict.</span>}
        </p>
      </div>

      {bundleRoot && (
        <>
          <button
            type="button"
            className="btn concept-computation__check"
            onClick={() => setAttesting(true)}
          >
            Check a run…
          </button>
          <AttestRunDialog
            open={attesting}
            onOpenChange={setAttesting}
            bundleRoot={bundleRoot}
            concept={concept}
          />
        </>
      )}
    </div>
  );
}
