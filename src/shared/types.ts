// Shared data-model types — the TypeScript mirror of crates/okf-core/src/model.rs.
// The Rust core serializes these as camelCase JSON across the IPC boundary.

export type Confidence = "confident" | "candidate";
export type EntryKind = "concept" | "directory";
export type IssueLevel = "error" | "warning";

export interface BundleRoot {
  root: string;
  name: string;
  relPath: string;
  okfVersion: string | null;
  confidence: Confidence;
  conceptCount: number;
  types: string[];
}

// --- OKF v0.2 provenance, trust and lifecycle -------------------------------
//
// v0.1 answered "what does an agent need to know?". v0.2 adds "should the agent
// believe it, and is it still true?". These mirror the promoted fields in
// crates/okf-core/src/model.rs.

/** Where a claim came from, and how credible that origin is (spec 5.1). */
export interface Source {
  /** A followable artifact, or a scope descriptor a consumer cannot follow. */
  resource: string;
  /** The join key a body footnote label matches. */
  id: string | null;
  title: string | null;
  /** Authority, in the actor convention. */
  author: string | null;
  /** Adoption and liveness, over the concept's usageWindow. */
  usageCount: number | null;
  /** Recency of the source, distinct from when the concept was written. */
  lastModified: string | null;
}

export interface UsageWindow {
  from: string | null;
  to: string | null;
}

/**
 * An identity: `<producer>/<version>` for agents and tools, `human:<id>` for a
 * person, `process:<id>` for automation (spec 7).
 */
export interface Attribution {
  by: string;
  at: string | null;
}

/**
 * `experimental` is ODSF's, not OKF's. ODSF v0.2 makes OKF's set normative and
 * keeps it as a profile extension, because design systems ship components that
 * are neither drafts nor stable.
 */
export type ConceptStatus = "draft" | "stable" | "experimental" | "deprecated";

/**
 * How much to believe a concept, derived from `verified` (spec 5.3). Ordered
 * lowest to highest.
 */
export type TrustTier = "unverified" | "machine-confirmed" | "human-reviewed";

export interface ComputationParameter {
  name: string;
  type: string | null;
  required: boolean;
}

export interface ComputationExecutor {
  resource: string | null;
  /** The evidence a run must return for the attester to inspect. */
  receipt: string[];
}

/** The contract of a `type: Attested Computation` concept (spec 10). */
export interface ComputationContract {
  /** How to run it, and therefore how everything else is interpreted. */
  runtime: string;
  parameters: ComputationParameter[];
  /** A path, used instead of an inline body fence. */
  computation: string | null;
  executor: ComputationExecutor | null;
  attester: { resource: string | null } | null;
}

export interface Concept {
  id: string;
  type: string;
  title: string;
  description: string;
  tags: string[];
  /**
   * v0.1's authored-at. Read it through `authoredAt()` rather than directly, so
   * the `generated.at` fallback applies.
   */
  timestamp: string | null;
  resource: string | null;
  sources: Source[];
  usageWindow: UsageWindow | null;
  generated: Attribution | null;
  verified: Attribution[];
  status: ConceptStatus;
  staleAfter: string | null;
  /** Present on a `type: Attested Computation` concept. */
  computation: ComputationContract | null;
  extra: Record<string, unknown>;
  body: string;
  links: string[];
  externalLinks: string[];
  brokenLinks: string[];
  citedBy: string[];
  degree: number;
}

// --- Attestation (spec 10.5) -------------------------------------------------
//
// Mirrors crates/okf-core/src/attest.rs. Studio never executes a computation or
// an attester; it compares what a run reports it did against what the bundle
// sanctioned.

/**
 * The result of one check. `unavailable` is deliberately not `passed` — a check
 * that could not run has not succeeded, and collapsing the two is how a gate
 * silently stops gating. Anything rendering this must keep them distinct.
 */
export type CheckOutcome =
  | { state: "passed" }
  | { state: "failed"; detail: string }
  | { state: "unavailable"; detail: string };

/** Where the sanctioned computation's text came from. */
export type ComputationSource =
  | { kind: "inline"; text: string }
  | { kind: "file"; path: string; text: string };

/** Why a contract could not be read. Each is a bundle defect, not a failed run. */
export type ContractError =
  | { reason: "notAComputation" }
  | { reason: "missingRuntime" }
  | { reason: "noComputation" }
  | { reason: "ambiguousComputation" }
  | { reason: "unreadableComputation"; detail: string };

export interface Attestation {
  /** Fields `executor.receipt` declares that the receipt did not carry. */
  missingReceiptFields: string[];
  provenance: CheckOutcome;
  fidelity: CheckOutcome;
  /** True only when every check that could run passed and none was skipped. */
  attested: boolean;
  /** Past `stale_after`. A stale definition can still attest cleanly, so this
   *  warns rather than fails. */
  stale: boolean;
}

/**
 * What Studio can say about a run.
 *
 * `Attestation.attested` is the spec's full bar — provenance *and* fidelity —
 * and it is **always false**, because fidelity means re-reading the
 * authoritative result by job id and only the executor's runtime can do that.
 * Honest, and useless for display: a perfect provenance match would render
 * exactly like a forged one, and a badge that never turns green is one users
 * stop reading. Render this instead.
 */
export type AttestationVerdict =
  | "contract-unreadable"
  | "failed"
  | "provenance-established";

export interface AttestationReport {
  conceptId: string;
  conceptTitle: string;
  runtime: string | null;
  source: ComputationSource | null;
  /** Set when the contract itself is unusable; `attestation` is then null. */
  contractError: ContractError | null;
  attestation: Attestation | null;
  /** The claim to present. Not `attestation.attested` — see the type. */
  verdict: AttestationVerdict;
}

export interface IndexEntry {
  title: string;
  target: string;
  description: string;
  kind: EntryKind;
}

export interface IndexSection {
  heading: string;
  entries: IndexEntry[];
}

export interface IndexNode {
  dir: string;
  title: string;
  /** The directory's authored index.md prose (body minus the H1 title and the
   *  navigation link-bullets), for the folder-home view. Empty for a synthesized
   *  index or a bare list with no prose. */
  intro: string;
  synthesized: boolean;
  sections: IndexSection[];
}

export interface LogEntry {
  date: string;
  entries: string[];
}

export interface Issue {
  conceptId: string | null;
  level: IssueLevel;
  message: string;
}

export type CompatibilityCategory = "parser" | "link" | "index" | "extension";
export type CompatibilityLevel = "error" | "warning" | "advice" | "information";
export type CompatibilityBasis = "okf-conformance" | "portability" | "preservation";

export interface CompatibilityRepair {
  kind: "replace-markdown-target";
  authored: string;
  replacement: string;
}

export interface CompatibilityFinding {
  ruleId: string;
  category: CompatibilityCategory;
  level: CompatibilityLevel;
  basis: CompatibilityBasis;
  file: string;
  conceptId: string | null;
  message: string;
  repair: CompatibilityRepair | null;
}

export interface CompatibilityReport {
  schemaVersion: 1;
  findings: CompatibilityFinding[];
  truncated: boolean;
}

export interface IgnoreReport {
  schemaVersion: 1;
  source: string | null;
  ruleCount: number;
  caseSensitive: boolean;
  excludedCount: number;
  excludedPaths: string[];
  diagnostics: string[];
  truncated: boolean;
}

export type ProfileStatus = "active" | "unavailable";
export type ProfileScope = "bundle" | "concept";
export type ProfileValueType = "string" | "number" | "boolean" | "array" | "object";
export type ProfileExpectation = "recommended" | "required";
export type ProfileDiagnosticLevel = "information" | "recommendation" | "warning";

export interface ProfileField {
  id: string;
  scope: ProfileScope;
  key: string;
  label: string;
  description: string;
  valueType: ProfileValueType;
  expectation: ProfileExpectation;
  conceptTypes: string[];
  examples: unknown[];
}

export interface ProfileRelationship {
  id: string;
  label: string;
  inverse: string | null;
  description: string;
}

export type ProfileCheck =
  | {
      kind: "field-present";
      id: string;
      scope: ProfileScope;
      field: string;
      level: ProfileDiagnosticLevel;
      message: string;
      conceptTypes: string[];
    }
  | {
      kind: "field-one-of";
      id: string;
      scope: ProfileScope;
      field: string;
      values: unknown[];
      level: ProfileDiagnosticLevel;
      message: string;
      conceptTypes: string[];
    };

export interface ProfileDescriptor {
  schemaVersion: 1;
  namespace: string;
  version: string;
  title: string;
  description: string;
  fields: ProfileField[];
  relationships: ProfileRelationship[];
  checks: ProfileCheck[];
  [key: string]: unknown;
}

export interface ProfileResolution {
  namespace: string;
  version: string | null;
  descriptorPath: string | null;
  status: ProfileStatus;
  message: string;
  descriptor: ProfileDescriptor | null;
  extra: Record<string, unknown>;
}

export interface ProfileDiagnostic {
  namespace: string;
  ruleId: string;
  level: ProfileDiagnosticLevel;
  scope: ProfileScope;
  file: string;
  conceptId: string | null;
  field: string;
  message: string;
}

export interface ProfileRelationshipEdge {
  sourceId: string;
  targetId: string;
  namespace: string;
  type: string;
  label: string;
  inverse: string | null;
  recognized: boolean;
  targetExists: boolean;
  portableLink: boolean;
}

export interface ProfileReport {
  schemaVersion: 1;
  profiles: ProfileResolution[];
  diagnostics: ProfileDiagnostic[];
  edges: ProfileRelationshipEdge[];
  truncated: boolean;
}

export interface Bundle {
  root: string;
  name: string;
  okfVersion: string | null;
  /** ODSF profile version from the root index, if the bundle declares one. */
  odsfVersion: string | null;
  /** Producer-defined root index frontmatter, excluding promoted versions. */
  extra: Record<string, unknown>;
  concepts: Concept[];
  indexes: IndexNode[];
  log: LogEntry[];
  issues: Issue[];
  confidence: Confidence;
}

/** Where a remote bundle was fetched from — the kind drives how it's fetched.
 *  Deliberately narrow: a GitHub repo (via its tarball, no git needed) or a
 *  direct archive download. Cloning arbitrary git hosts is out of scope — that's
 *  a local `git clone` away, and pulling in libgit2 would drag pull/sync flows
 *  the viewer has no business owning. */
export type RemoteKind = "github" | "archive";

/**
 * A parsed remote bundle source. Produced network-free by `parseRemoteSource`
 * (so the Open-from-URL dialog previews it live) and handed to the backend to
 * fetch into a local cache dir that then becomes the read scope. See
 * docs/features/bundle-switcher.md and docs/architecture/ipc-and-security.md.
 */
export interface RemoteSource {
  /** The raw URL the user entered (kept verbatim for display and re-fetch). */
  input: string;
  kind: RemoteKind;
  host: string;
  owner?: string;
  repo?: string;
  /** Git ref (branch/tag/commit) when the URL names one. */
  ref?: string;
  /** Subpath within the fetched tree to scope scanning to (e.g. "docs"). */
  subpath?: string;
  /** Compact human label, e.g. "owner/repo · main · /docs". */
  label: string;
}

/**
 * One entry in the Bundle Switcher's recent list. Recents are per-BUNDLE
 * (OKF's unit); `folder` is the picked directory that granted the read scope
 * and is re-granted when the entry is reopened. See docs/features/bundle-switcher.md.
 */
export interface RecentBundle {
  root: string; // absolute path of the bundle root
  folder: string; // the picked folder that grants the read scope
  name: string; // bundle display name
  conceptCount: number;
  types: string[];
  ts: number; // last-opened epoch ms; recents are newest-first
  pinned?: boolean;
  /** Set when the folder was fetched from a URL rather than picked locally. */
  remote?: RemoteSource;
}

export type ThemeMode = "system" | "light" | "dark";

export type ReaderFont = "sans" | "serif";

/** Words per frame in the speed reader — one word, or a two-word phrase. */
export type ReaderChunk = 1 | 2;

export interface Settings {
  theme: ThemeMode;
  reduceMotion: boolean;
  agentNotifications: boolean;
  agentNotificationSound: boolean;
  scanMaxDepth: number;
  /**
   * Reader text-size multiplier (1 = default). Applied as a reader-scoped CSS
   * scale, this is the native, content-scoped replacement for browser page-zoom.
   */
  readerScale: number;
  /** Reading-column measure in characters (line length). */
  readerMeasure: number;
  /** Reading line-height (leading). */
  readerLeading: number;
  /** Reading font: the UI humanist sans (default) or an opt-in serif. */
  readerFont: ReaderFont;
  /** Dyslexia-friendly letter/word spacing in the reader body. */
  readerAids: boolean;
  /**
   * Speed-reading pace in words per minute. A preference only — no pacing mode
   * is persisted, because auto-advancing text must never start on its own
   * (WCAG 2.2.2). See docs/features/speed-reading.md.
   */
  speedReadWpm: number;
  /** Words shown per frame in the focus player: one word, or a short phrase. */
  speedReadChunk: ReaderChunk;
  /** Bold the opening letters of each word while pacing. Off by default. */
  speedReadBoldStart: boolean;
  /** Look for a new release once shortly after launch and show a quiet badge
   *  on the settings icon when one exists. Installing stays user-initiated. */
  updateNotify: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: "system",
  reduceMotion: false,
  agentNotifications: false,
  agentNotificationSound: false,
  scanMaxDepth: 8,
  readerScale: 1,
  readerMeasure: 72,
  readerLeading: 1.7,
  readerFont: "sans",
  readerAids: false,
  speedReadWpm: 300,
  speedReadChunk: 1,
  speedReadBoldStart: false,
  updateNotify: true,
};

/** A directed cross-link edge in the concept graph. */
export interface GraphEdge {
  source: string;
  target: string;
}
