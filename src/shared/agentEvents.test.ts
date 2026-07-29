import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  acceptAgentEnvelope,
  agentEventDiagnostics,
  emitAgentMilestone,
  onAgentMilestone,
  resetAgentEventBoundary,
  turnMilestoneFor,
  waitForAgentMilestone,
  waitForTurnQuiescent,
} from "./agentEvents.ts";

const envelope = (sequence: number, data: unknown = { state: "running" }) => ({
  sequence,
  channel: "agent-turn-update",
  data,
});

describe("the agent event boundary", () => {
  beforeEach(() => {
    resetAgentEventBoundary();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("returns the payload and records nothing for a well-formed run", () => {
    for (let sequence = 1; sequence <= 5; sequence += 1) {
      expect(acceptAgentEnvelope("agent-turn-update", envelope(sequence))).toEqual({
        state: "running",
      });
    }
    expect(agentEventDiagnostics()).toHaveLength(0);
  });

  it("names how many events were lost when the sequence jumps", () => {
    acceptAgentEnvelope("agent-turn-update", envelope(1));
    acceptAgentEnvelope("agent-turn-update", envelope(5));
    const [diagnostic] = agentEventDiagnostics();
    expect(diagnostic.code).toBe("sequence-gap");
    expect(diagnostic.sequence).toBe(5);
    expect(diagnostic.reason).toContain("3 events");
  });

  it("keeps delivering after a gap", () => {
    // A dropped message must not freeze the panel: the events after it are
    // still the best state available.
    acceptAgentEnvelope("agent-turn-update", envelope(1));
    expect(acceptAgentEnvelope("agent-turn-update", envelope(9))).toEqual({ state: "running" });
    expect(acceptAgentEnvelope("agent-turn-update", envelope(10))).toEqual({ state: "running" });
    expect(agentEventDiagnostics()).toHaveLength(1);
  });

  it("treats interleaved channels as ordering, not loss", () => {
    // Two channels advancing the shared counter is the normal case, and
    // reporting it would make the diagnostic worthless.
    acceptAgentEnvelope("agent-turn-update", envelope(1));
    acceptAgentEnvelope("agent-stage-update", { ...envelope(2), channel: "agent-stage-update" });
    acceptAgentEnvelope("agent-turn-update", envelope(3));
    expect(agentEventDiagnostics()).toHaveLength(0);
  });

  it("does not report a gap before the first event it ever sees", () => {
    // The webview can subscribe after the host has already published, so the
    // first sequence is a starting point rather than evidence of loss.
    expect(acceptAgentEnvelope("agent-turn-update", envelope(412))).not.toBeNull();
    expect(agentEventDiagnostics()).toHaveLength(0);
  });

  it.each([
    ["a non-object payload", "not an envelope"],
    ["a missing sequence", { channel: "agent-turn-update", data: {} }],
    ["an unusable sequence", { sequence: Number.NaN, channel: "agent-turn-update", data: {} }],
    ["no data", { sequence: 1, channel: "agent-turn-update" }],
  ])("rejects and reports %s", (_label, payload) => {
    expect(acceptAgentEnvelope("agent-turn-update", payload)).toBeNull();
    expect(agentEventDiagnostics()[0].code).toBe("malformed-envelope");
  });
});

describe("turn milestone classification", () => {
  const event = (kind: string, stopReason?: string) => ({
    connectionId: "connection-1",
    sessionId: "session-1",
    update: { kind, stopReason },
  });

  it("says nothing mid-turn", () => {
    expect(turnMilestoneFor(event("text"))).toBeNull();
    expect(turnMilestoneFor(event("tool-call"))).toBeNull();
    expect(turnMilestoneFor(event("usage"))).toBeNull();
  });

  it("reads a cancellation from the stop reason, not the shape", () => {
    // A cancelled turn arrives as a completion carrying the ACP stop reason.
    expect(turnMilestoneFor(event("completed", "cancelled"))).toMatchObject({
      kind: "turnQuiescent",
      outcome: "cancelled",
    });
    expect(turnMilestoneFor(event("completed", "end_turn"))).toMatchObject({
      outcome: "completed",
    });
    expect(turnMilestoneFor(event("failed"))).toMatchObject({ outcome: "failed" });
  });
});

describe("waiting on a milestone", () => {
  beforeEach(() => {
    resetAgentEventBoundary();
  });

  it("resolves with the milestone that matched", async () => {
    const waiting = waitForTurnQuiescent("connection-1");
    emitAgentMilestone({ kind: "hostQuiescent" });
    emitAgentMilestone({
      kind: "turnQuiescent",
      connectionId: "connection-2",
      sessionId: null,
      outcome: "completed",
    });
    emitAgentMilestone({
      kind: "turnQuiescent",
      connectionId: "connection-1",
      sessionId: "session-1",
      outcome: "failed",
    });
    await expect(waiting).resolves.toMatchObject({
      connectionId: "connection-1",
      outcome: "failed",
    });
  });

  it("stops listening once it has resolved", async () => {
    const waiting = waitForAgentMilestone((milestone) => milestone.kind === "hostQuiescent", {
      timeoutMs: 1_000,
    });
    emitAgentMilestone({ kind: "hostQuiescent" });
    await waiting;
    // A leaked subscription would keep the promise's timer alive and fire its
    // callback for every later milestone.
    expect(() => emitAgentMilestone({ kind: "hostQuiescent" })).not.toThrow();
  });

  it("reports what it was waiting for when it times out", async () => {
    await expect(
      waitForTurnQuiescent("connection-9", { timeoutMs: 10 }),
    ).rejects.toThrow(/waiting for a turn to finish on connection-9/);
  });

  it("delivers to every subscriber", () => {
    const seen: string[] = [];
    const stopA = onAgentMilestone((milestone) => seen.push(`a:${milestone.kind}`));
    const stopB = onAgentMilestone((milestone) => seen.push(`b:${milestone.kind}`));
    emitAgentMilestone({ kind: "hostQuiescent" });
    stopA();
    emitAgentMilestone({ kind: "hostQuiescent" });
    stopB();
    expect(seen).toEqual(["a:hostQuiescent", "b:hostQuiescent", "b:hostQuiescent"]);
  });
});
