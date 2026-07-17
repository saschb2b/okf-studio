export type AgentThreadStatus = "idle" | "running" | "waiting" | "failed" | "staged";

const STATUS_PRIORITY: Record<AgentThreadStatus, number> = {
  idle: 0,
  staged: 1,
  failed: 2,
  running: 3,
  waiting: 4,
};

export function aggregateThreadStatus(
  statuses: readonly AgentThreadStatus[],
): AgentThreadStatus {
  return statuses.reduce<AgentThreadStatus>(
    (highest, status) => STATUS_PRIORITY[status] > STATUS_PRIORITY[highest] ? status : highest,
    "idle",
  );
}

export function threadAttentionTransition(
  previous: AgentThreadStatus,
  next: AgentThreadStatus,
): "completed" | "failed" | "waiting" | null {
  if (previous === next) return null;
  if (next === "waiting") return "waiting";
  if (next === "failed") return "failed";
  if (previous === "running" && (next === "idle" || next === "staged")) return "completed";
  return null;
}
