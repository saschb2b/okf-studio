// The browser stand-in for `attest_computation_run`.
//
// Mirrors crates/okf-core/src/attest.rs closely on purpose. This is what the
// browser build and every component and integration test attest through, so a
// mock that passed runs the real engine would fail would make each of those
// tests a test of nothing — and this is a gate, where "looks like it works" is
// exactly the failure being guarded against.
//
// Two invariants are load-bearing and must not drift:
//   - `unavailable` is never `passed`; and
//   - a contract that cannot be read is a bundle defect, not a failed run.

import type {
  AttestationReport,
  AttestationVerdict,
  CheckOutcome,
  Concept,
  ComputationSource,
} from "@/shared/types.ts";
import { isStale } from "@/features/bundle/trust.ts";

/**
 * Shallow canonicalization, matching `attest::canonicalize`: line comments,
 * surrounding whitespace, and case. Deliberately not semantic — this is a
 * provenance check, so a rewrite that only reorders or renames still passes,
 * and claiming otherwise would overstate what the gate proves.
 */
export function canonicalize(computation: string): string {
  return computation
    .split("\n")
    .map((line) => line.replace(/--.*$/, "").trim())
    .filter((line) => line.length > 0)
    .join(" ")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

/** The receipt field carrying what actually ran, per the engine's rule. */
function executedField(receipt: Record<string, string>): [string, string] | null {
  const key = Object.keys(receipt)
    .sort()
    .find((name) => name === "executed" || name.endsWith("_sql"));
  return key ? [key, receipt[key]] : null;
}

/**
 * Whether the executed text matches the stored one once parameter placeholders
 * are treated as holes, mirroring `attest::matches_with_parameter_holes`.
 *
 * A bound parameter legitimately differs from its placeholder — that is the one
 * substitution an agent is *allowed* to make — so a stored computation with
 * holes is compared as a shape: split on each placeholder spelling a runtime
 * might use, then require the literal segments between them to appear in order.
 * Binding syntax belongs to the runtime, so this never tries to bind anything
 * itself.
 */
function matchesWithParameterHoles(
  stored: string,
  executed: string,
  parameters: { name: string }[],
): boolean {
  const placeholders: string[] = [];
  for (const parameter of parameters) {
    for (const spelling of [
      `@${parameter.name}`,
      `\${${parameter.name}}`,
      `$${parameter.name}`,
      `:${parameter.name}`,
      `{{${parameter.name}}}`,
      `{${parameter.name}}`,
    ]) {
      const canonical = canonicalize(spelling);
      if (stored.includes(canonical)) placeholders.push(canonical);
    }
  }
  if (placeholders.length === 0) return false;

  let segments = [stored];
  for (const placeholder of placeholders) {
    segments = segments.flatMap((segment) => segment.split(placeholder));
  }

  let cursor = 0;
  for (const segment of segments) {
    if (!segment) continue;
    const found = executed.indexOf(segment, cursor);
    if (found === -1) return false;
    cursor = found + segment.length;
  }
  return true;
}

function provenanceCheck(
  stored: string,
  receipt: Record<string, string>,
  parameters: { name: string }[],
): CheckOutcome {
  const found = executedField(receipt);
  if (!found) {
    return {
      state: "unavailable",
      detail: "The receipt carries no executed-computation field to compare.",
    };
  }
  const [field, executed] = found;
  if (!executed.trim()) {
    return { state: "unavailable", detail: `The receipt's ${field} is empty.` };
  }
  const storedShape = canonicalize(stored);
  const executedShape = canonicalize(executed);
  if (storedShape === executedShape) return { state: "passed" };
  if (
    parameters.length > 0 &&
    matchesWithParameterHoles(storedShape, executedShape, parameters)
  ) {
    return { state: "passed" };
  }
  return {
    state: "failed",
    detail:
      `The ${field} does not match the stored computation. ` +
      "An agent may supply parameter values and must not author the computation.",
  };
}

/**
 * The single fenced block under a `# Computation` heading, mirroring
 * `attest::inline_computation`. Scoped to that heading rather than the body's
 * first fence: a concept may show an example query in its prose, and attesting
 * against the wrong block is worse than finding none.
 */
export function inlineComputation(body: string): string | null {
  const lines = body.split("\n");
  let inSection = false;
  for (let i = 0; i < lines.length; i += 1) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith("#")) {
      inSection = trimmed.replace(/^#+/, "").trim().toLowerCase() === "computation";
      continue;
    }
    if (!inSection || !trimmed.startsWith("```")) continue;
    const collected: string[] = [];
    for (let j = i + 1; j < lines.length; j += 1) {
      if (lines[j].trim().startsWith("```")) return collected.join("\n");
      collected.push(lines[j]);
    }
    // An unterminated fence runs to the end of the body; taking it beats
    // discarding the computation over a missing close.
    return collected.join("\n");
  }
  return null;
}

export function mockAttestationFor(
  concept: Concept,
  storedText: string | null,
  storedPath: string | null,
  receipt: Record<string, string>,
  on: string,
): AttestationReport {
  const contract = concept.computation;
  const base = {
    conceptId: concept.id,
    conceptTitle: concept.title,
    runtime: null,
    source: null,
    attestation: null,
    verdict: "contract-unreadable" as AttestationVerdict,
  };
  if (!contract) return { ...base, contractError: { reason: "notAComputation" } };
  if (!contract.runtime) return { ...base, contractError: { reason: "missingRuntime" } };
  if (storedText === null) {
    return { ...base, contractError: { reason: "noComputation" } };
  }

  const source: ComputationSource = storedPath
    ? { kind: "file", path: storedPath, text: storedText }
    : { kind: "inline", text: storedText };

  const declared = contract.executor?.receipt ?? [];
  // Absent key or blank value, mirroring the engine's
  // `receipt.get(field).is_none_or(|value| value.trim().is_empty())`. Written
  // as an explicit presence check because `Record<string, string>` types a
  // missing key as `string`, so both `?.` and `??` read as redundant here even
  // though the value is `undefined` at runtime.
  const missingReceiptFields = declared.filter(
    (field) => !Object.hasOwn(receipt, field) || receipt[field].trim() === "",
  );
  const provenance = provenanceCheck(storedText, receipt, contract.parameters);
  // Never `passed`: only the executor's runtime can re-read the result by job
  // id. Saying "unavailable" is the difference between a gate and a rubber stamp.
  const fidelity: CheckOutcome = {
    state: "unavailable",
    detail:
      "Fidelity is checked by the executor's runtime, by re-reading the result by job id.",
  };

  return {
    conceptId: concept.id,
    conceptTitle: concept.title,
    runtime: contract.runtime,
    source,
    contractError: null,
    attestation: {
      missingReceiptFields,
      provenance,
      fidelity,
      // Always false, exactly as in the engine: fidelity is unavailable by
      // construction, so the spec's full bar is never met. `verdict` is what a
      // consumer renders.
      attested: false,
      stale: isStale(concept, on),
    },
    verdict:
      missingReceiptFields.length === 0 && provenance.state === "passed"
        ? "provenance-established"
        : "failed",
  };
}
