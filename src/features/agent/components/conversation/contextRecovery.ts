import type { AgentAvailableCommandInfo } from "@/features/agent/connection.ts";
import type { AgentUsage, ConversationItem, ConversationMessage } from "./types.ts";

export type ContextPressureLevel = "normal" | "approaching" | "critical";

export interface ContextPressureState {
  level: ContextPressureLevel;
  percent: number | null;
}

export function contextPressureState(usage: AgentUsage | null): ContextPressureState {
  if (!usage || usage.contextWindowTokens <= 0) return { level: "normal", percent: null };
  const percent = Math.min(
    100,
    Math.max(0, Math.round((usage.usedTokens / usage.contextWindowTokens) * 100)),
  );
  return {
    percent,
    level: percent >= 90 ? "critical" : percent >= 75 ? "approaching" : "normal",
  };
}

const RECOVERY_COMMAND_NAMES = ["compact", "summarize", "summary"] as const;

export function findContextRecoveryCommand(
  commands: readonly AgentAvailableCommandInfo[],
): AgentAvailableCommandInfo | null {
  for (const name of RECOVERY_COMMAND_NAMES) {
    const command = commands.find((candidate) => candidate.name.toLowerCase() === name);
    if (command) return command;
  }
  return null;
}

function quoteMarkdown(text: string): string {
  return text.split("\n").map((line) => line ? `> ${line}` : ">").join("\n");
}

const MAX_CARRIED_CONTEXT_CHARS = 16 * 1024;

export function freshThreadContextDraft(
  threadTitle: string,
  bundleName: string | null,
  messages: readonly ConversationItem[],
): string {
  const conversation = messages.filter(
    (item): item is ConversationMessage => item.role === "user" || item.role === "agent",
  ).filter((message) => message.text.trim().length > 0).slice(-4);
  const blocks = conversation.map((message) => {
    if (message.role === "user") return `## You\n\n${quoteMarkdown(message.text)}`;
    const heading = message.contextSummary ? "## Agent context summary" : "## Agent";
    return `${heading}\n\n${message.text}`;
  });
  const header = [
    "Continue this work in a fresh agent thread.",
    "",
    "Review the carried conversation text below before sending. It carries no files, sources, permissions, write grants, staged changes, or claim that the previous agent state was rewound.",
    "",
    `Previous thread: ${threadTitle}`,
    `Bundle: ${bundleName ?? "Active OKF bundle"}`,
  ].join("\n");
  const full = blocks.length > 0 ? `${header}\n\n${blocks.join("\n\n")}` : header;
  if (full.length <= MAX_CARRIED_CONTEXT_CHARS) return full;
  const marker = "\n\n> Earlier carried text was omitted to fit the draft limit.\n\n";
  const tailBudget = MAX_CARRIED_CONTEXT_CHARS - header.length - marker.length;
  return `${header}${marker}${full.slice(-Math.max(0, tailBudget))}`;
}

export function markContextSummary(
  items: readonly ConversationItem[],
  turnId: string,
  commandName: string,
): ConversationItem[] {
  return items.map((item) =>
    item.role === "agent" && item.turnId === turnId
      ? { ...item, contextSummary: { commandName } }
      : item,
  );
}
