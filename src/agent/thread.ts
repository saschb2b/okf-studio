const MAX_DERIVED_TITLE_CHARS = 64;

export interface ThreadStarterTitle {
  title: string;
  prompt: string;
}

export interface ThreadTranscriptMessage {
  role: "user" | "agent" | "status";
  text: string;
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

export function transcriptMarkdown(
  threadTitle: string,
  bundleName: string | null,
  agentName: string,
  messages: readonly ThreadTranscriptMessage[],
): string {
  const safeBundleName = (bundleName ?? "No bundle selected").replace(/[\r\n]+/g, " ");
  const safeAgentName = agentName.replace(/[\r\n]+/g, " ");
  const safeThreadTitle = threadTitle.replace(/[\r\n]+/g, " ");
  const sections = messages.map((message) => {
    if (message.role === "user") return `## You\n\n${quoteMarkdown(message.text)}`;
    if (message.role === "agent") return `## Agent\n\n${message.text}`;
    return `> **Turn:** ${message.text.replace(/\n/g, "\n> ")}`;
  });
  return [
    `# ${safeThreadTitle}`,
    `Agent: ${safeAgentName}`,
    `Bundle: ${safeBundleName}`,
    ...sections,
  ].join("\n\n") + "\n";
}
