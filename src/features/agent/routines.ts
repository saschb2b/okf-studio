export type OkfRoutineTask = "health-rescan" | "source-fingerprint-check";
export type OkfRoutineTriggerMode = "manual" | "scheduled";
export type OkfRoutineOutcome = "running" | "healthy" | "attention" | "failed" | "blocked" | "skipped";

export interface OkfRoutineSource {
  relativePath: string;
  expectedSha256: string;
}

export interface OkfRoutineScope {
  bundleRoot: string;
  task: OkfRoutineTask;
  agentId: string | null;
  modelId: string | null;
  toolIds: string[];
  networkMode: "offline";
  sources: OkfRoutineSource[];
  stagingAllowed: false;
}

export interface OkfRoutineTrigger {
  mode: OkfRoutineTriggerMode;
  intervalMinutes: number | null;
  catchUpAfterDowntime: boolean;
}

export interface OkfRoutineDefinition {
  schemaVersion: 1;
  id: string;
  name: string;
  enabled: boolean;
  trigger: OkfRoutineTrigger;
  scope: OkfRoutineScope;
  timeoutSeconds: number;
  nextRunAtMs: number | null;
  createdAtMs: number;
  updatedAtMs: number;
}

export interface SaveOkfRoutineInput {
  id: string | null;
  name: string;
  enabled: boolean;
  trigger: OkfRoutineTrigger;
  scope: OkfRoutineScope;
  timeoutSeconds: number;
}

export interface OkfRoutineRun {
  schemaVersion: 1;
  id: string;
  routineId: string;
  routineName: string;
  bundleRoot: string;
  scheduledTimeMs: number | null;
  actualStartMs: number;
  completedAtMs: number;
  scopeFingerprint: string;
  outcome: OkfRoutineOutcome;
  recoveryState: string;
  reason: string;
  nextAction: string;
}

export interface OkfRoutineWorkspace {
  schemaVersion: 1;
  routines: OkfRoutineDefinition[];
  runs: OkfRoutineRun[];
}

export function deterministicHealthRoutineInput(
  bundleRoot: string,
  name: string,
  scheduled: boolean,
): SaveOkfRoutineInput {
  return {
    id: null,
    name: name.trim(),
    enabled: true,
    trigger: {
      mode: scheduled ? "scheduled" : "manual",
      intervalMinutes: scheduled ? 1_440 : null,
      catchUpAfterDowntime: false,
    },
    scope: {
      bundleRoot,
      task: "health-rescan",
      agentId: null,
      modelId: null,
      toolIds: [],
      networkMode: "offline",
      sources: [],
      stagingAllowed: false,
    },
    timeoutSeconds: 30,
  };
}

export function deterministicSourceRoutineInput(
  bundleRoot: string,
  name: string,
  scheduled: boolean,
  relativePath: string,
): SaveOkfRoutineInput {
  const input = deterministicHealthRoutineInput(bundleRoot, name, scheduled);
  return {
    ...input,
    scope: {
      ...input.scope,
      task: "source-fingerprint-check",
      sources: [{ relativePath: relativePath.trim(), expectedSha256: "" }],
    },
  };
}

export function attentionRuns(runs: readonly OkfRoutineRun[]): OkfRoutineRun[] {
  return runs.filter((run) => run.outcome !== "healthy");
}
