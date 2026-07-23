import type {
  AgentSourceAdapterReceipt,
  AgentSourceInput,
} from "@/shared/ipc.ts";

export const EVIDENCE_PROFILE_NAMESPACE = "io.okf.evidence";
export const MAX_EVIDENCE_SOURCES = 128;
export const MAX_CLAIM_CITATIONS = 1_024;
export const MAX_EVIDENCE_TEXT = 2_048;

export type EvidenceCheckStatus =
  | "available"
  | "changed"
  | "unavailable"
  | "unchecked";

export interface DurableProvenance {
  id: string;
  title: string;
  uri: string | null;
  origin: string | null;
  observedAt: string;
  sourceDigest: string | null;
  evidenceDigest: string | null;
  adapterId: string;
  adapterVersion: number;
  discovery: AgentSourceAdapterReceipt["discovery"];
  mediaType: string;
  locator: string | null;
  localPathRedacted: boolean;
}

export interface EvidenceSource {
  id: string;
  title: string;
  provenanceId: string | null;
  uri: string | null;
  locator: string | null;
  observedAt: string | null;
  sourceDigest: string | null;
  evidenceDigest: string | null;
  adapterId: string | null;
  adapterVersion: number | null;
  mediaType: string | null;
  lastCheckedAt: string | null;
  lastStatus: EvidenceCheckStatus;
  lastFingerprint: string | null;
}

export interface ClaimCitation {
  sourceId: string;
  line: number;
  resolved: boolean;
}

export interface EvidenceDiagnostic {
  kind:
    | "dangling-citation"
    | "unused-source"
    | "invalid-source"
    | "inspection-limit";
  sourceId: string;
  line: number | null;
  message: string;
}

export interface ConceptEvidence {
  provenance: readonly DurableProvenance[];
  sources: readonly EvidenceSource[];
  citations: readonly ClaimCitation[];
  diagnostics: readonly EvidenceDiagnostic[];
  truncated: boolean;
}

export function durableProvenanceFromSource(
  id: string,
  source: AgentSourceInput,
  observedAt = source.adapterReceipt?.observedAt ?? new Date().toISOString(),
): DurableProvenance | null {
  const receipt = source.adapterReceipt;
  if (!receipt) return null;
  const origin = safeLocalOrigin(receipt.origin, receipt.discovery);
  const uri = receipt.discovery === "url" ? safeHttpsUri(receipt.origin) : null;
  const localPathRedacted =
    receipt.discovery !== "url" && origin !== cleanText(receipt.origin);
  return {
    id: cleanId(id) ?? "source",
    title: boundedText(source.title) ?? "Untitled source",
    uri,
    origin: receipt.discovery === "url" ? uri : origin,
    observedAt: validTimestamp(observedAt) ?? new Date().toISOString(),
    sourceDigest: normalizeDigest(source.sourceDigest) ??
      normalizeDigest(receipt.sourceFingerprint),
    evidenceDigest: normalizeDigest(receipt.evidenceFingerprint),
    adapterId: boundedText(receipt.adapterId) ?? "unknown",
    adapterVersion: Number.isSafeInteger(receipt.adapterVersion) &&
        receipt.adapterVersion >= 0
      ? receipt.adapterVersion
      : 0,
    discovery: receipt.discovery,
    mediaType: boundedText(receipt.mediaType) ?? "application/octet-stream",
    locator: uri ?? origin,
    localPathRedacted,
  };
}

export function provenanceFrontmatter(
  provenance: DurableProvenance,
): Record<string, unknown> {
  return {
    id: provenance.id,
    title: provenance.title,
    ...(provenance.uri ? { uri: provenance.uri } : {}),
    ...(provenance.origin ? { origin: provenance.origin } : {}),
    observed_at: provenance.observedAt,
    ...(provenance.sourceDigest
      ? { source_digest: provenance.sourceDigest }
      : {}),
    ...(provenance.evidenceDigest
      ? { evidence_digest: provenance.evidenceDigest }
      : {}),
    adapter: {
      id: provenance.adapterId,
      version: provenance.adapterVersion,
    },
    discovery: provenance.discovery,
    media_type: provenance.mediaType,
    ...(provenance.locator ? { locator: provenance.locator } : {}),
  };
}

export function inspectConceptEvidence(
  extra: Record<string, unknown>,
  body: string,
): ConceptEvidence {
  const provenance = parseProvenance(extra.provenance);
  const provenanceById = new Map(provenance.map((source) => [source.id, source]));
  const parsed = parseEvidenceMap(extra.evidence, provenanceById);
  const sources = parsed.sources;
  const sourceIds = new Set(sources.map((source) => source.id));
  const parsedCitations = citationReferences(body);
  const citations = parsedCitations.citations.map((citation) => ({
    ...citation,
    resolved: sourceIds.has(citation.sourceId),
  }));
  const citedIds = new Set(citations.map((citation) => citation.sourceId));
  const diagnostics: EvidenceDiagnostic[] = [
    ...parsed.diagnostics,
    ...(parsedCitations.truncated
      ? [{
          kind: "inspection-limit" as const,
          sourceId: "claim-markers",
          line: null,
          message: `Studio inspected the first ${MAX_CLAIM_CITATIONS} structured claim markers.`,
        }]
      : []),
    ...citations
      .filter((citation) => !citation.resolved)
      .map((citation) => ({
        kind: "dangling-citation" as const,
        sourceId: citation.sourceId,
        line: citation.line,
        message: `Citation [^${citation.sourceId}] has no matching evidence entry.`,
      })),
    ...sources
      .filter((source) => !citedIds.has(source.id))
      .map((source) => ({
        kind: "unused-source" as const,
        sourceId: source.id,
        line: null,
        message: `${source.title} is not cited by a claim marker.`,
      })),
  ];
  return {
    provenance,
    sources,
    citations,
    diagnostics,
    truncated: provenance.length >= MAX_EVIDENCE_SOURCES ||
      parsed.truncated || parsedCitations.truncated,
  };
}

export function materializeEvidenceFootnotes(
  body: string,
  evidence: ConceptEvidence,
): string {
  const citedIds = new Set(
    evidence.citations
      .filter((citation) => citation.resolved)
      .map((citation) => citation.sourceId),
  );
  const definitions = evidence.sources
    .filter((source) => citedIds.has(source.id))
    .map((source) => {
      const title = escapeMarkdown(source.title);
      const locator = source.locator
        ? `, ${escapeMarkdown(source.locator)}`
        : "";
      const label = source.uri
        ? `[${title}](${source.uri})${locator}`
        : `${title}${locator}`;
      return `[^${source.id}]: ${label}`;
    });
  return definitions.length > 0
    ? `${body.trimEnd()}\n\n${definitions.join("\n")}\n`
    : body;
}

function parseProvenance(value: unknown): DurableProvenance[] {
  const entries = Array.isArray(value)
    ? value.map((item, index) => [`source-${index + 1}`, item] as const)
    : objectEntries(value);
  return entries.slice(0, MAX_EVIDENCE_SOURCES).flatMap(([key, item]) => {
    const source = objectValue(item);
    if (!source) return [];
    const adapter = objectValue(source.adapter);
    const id = cleanId(stringValue(source.id) ?? key);
    const title = boundedText(stringValue(source.title));
    const observedAt = validTimestamp(stringValue(source.observed_at));
    if (!id || !title || !observedAt) return [];
    const discovery = discoveryValue(source.discovery);
    const rawOrigin = stringValue(source.origin);
    const uri = safeHttpsUri(stringValue(source.uri));
    const origin = discovery === "url"
      ? uri
      : safeLocalOrigin(rawOrigin, discovery);
    return [{
      id,
      title,
      uri,
      origin,
      observedAt,
      sourceDigest: normalizeDigest(stringValue(source.source_digest)),
      evidenceDigest: normalizeDigest(stringValue(source.evidence_digest)),
      adapterId: boundedText(stringValue(adapter?.id)) ?? "unknown",
      adapterVersion: safeInteger(adapter?.version) ?? 0,
      discovery,
      mediaType: boundedText(stringValue(source.media_type)) ??
        "application/octet-stream",
      locator: boundedText(stringValue(source.locator)) ?? uri ?? origin,
      localPathRedacted:
        discovery !== "url" && origin !== cleanText(rawOrigin),
    }];
  });
}

function parseEvidenceMap(
  value: unknown,
  provenance: ReadonlyMap<string, DurableProvenance>,
): {
  sources: EvidenceSource[];
  diagnostics: EvidenceDiagnostic[];
  truncated: boolean;
} {
  const entries = objectEntries(value);
  const diagnostics: EvidenceDiagnostic[] = [];
  const sources = entries
    .slice(0, MAX_EVIDENCE_SOURCES)
    .flatMap(([key, item]) => {
      const source = objectValue(item);
      const id = cleanId(key);
      if (!source || !id) {
        diagnostics.push({
          kind: "invalid-source",
          sourceId: cleanText(key) ?? "unknown",
          line: null,
          message: "Evidence entries need a safe source ID and object value.",
        });
        return [];
      }
      const provenanceId = cleanId(stringValue(source.provenance_id));
      const durable = provenanceId ? provenance.get(provenanceId) : undefined;
      const uri = safeHttpsUri(stringValue(source.uri)) ?? durable?.uri ?? null;
      return [{
        id,
        title: boundedText(stringValue(source.title)) ?? durable?.title ?? id,
        provenanceId,
        uri,
        locator: boundedText(stringValue(source.locator)) ??
          durable?.locator ?? null,
        observedAt: validTimestamp(stringValue(source.observed_at)) ??
          durable?.observedAt ?? null,
        sourceDigest: normalizeDigest(stringValue(source.source_digest)) ??
          durable?.sourceDigest ?? null,
        evidenceDigest: normalizeDigest(stringValue(source.evidence_digest)) ??
          durable?.evidenceDigest ?? null,
        adapterId: boundedText(stringValue(source.adapter_id)) ??
          durable?.adapterId ?? null,
        adapterVersion: safeInteger(source.adapter_version) ??
          durable?.adapterVersion ?? null,
        mediaType: boundedText(stringValue(source.media_type)) ??
          durable?.mediaType ?? null,
        lastCheckedAt: validTimestamp(stringValue(source.last_checked_at)),
        lastStatus: checkStatus(source.last_status),
        lastFingerprint: normalizeDigest(stringValue(source.last_fingerprint)),
      }];
    });
  return {
    sources,
    diagnostics,
    truncated: entries.length > MAX_EVIDENCE_SOURCES,
  };
}

function citationReferences(body: string): {
  citations: ClaimCitation[];
  truncated: boolean;
} {
  const definitions = new Set<string>();
  const refs: ClaimCitation[] = [];
  const lines = body.split(/\r?\n/u);
  for (const line of lines) {
    const definition = /^\s{0,3}\[\^([A-Za-z0-9][A-Za-z0-9._-]{0,127})\]:/u
      .exec(line);
    if (definition) {
      definitions.add(definition[1]);
      if (definitions.size > MAX_CLAIM_CITATIONS) {
        return { citations: [], truncated: true };
      }
    }
  }
  for (const [index, line] of lines.entries()) {
    if (/^\s{0,3}\[\^/u.test(line)) continue;
    const pattern = /\[\^([A-Za-z0-9][A-Za-z0-9._-]{0,127})\]/gu;
    for (const match of line.matchAll(pattern)) {
      if (!definitions.has(match[1])) {
        if (refs.length >= MAX_CLAIM_CITATIONS) {
          return { citations: refs, truncated: true };
        }
        refs.push({ sourceId: match[1], line: index + 1, resolved: false });
      }
    }
  }
  return { citations: refs, truncated: false };
}

function objectEntries(value: unknown): [string, unknown][] {
  const object = objectValue(value);
  return object ? Object.entries(object) : [];
}

function objectValue(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function cleanText(value: string | null | undefined): string | null {
  if (!value) return null;
  const clean = Array.from(value)
    .filter((character) => {
      const code = character.codePointAt(0) ?? 0;
      return code > 31 && code !== 127;
    })
    .join("")
    .trim();
  return clean.length > 0 ? clean : null;
}

function boundedText(value: string | null | undefined): string | null {
  const clean = cleanText(value);
  return clean
    ? Array.from(clean).slice(0, MAX_EVIDENCE_TEXT).join("")
    : null;
}

function cleanId(value: string | null | undefined): string | null {
  const clean = cleanText(value);
  return clean && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(clean)
    ? clean
    : null;
}

function validTimestamp(value: string | null | undefined): string | null {
  const clean = cleanText(value);
  if (!clean || !/^\d{4}-\d{2}-\d{2}T/u.test(clean)) return null;
  return Number.isNaN(Date.parse(clean)) ? null : clean;
}

function normalizeDigest(value: string | null | undefined): string | null {
  const clean = cleanText(value)?.toLowerCase().replace(/^sha256-/u, "");
  return clean && /^[a-f0-9]{64}$/u.test(clean) ? `sha256-${clean}` : null;
}

function safeInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : null;
}

function discoveryValue(
  value: unknown,
): AgentSourceAdapterReceipt["discovery"] {
  return value === "file" || value === "folder" || value === "url" ||
      value === "image"
    ? value
    : "file";
}

function checkStatus(value: unknown): EvidenceCheckStatus {
  return value === "available" || value === "changed" ||
      value === "unavailable"
    ? value
    : "unchecked";
}

function safeHttpsUri(value: string | null | undefined): string | null {
  const clean = boundedText(value);
  if (!clean) return null;
  try {
    const url = new URL(clean);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function safeLocalOrigin(
  value: string | null | undefined,
  discovery: AgentSourceAdapterReceipt["discovery"],
): string | null {
  const clean = boundedText(value);
  if (!clean || discovery === "url") return null;
  const normalized = clean.replaceAll("\\", "/");
  const absolute = normalized.startsWith("/") ||
    normalized.startsWith("//") ||
    /^[A-Za-z]:\//u.test(normalized);
  if (!absolute && !normalized.split("/").includes("..")) return normalized;
  return normalized.split("/").filter(Boolean).at(-1) ?? "local source";
}

function escapeMarkdown(value: string): string {
  return value.replace(/[\\`*_[\]<>]/gu, "\\$&");
}
