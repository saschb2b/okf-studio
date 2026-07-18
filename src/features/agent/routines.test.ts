import {
  attentionRuns,
  deterministicHealthRoutineInput,
  deterministicSourceRoutineInput,
} from "./routines.ts";
import type { OkfRoutineRun } from "./routines.ts";

describe("OKF routines", () => {
  it("creates a closed offline scope that cannot prompt, fetch, stage, or apply", () => {
    const input = deterministicHealthRoutineInput("C:/knowledge/docs", "Daily health", true);
    expect(input.scope).toEqual({
      bundleRoot: "C:/knowledge/docs",
      task: "health-rescan",
      agentId: null,
      modelId: null,
      toolIds: [],
      networkMode: "offline",
      sources: [],
      stagingAllowed: false,
    });
    expect(JSON.stringify(input)).not.toMatch(/prompt|apply|credential/u);
  });

  it("asks Rust to baseline one explicit bundle-relative source", () => {
    const input = deterministicSourceRoutineInput(
      "C:/knowledge/docs",
      "Watch export",
      false,
      "assets/export.json",
    );
    expect(input.scope.task).toBe("source-fingerprint-check");
    expect(input.scope.sources).toEqual([{
      relativePath: "assets/export.json",
      expectedSha256: "",
    }]);
  });

  it("keeps skipped, blocked, failed, and changed runs in the attention inbox", () => {
    const run = (outcome: OkfRoutineRun["outcome"]): OkfRoutineRun => ({
      schemaVersion: 1,
      id: `run-${outcome}`,
      routineId: "routine-health",
      routineName: "Daily health",
      bundleRoot: "C:/knowledge/docs",
      scheduledTimeMs: null,
      actualStartMs: 1,
      completedAtMs: 2,
      scopeFingerprint: "sha256-scope",
      outcome,
      recoveryState: "complete",
      reason: "Bounded reason.",
      nextAction: "Review",
    });
    expect(attentionRuns([
      run("healthy"),
      run("attention"),
      run("running"),
      run("failed"),
      run("blocked"),
      run("skipped"),
    ]).map((item) => item.outcome)).toEqual([
      "attention",
      "running",
      "failed",
      "blocked",
      "skipped",
    ]);
  });
});
