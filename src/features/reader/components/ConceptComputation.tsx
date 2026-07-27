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
// Running an attestation is not here. The engine exists in okf-core and has no
// caller yet; see issue #28.

import { FileCode2, Play, ShieldCheck } from "lucide-react";
import type { Concept } from "@/shared/types.ts";
import "@/shared/styles/chrome.css";
import "./ConceptComputation.css";

interface ConceptComputationProps {
  concept: Concept;
}

/** Whether this concept carries a computation contract worth showing. */
export function hasComputation(concept: Concept): boolean {
  return concept.computation !== null;
}

export function ConceptComputation({ concept }: ConceptComputationProps) {
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
          ? <p className="concept-computation__empty">None — the computation takes no inputs.</p>
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
          {inline
            ? <span>Inline, under the <code>#&nbsp;Computation</code> heading below.</span>
            // Named rather than inlined: reading it needs a door that currently
            // serves only renderable companion files, and widening that
            // allowlist is not something this panel should decide.
            : <span>Stored at <code>{contract.computation}</code>.</span>}
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
    </div>
  );
}
