const MAX_DERIVED_TITLE_CHARS = 64;

export interface ThreadStarterTitle {
  title: string;
  prompt: string;
}

export interface ThreadTranscriptMessage {
  role: "user" | "agent" | "status";
  text: string;
  contextSummary?: { commandName: string };
}

export interface ThreadTranscriptPlanEntry {
  content: string;
  status: "pending" | "in-progress" | "completed" | "unknown";
}

export interface ThreadTranscriptPlan {
  role: "plan";
  entries: readonly ThreadTranscriptPlanEntry[];
}

export interface ThreadTranscriptTool {
  role: "tool";
  title: string;
  status: "pending" | "in-progress" | "completed" | "failed" | "cancelled" | "unknown";
}

export type ThreadTranscriptItem =
  | ThreadTranscriptMessage
  | ThreadTranscriptPlan
  | ThreadTranscriptTool;

export type ResearchExportRequirement = "sources" | "inferences";
export type DatasetChangeRequirement = "change-plan" | "affected-concepts";

function sectionBody(markdown: string, title: string): string | null {
  const heading = new RegExp(`^#{1,6}\\s+${title}\\s*$`, "imu");
  const match = heading.exec(markdown);
  if (!match) return null;
  const afterHeading = markdown.slice(match.index + match[0].length);
  const nextHeading = /^#{1,6}\s+\S.*$/mu.exec(afterHeading);
  return (nextHeading ? afterHeading.slice(0, nextHeading.index) : afterHeading).trim();
}

function hasBundleMarkdownPath(line: string): boolean {
  const candidates = line.matchAll(
    /(?:^|[\s`(])((?:\/|\.\/)?[\w./-]+\.md(?:#[^\s`)]*)?)/gu,
  );
  return [...candidates].some((candidate) => {
    const path = candidate[1].split("#", 1)[0]?.replace(/^\.?\//u, "");
    if (!path || path.includes(":") || path.includes("\\")) return false;
    return path.split("/").every((segment) => segment !== "" && segment !== "." && segment !== "..");
  });
}

export function researchExportRequirements(
  messages: readonly ThreadTranscriptItem[],
): ResearchExportRequirement[] {
  const responses = messages.flatMap((message) =>
    message.role === "agent" ? [message.text] : []
  );
  const hasSources = responses.some((response) => {
    const body = sectionBody(response, "Sources");
    if (body === null) return false;
    return body.split("\n").some((line) =>
      /^\s*[-*+]\s+\S/u.test(line) &&
      (/\[[^\r\n]+\]\([^\r\n)]+\)/u.test(line) || /https?:\/\/\S+/u.test(line) ||
        /(?:^|[\s`])(?:\.?\.?\/)?[\w./-]+\.md(?:#[^\s`]*)?/u.test(line))
    );
  });
  const hasInferences = responses.some((response) => {
    const body = sectionBody(response, "Inferences");
    return body !== null && body.length > 0;
  });
  const requirements: ResearchExportRequirement[] = [];
  if (!hasSources) requirements.push("sources");
  if (!hasInferences) requirements.push("inferences");
  return requirements;
}

export function datasetChangeRequirements(
  messages: readonly ThreadTranscriptItem[],
): DatasetChangeRequirement[] {
  const responses = messages.flatMap((message) =>
    message.role === "agent" ? [message.text] : []
  );
  const hasChangePlan = responses.some((response) => {
    const body = sectionBody(response, "Change Plan");
    return body?.split("\n").some((line) =>
      /^\s*(?:[-*+]\s+(?:\[[ xX]\]\s+)?|\d+[.)]\s+)\S/u.test(line)
    ) ?? false;
  });
  const hasAffectedConcepts = responses.some((response) => {
    const body = sectionBody(response, "Affected Concepts");
    return body?.split("\n").some((line) =>
      /^\s*[-*+]\s+\S/u.test(line) && hasBundleMarkdownPath(line)
    ) ?? false;
  });
  const requirements: DatasetChangeRequirement[] = [];
  if (!hasChangePlan) requirements.push("change-plan");
  if (!hasAffectedConcepts) requirements.push("affected-concepts");
  return requirements;
}

function plainTitleText(text: string): string {
  return text
    .replace(/\[([^\]]+)]\([^)]+\)/g, "$1")
    .replace(/[`*_#>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function truncateTitle(text: string, limit: number): string {
  if (text.length <= limit) return text;
  const contentLimit = Math.max(1, limit - 1);
  const slice = text.slice(0, contentLimit + 1);
  const wordBoundary = slice.lastIndexOf(" ");
  const end = wordBoundary >= Math.floor(contentLimit * 0.6) ? wordBoundary : contentLimit;
  return `${slice.slice(0, end).trimEnd()}…`;
}

export function deriveThreadTitle(
  prompt: string,
  starters: readonly ThreadStarterTitle[],
): string {
  const starter = starters.find(({ prompt: starterPrompt }) => prompt.startsWith(starterPrompt));
  let candidate = plainTitleText(prompt);
  if (starter) {
    const suffix = plainTitleText(prompt.slice(starter.prompt.length));
    candidate = suffix ? `${starter.title}: ${suffix}` : starter.title;
  }
  return truncateTitle(candidate || "New thread", MAX_DERIVED_TITLE_CHARS);
}

export function transcriptFilename(threadTitle: string): string {
  const slug = (threadTitle
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "agent")
    .slice(0, 100)
    .replace(/-+$/g, "");
  return `${slug || "agent"}-thread.md`;
}

function quoteMarkdown(text: string): string {
  return text
    .split("\n")
    .map((line) => line.length > 0 ? `> ${line}` : ">")
    .join("\n");
}

// Mirrors the Rust per-source cap (MAX_SOURCE_CONTENT_CHARS). UTF-16 length is
// counted here, which never undercounts the Unicode scalars Rust checks.
export const MAX_THREAD_SOURCE_CHARS = 262_144;
const THREAD_SOURCE_OMISSION =
  "> Earlier messages were omitted to fit the source limit.";

export interface PreviousThreadMessage {
  role: "user" | "agent";
  text: string;
}

export interface PreviousThreadSourceContent {
  content: string;
  truncated: boolean;
}

/**
 * Format a bounded ACP session replay as one Markdown source body. The replay
 * can exceed the per-source cap, so the newest messages win: older blocks are
 * dropped whole (or the lone newest block keeps its tail) and an omission
 * marker records the cut for the agent. Returns null when no message carries
 * replayable text.
 */
export function previousThreadSource(
  messages: readonly PreviousThreadMessage[],
  limit = MAX_THREAD_SOURCE_CHARS,
): PreviousThreadSourceContent | null {
  const blocks = messages
    .filter((message) => message.text.trim().length > 0)
    .map((message) => message.role === "user"
      ? `## You\n\n${quoteMarkdown(message.text)}`
      : `## Agent\n\n${message.text}`);
  if (blocks.length === 0) return null;

  const total = blocks.reduce(
    (sum, block, index) => sum + block.length + (index > 0 ? 2 : 0),
    0,
  );
  if (total <= limit) return { content: blocks.join("\n\n"), truncated: false };

  // Reserve the marker's space, then keep whole blocks newest-first.
  const budget = Math.max(0, limit - THREAD_SOURCE_OMISSION.length - 2);
  const kept: string[] = [];
  let used = 0;
  for (let index = blocks.length - 1; index >= 0; index--) {
    const block = blocks[index];
    const cost = block.length + (kept.length > 0 ? 2 : 0);
    if (used + cost <= budget) {
      kept.unshift(block);
      used += cost;
      continue;
    }
    if (kept.length === 0) kept.unshift(tailSlice(block, budget));
    break;
  }
  return { content: `${THREAD_SOURCE_OMISSION}\n\n${kept.join("\n\n")}`, truncated: true };
}

/** The newest `limit` UTF-16 units of `text`, never starting mid-surrogate. */
function tailSlice(text: string, limit: number): string {
  return text.slice(text.length - limit).replace(/^[\udc00-\udfff]/u, "");
}

export function transcriptMarkdown(
  threadTitle: string,
  bundleName: string | null,
  agentName: string,
  messages: readonly ThreadTranscriptItem[],
): string {
  const safeBundleName = (bundleName ?? "No bundle selected").replace(/[\r\n]+/g, " ");
  const safeAgentName = agentName.replace(/[\r\n]+/g, " ");
  const safeThreadTitle = threadTitle.replace(/[\r\n]+/g, " ");
  const sections = messages.map((message) => {
    if (message.role === "plan") {
      const entries = message.entries.map((entry) => {
        const marker = entry.status === "completed" ? "x" : " ";
        const suffix = entry.status === "in-progress" ? " (in progress)" : "";
        return `- [${marker}] ${entry.content.replace(/[\r\n]+/g, " ")}${suffix}`;
      });
      return `## Plan\n\n${entries.join("\n")}`;
    }
    if (message.role === "tool") {
      const status = message.status === "in-progress" ? "Running" :
        `${message.status.charAt(0).toUpperCase()}${message.status.slice(1)}`;
      return `> **Tool (${status}):** ${message.title.replace(/[\r\n]+/g, " ")}`;
    }
    if (message.role === "user") return `## You\n\n${quoteMarkdown(message.text)}`;
    if (message.role === "agent") {
      return message.contextSummary
        ? `## Agent context summary (/${message.contextSummary.commandName})\n\n${message.text}`
        : `## Agent\n\n${message.text}`;
    }
    return `> **Turn:** ${message.text.replace(/\n/g, "\n> ")}`;
  });
  return [
    `# ${safeThreadTitle}`,
    `Agent: ${safeAgentName}`,
    `Bundle: ${safeBundleName}`,
    ...sections,
  ].join("\n\n") + "\n";
}
