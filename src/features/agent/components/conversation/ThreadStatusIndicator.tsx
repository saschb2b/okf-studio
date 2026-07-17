import { Circle, CircleAlert, FileStack, LoaderCircle, ShieldQuestion } from "lucide-react";
import type { AgentThreadStatus } from "@/features/agent/threadStatus.ts";
import "./ThreadStatusIndicator.css";

const LABELS: Record<AgentThreadStatus, string> = {
  idle: "Idle",
  running: "Running",
  waiting: "Waiting for permission",
  failed: "Failed",
  staged: "Changes staged",
};

export function threadStatusLabel(status: AgentThreadStatus): string {
  return LABELS[status];
}

export function ThreadStatusIndicator({
  status,
  showLabel = false,
}: {
  status: AgentThreadStatus;
  showLabel?: boolean;
}) {
  const Icon = {
    idle: Circle,
    running: LoaderCircle,
    waiting: ShieldQuestion,
    failed: CircleAlert,
    staged: FileStack,
  }[status];
  const label = threadStatusLabel(status);
  return (
    <span className="agent-thread-status" data-status={status} aria-label={label} title={label}>
      <Icon size={13} aria-hidden="true" />
      {showLabel && <span>{label}</span>}
    </span>
  );
}
