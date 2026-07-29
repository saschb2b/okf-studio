// The webview end of the agent host's ordered event path.
//
// Rust publishes every agent event through one bus that stamps a host-wide
// monotonic sequence (src-tauri/src/agent/host/agent_events.rs). This is the
// other half: it unwraps the envelope, checks it at the boundary, and reports a
// gap or a malformed payload as a named diagnostic instead of letting it pass
// as ordinary quiet.
//
// A dropped event used to be indistinguishable from a host with nothing to say.
// Now the client can name the sequence it never saw, which is the difference
// between "the agent is thinking" and "we lost the message that said it
// finished".
//
// # Milestones
//
// A milestone says an asynchronous thing finished: a turn went quiet, an
// artifact finished validating, the staged tree settled. Both the Tauri path
// and the browser mock publish them, from the same classification, so a test
// waits on the same signal the real app does. See
// docs/architecture/agent-orchestration.md.

/** The envelope every agent event arrives in. */
export interface AgentEventEnvelope<T> {
  /** Monotonic across every agent channel, from one host-side counter. */
  sequence: number;
  channel: string;
  data: T;
}

export type MilestoneOutcome = "completed" | "failed" | "cancelled";

/** An asynchronous milestone the host reached. Mirrors `AgentMilestone` in Rust. */
export type AgentMilestone =
  | {
      kind: "turnQuiescent";
      connectionId: string;
      sessionId: string | null;
      outcome: MilestoneOutcome;
    }
  | { kind: "artifactValidated"; accepted: boolean }
  | {
      kind: "stageSettled";
      connectionId: string;
      sessionId: string | null;
      fileCount: number;
    }
  | { kind: "hostQuiescent" };

/** Something arrived that the boundary could not accept. */
export interface AgentEventDiagnostic {
  code: "malformed-envelope" | "sequence-gap";
  channel: string;
  reason: string;
  /** The sequence this was noticed at, when one was readable. */
  sequence?: number;
}

const milestoneHandlers = new Set<(milestone: AgentMilestone) => void>();
const diagnostics: AgentEventDiagnostic[] = [];
/** Highest sequence accepted so far. The host counts from 1. */
let lastSequence = 0;

/**
 * Diagnostics recorded this session, oldest first.
 *
 * Exposed rather than only logged so a test can assert that a malformed or
 * out-of-order event was *noticed*. A boundary check nothing can observe is a
 * boundary check nobody maintains.
 */
export function agentEventDiagnostics(): readonly AgentEventDiagnostic[] {
  return diagnostics;
}

/** Forget every diagnostic and the sequence position. For test setup. */
export function resetAgentEventBoundary(): void {
  diagnostics.length = 0;
  lastSequence = 0;
  milestoneHandlers.clear();
}

function record(diagnostic: AgentEventDiagnostic): void {
  diagnostics.push(diagnostic);
  console.error(
    `[agent-events] ${diagnostic.code} on ${diagnostic.channel}: ${diagnostic.reason}`,
  );
}

/**
 * Check one envelope and return its payload, or `null` when it cannot be used.
 *
 * The payload comes back as `unknown`: the boundary can prove an envelope is
 * well formed and in sequence, and it cannot prove the payload matches a
 * channel's type. Returning a claimed type here would be a cast wearing a
 * validator's clothes. The caller that knows the channel does the narrowing.
 *
 * A gap is reported and then accepted: the events after a lost one are still
 * the best state available, and refusing them would turn one dropped message
 * into a permanently frozen panel.
 */
export function acceptAgentEnvelope(channel: string, raw: unknown): unknown {
  if (typeof raw !== "object" || raw === null) {
    record({ code: "malformed-envelope", channel, reason: "payload was not an object" });
    return null;
  }
  const envelope = raw as Partial<AgentEventEnvelope<unknown>>;
  if (typeof envelope.sequence !== "number" || !Number.isFinite(envelope.sequence)) {
    record({ code: "malformed-envelope", channel, reason: "no usable sequence" });
    return null;
  }
  if (envelope.data === undefined) {
    record({
      code: "malformed-envelope",
      channel,
      reason: "envelope carried no data",
      sequence: envelope.sequence,
    });
    return null;
  }
  // Out-of-order delivery is not a gap: Tauri orders per channel, and two
  // channels interleaving is expected. Only a sequence beyond the next one
  // means something was lost.
  if (envelope.sequence > lastSequence + 1 && lastSequence > 0) {
    const missing = envelope.sequence - lastSequence - 1;
    record({
      code: "sequence-gap",
      channel,
      reason: `${missing} event${missing === 1 ? "" : "s"} never arrived before sequence ${envelope.sequence}`,
      sequence: envelope.sequence,
    });
  }
  if (envelope.sequence > lastSequence) lastSequence = envelope.sequence;
  return envelope.data;
}

/** Subscribe to milestones. Returns an unsubscribe. */
export function onAgentMilestone(handler: (milestone: AgentMilestone) => void): () => void {
  milestoneHandlers.add(handler);
  return () => milestoneHandlers.delete(handler);
}

/** Publish a milestone to every subscriber. */
export function emitAgentMilestone(milestone: AgentMilestone): void {
  for (const handler of [...milestoneHandlers]) handler(milestone);
}

/**
 * Resolve when a milestone matching `match` arrives.
 *
 * The reason this module exists. A test that waits for agent work by sleeping
 * passes on timing rather than on correctness: green on a fast machine, red in
 * CI, and nobody can reproduce either. This turns "the turn finished" into
 * something a test can await.
 *
 * The timeout is a failure report, not a synchronization mechanism. It exists
 * so a hung wait names what it was waiting for instead of stalling the suite.
 */
export function waitForAgentMilestone(
  match: (milestone: AgentMilestone) => boolean,
  { timeoutMs = 10_000, description = "a milestone" }: { timeoutMs?: number; description?: string } = {},
): Promise<AgentMilestone> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      unsubscribe();
      reject(new Error(`Timed out after ${timeoutMs}ms waiting for ${description}.`));
    }, timeoutMs);
    const unsubscribe = onAgentMilestone((milestone) => {
      if (!match(milestone)) return;
      clearTimeout(timer);
      unsubscribe();
      resolve(milestone);
    });
  });
}

/** Wait for a turn on `connectionId` to stop running, however it stopped. */
export function waitForTurnQuiescent(
  connectionId?: string,
  options?: { timeoutMs?: number },
): Promise<AgentMilestone> {
  return waitForAgentMilestone(
    (milestone) =>
      milestone.kind === "turnQuiescent" &&
      (connectionId === undefined || milestone.connectionId === connectionId),
    { ...options, description: `a turn to finish${connectionId ? ` on ${connectionId}` : ""}` },
  );
}

/**
 * The one place a turn event is classified as ending a turn.
 *
 * Mirrors `TurnLifecycle` in Rust, deliberately: the browser mock has to
 * publish the same milestones as the host, or a test that passes against the
 * mock proves nothing about the app. A cancelled turn arrives as a completion
 * carrying the stop reason rather than as its own kind.
 */
export function turnMilestoneFor(event: {
  connectionId: string;
  sessionId: string;
  update: { kind: string; stopReason?: string };
}): AgentMilestone | null {
  const { kind, stopReason } = event.update;
  if (kind !== "completed" && kind !== "failed") return null;
  const outcome: MilestoneOutcome =
    kind === "failed" ? "failed" : stopReason === "cancelled" ? "cancelled" : "completed";
  return {
    kind: "turnQuiescent",
    connectionId: event.connectionId,
    sessionId: event.sessionId,
    outcome,
  };
}
