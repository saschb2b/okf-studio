import { isTauri } from "@/shared/ipc.ts";

export type AgentThreadNotificationKind = "completed" | "failed" | "waiting";

const THREAD_TITLE_LIMIT = 80;
const AGENT_NAME_LIMIT = 64;

function boundedLabel(value: string, fallback: string, limit: number): string {
  const controlFree = Array.from(value, (character) => {
    const code = character.charCodeAt(0);
    return code <= 31 || code === 127 ? " " : character;
  }).join("");
  const normalized = controlFree
    .replace(/\s+/gu, " ")
    .trim();
  return (normalized || fallback).slice(0, limit);
}

export function agentThreadNotificationCopy(input: {
  kind: AgentThreadNotificationKind;
  threadTitle: string;
  agentName: string;
}): { title: string; body: string } {
  const title = {
    completed: "Agent thread finished",
    failed: "Agent thread failed",
    waiting: "Agent thread needs permission",
  }[input.kind];
  const thread = boundedLabel(input.threadTitle, "Untitled thread", THREAD_TITLE_LIMIT);
  const agent = boundedLabel(input.agentName, "Agent", AGENT_NAME_LIMIT);
  return { title, body: `${thread} · ${agent}` };
}

export function routineAttentionNotificationCopy(count: number): { title: string; body: string } {
  const boundedCount = Math.max(1, Math.min(32, Math.floor(count)));
  return {
    title: "OKF routines need attention",
    body: `Open OKF Studio to review ${boundedCount} routine result${boundedCount === 1 ? "" : "s"}.`,
  };
}

export async function requestAgentNotificationPermission(): Promise<boolean> {
  if (!isTauri()) return true;
  const { isPermissionGranted, requestPermission } = await import(
    "@tauri-apps/plugin-notification"
  );
  if (await isPermissionGranted()) return true;
  return (await requestPermission()) === "granted";
}

function notificationSound(): string | undefined {
  if (navigator.userAgent.includes("Mac")) return "Ping";
  if (navigator.userAgent.includes("Linux")) return "message-new-instant";
  // Windows requires a bundled .wav path for an explicit sound. Leaving this
  // unset lets the user's OS notification category decide presentation.
  return undefined;
}

export async function sendAgentThreadNotification(input: {
  kind: AgentThreadNotificationKind;
  threadTitle: string;
  agentName: string;
  sound: boolean;
}): Promise<boolean> {
  if (!isTauri() || document.hasFocus()) return false;
  const { isPermissionGranted, sendNotification } = await import(
    "@tauri-apps/plugin-notification"
  );
  if (!(await isPermissionGranted())) return false;
  const copy = agentThreadNotificationCopy(input);
  sendNotification({
    ...copy,
    group: "agent-threads",
    silent: !input.sound,
    ...(input.sound && notificationSound() ? { sound: notificationSound() } : {}),
  });
  return true;
}

export async function sendRoutineAttentionNotification(input: {
  count: number;
  sound: boolean;
}): Promise<boolean> {
  if (!isTauri() || document.hasFocus()) return false;
  const { isPermissionGranted, sendNotification } = await import(
    "@tauri-apps/plugin-notification"
  );
  if (!(await isPermissionGranted())) return false;
  sendNotification({
    ...routineAttentionNotificationCopy(input.count),
    group: "okf-routines",
    silent: !input.sound,
    ...(input.sound && notificationSound() ? { sound: notificationSound() } : {}),
  });
  return true;
}
