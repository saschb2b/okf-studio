import type { LogEntry } from "@/shared/types.ts";

export type ChangeLogKind = "creation" | "update" | "fix" | "deprecation";

export function newestLogEntries(log: LogEntry[]): LogEntry[] {
  return [...log].sort((a, b) => b.date.localeCompare(a.date));
}

export function changeLogKind(entry: string): ChangeLogKind | undefined {
  const match = /^\*\*(Creation|Update|Fix|Deprecation)/.exec(entry.trim());
  return match?.[1].toLowerCase() as ChangeLogKind | undefined;
}

export function changeLogBody(entry: string): string {
  return entry.trim().replace(
    /^\*\*(?:Creation|Update|Fix|Deprecation)[^*]*\*\*:?\s*/,
    "",
  );
}
