const MAX_PROPOSAL_CHARS = 131_072;
const MAX_CONCEPTS = 64;
const MAX_INDEXES = 32;
const MAX_REFERENCES = 512;
const MAX_PATH_CHARS = 1_024;
const MAX_TITLE_CHARS = 256;
const MAX_TYPE_CHARS = 128;

export interface BundleProposalConcept {
  path: string;
  title: string;
  type: string;
  links: readonly string[];
}

export interface BundleProposalIndex {
  path: string;
  concepts: readonly string[];
}

export interface BundleProposal {
  concepts: readonly BundleProposalConcept[];
  indexes: readonly BundleProposalIndex[];
  linkCount: number;
}

export type BundleProposalParseResult =
  | { status: "none" }
  | { status: "invalid"; message: string }
  | { status: "ready"; proposal: BundleProposal };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function boundedText(value: unknown, limit: number): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text || Array.from(text).length > limit || Array.from(text).some((character) => {
    const code = character.charCodeAt(0);
    return code <= 31 || code === 127;
  })) {
    return null;
  }
  return text;
}

function bundlePath(value: unknown, kind: "concept" | "index"): string | null {
  const path = boundedText(value, MAX_PATH_CHARS)?.replace(/^\.\//u, "");
  if (!path || path.includes("\\") || path.includes(":") || path.startsWith("/") ||
    path.split("/").some((segment) => segment === "" || segment === "." || segment === "..")) {
    return null;
  }
  if (kind === "concept" && !path.toLowerCase().endsWith(".md")) return null;
  if (kind === "index" && path.split("/").at(-1)?.toLowerCase() !== "index.md") return null;
  return path;
}

function pathList(value: unknown, limit: number): string[] | null {
  if (!Array.isArray(value) || value.length > limit) return null;
  const paths: string[] = [];
  for (const candidate of value) {
    const path = bundlePath(candidate, "concept");
    if (!path) return null;
    paths.push(path);
  }
  const unique = new Set(paths.map((path) => path.toLowerCase()));
  return unique.size === paths.length ? paths : null;
}

function invalid(message: string): BundleProposalParseResult {
  return { status: "invalid", message };
}

function proposalFencePattern(): RegExp {
  return /```okf-proposal[ \t]*\r?\n([\s\S]*?)```/giu;
}

/** Keep the proposal contract in the transcript while omitting raw JSON from the rendered narrative. */
export function bundleProposalNarrative(markdown: string): string {
  return markdown.replace(proposalFencePattern(), "").trim();
}

/**
 * Parse the newest bounded `okf-proposal` JSON fence from agent Markdown.
 * The result is display metadata only. It grants no write access and carries
 * no file content into the staging boundary.
 */
export function parseBundleProposal(markdown: string): BundleProposalParseResult {
  const matches = [...markdown.matchAll(proposalFencePattern())];
  const source = matches.at(-1)?.[1]?.trim();
  if (source === undefined) return { status: "none" };
  if (!source || source.length > MAX_PROPOSAL_CHARS) {
    return invalid("The proposal block is empty or exceeds Studio's preview limit.");
  }

  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch {
    return invalid("The proposal block is not valid JSON.");
  }
  if (!isRecord(value) || !Array.isArray(value.concepts) || !Array.isArray(value.indexes)) {
    return invalid("The proposal must contain concepts and indexes arrays.");
  }
  if (value.concepts.length === 0 || value.concepts.length > MAX_CONCEPTS) {
    return invalid(`The proposal must contain 1 to ${MAX_CONCEPTS} concepts.`);
  }
  if (value.indexes.length === 0 || value.indexes.length > MAX_INDEXES) {
    return invalid(`The proposal must contain 1 to ${MAX_INDEXES} indexes.`);
  }

  const concepts: BundleProposalConcept[] = [];
  const conceptPaths = new Set<string>();
  const conceptPathKeys = new Set<string>();
  let linkCount = 0;
  for (const candidate of value.concepts) {
    if (!isRecord(candidate)) return invalid("Every proposed concept must be an object.");
    const path = bundlePath(candidate.path, "concept");
    const title = boundedText(candidate.title, MAX_TITLE_CHARS);
    const type = boundedText(candidate.type, MAX_TYPE_CHARS);
    const links = pathList(candidate.links, MAX_REFERENCES);
    if (!path || !title || !type || !links) {
      return invalid("Each concept needs a safe Markdown path, bounded title and type, and unique Markdown links.");
    }
    const pathKey = path.toLowerCase();
    if (conceptPathKeys.has(pathKey)) return invalid(`The concept path ${path} appears more than once.`);
    conceptPaths.add(path);
    conceptPathKeys.add(pathKey);
    linkCount += links.length;
    if (linkCount > MAX_REFERENCES) return invalid("The proposal contains too many concept links.");
    concepts.push({ path, title, type, links });
  }

  const indexes: BundleProposalIndex[] = [];
  const indexPaths = new Set<string>();
  let membershipCount = 0;
  for (const candidate of value.indexes) {
    if (!isRecord(candidate)) return invalid("Every proposed index must be an object.");
    const path = bundlePath(candidate.path, "index");
    const members = pathList(candidate.concepts, MAX_CONCEPTS);
    if (!path || !members || members.length === 0) {
      return invalid("Each index needs a safe index.md path and at least one unique concept path.");
    }
    const pathKey = path.toLowerCase();
    if (indexPaths.has(pathKey)) return invalid(`The index path ${path} appears more than once.`);
    const missing = members.find((member) => !conceptPaths.has(member));
    if (missing) return invalid(`Index ${path} references unproposed concept ${missing}.`);
    indexPaths.add(pathKey);
    membershipCount += members.length;
    if (membershipCount > MAX_REFERENCES) return invalid("The proposal contains too many index memberships.");
    indexes.push({ path, concepts: members });
  }

  return { status: "ready", proposal: { concepts, indexes, linkCount } };
}
