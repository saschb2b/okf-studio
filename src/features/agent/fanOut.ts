// Running a plan: one isolated session per slice, in sequence, under a budget.
//
// Sequencing lives here rather than in Rust because that is where the isolated
// critic pass already lives, and a second orchestration model for the same
// shape would be worse than the one we have. Rust keeps the authority it has
// always kept: it decides whether a run may exist, what tools it gets, what its
// prompt says, and whether the result is valid. This decides only what happens
// next.
//
// Sequential, not concurrent. One turn per session is a host rule, so parallel
// runs need separate sessions, and separate sessions on one connection have not
// been shown to be safe under permission prompts and cancellation. Sequencing
// first makes the fan-out honest before it makes it fast. See
// docs/architecture/agent-orchestration.md.

import {
  assembleAgentRuns,
  newAgentSession,
  onAgentTurnUpdate,
  prepareAgentRun,
  promptAgentRun,
  validateAgentArtifact,
  type Assembly,
  type RunBudget,
  type RunOutcome,
  type RunResult,
  type Slice,
} from "@/shared/ipc.ts";
import { waitForTurnQuiescent } from "@/shared/agentEvents.ts";

/** What the caller watches while a fan-out runs. */
export interface RunProgress {
  sliceKey: string;
  state: "waiting" | "running" | "done";
  result?: RunResult;
}

export interface FanOutRequest {
  root: string;
  connectionId: string;
  slices: Slice[];
  fingerprint: string;
  capabilityId: string;
  artifactKind: string;
  budget: RunBudget;
  /** Called after every state change, so a surface can render as it goes. */
  onProgress?: (progress: RunProgress[]) => void;
  /** Set to stop before the next run starts. In-flight turns are left alone. */
  signal?: AbortSignal;
}

/**
 * Run every slice and assemble the results.
 *
 * Never throws for a run-level problem. A refusal, a failed turn, and a missing
 * artifact are all outcomes the assembly is designed to report, and turning any
 * of them into an exception would lose the runs that did work.
 */
export async function runFanOut(request: FanOutRequest): Promise<Assembly> {
  const { root, connectionId, slices, fingerprint, capabilityId, artifactKind, budget } = request;
  const progress: RunProgress[] = slices.map((slice) => ({
    sliceKey: slice.key,
    state: "waiting",
  }));
  const outcomes: RunOutcome[] = [];
  const report = () => request.onProgress?.(progress.map((entry) => ({ ...entry })));
  report();

  for (const [index, slice] of slices.entries()) {
    // Cancelling stops the next run rather than the current one. A slice that
    // never started is reported by the assembly as never having reported,
    // which is exactly what happened.
    if (request.signal?.aborted) break;

    progress[index].state = "running";
    report();
    const runId = `run-${index + 1}-${slice.key || "root"}`;
    const outcome = await runOneSlice({
      root,
      connectionId,
      slice,
      fingerprint,
      capabilityId,
      artifactKind,
      budget,
      runId,
    });
    outcomes.push(outcome);
    progress[index] = { sliceKey: slice.key, state: "done", result: outcome.result };
    report();
  }

  return assembleAgentRuns(
    root,
    outcomes,
    slices.map((slice) => slice.key),
  );
}

async function runOneSlice(input: {
  root: string;
  connectionId: string;
  slice: Slice;
  fingerprint: string;
  capabilityId: string;
  artifactKind: string;
  budget: RunBudget;
  runId: string;
}): Promise<RunOutcome> {
  const { root, connectionId, slice, fingerprint, runId } = input;
  const base = { runId, sliceKey: slice.key, sliceFingerprint: fingerprint };

  const prepared = await prepareAgentRun(
    root,
    {
      sliceKey: slice.key,
      conceptIds: slice.conceptIds,
      sliceFingerprint: fingerprint,
      capabilityId: input.capabilityId,
      artifactKind: input.artifactKind,
      budget: input.budget,
    },
    runId,
  );
  if (!prepared.ok) {
    // A refusal is a fact about the request, so it is reported as this run's
    // result rather than aborting the fan-out around it.
    return { ...base, result: { status: "failed", message: refusalMessage(prepared.refusal) } };
  }

  try {
    const session = await newAgentSession(connectionId, root);
    if (session.stagedChanges?.granted === true) {
      // Rust refuses this too. Checking here as well means the fan-out fails
      // closed even if a future path forgets to.
      return {
        ...base,
        result: { status: "failed", message: "The run session unexpectedly carried a write grant." },
      };
    }

    // Both subscriptions are made before the prompt. A turn can finish between
    // sending and waiting, so a milestone subscribed afterwards would hang, and
    // text chunks can arrive before the prompt call resolves, so they are
    // buffered by turn id rather than filtered against one we do not have yet.
    const said = new Map<string, string>();
    const stopListening = await onAgentTurnUpdate((event) => {
      if (event.update.kind !== "text") return;
      said.set(event.turnId, (said.get(event.turnId) ?? "") + event.update.text);
    });
    let milestone;
    let turn;
    try {
      const quiet = waitForTurnQuiescent(connectionId);
      turn = await promptAgentRun(
        connectionId,
        session.sessionId,
        prepared.prepared.prompt,
        prepared.prepared.run.conceptIds,
      );
      milestone = await quiet;
    } finally {
      stopListening();
    }
    if (milestone.kind === "turnQuiescent" && milestone.outcome !== "completed") {
      return {
        ...base,
        result: { status: "failed", message: `The run turn ${milestone.outcome}.` },
      };
    }

    const response = said.get(turn.turnId) ?? "";
    const validation = await validateAgentArtifact(root, response);
    if (validation.status !== "ready") {
      return {
        ...base,
        result: {
          status: "completedWithoutArtifact",
          reason:
            validation.status === "none"
              ? "the response carried no artifact fence"
              : validation.message,
        },
      };
    }
    return {
      ...base,
      result: {
        status: "completed",
        artifactKind: input.artifactKind,
        itemCount: slice.conceptIds.length,
      },
    };
  } catch (error: unknown) {
    return {
      ...base,
      result: {
        status: "failed",
        message: error instanceof Error ? error.message : "The run could not be started.",
      },
    };
  }
}

/** A refusal rendered for a reader, keeping the reason Rust gave. */
function refusalMessage(refusal: { reason: string; [field: string]: unknown }): string {
  switch (refusal.reason) {
    case "unbudgeted":
      return "The run had no measurable budget.";
    case "emptySlice":
      return "The slice held no concepts.";
    case "nestedDelegation":
      return "A run cannot start another run.";
    case "sliceIsStale":
      return "The bundle changed after this slice was planned.";
    case "capabilityWrites":
    case "capabilityRequiresWriteTool":
      return "That capability can write, and a run may not.";
    default:
      return `The run was refused: ${refusal.reason}.`;
  }
}
