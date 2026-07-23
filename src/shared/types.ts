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

export interface Concept {
  id: string;
  type: string;
  title: string;
  description: string;
  tags: string[];
  timestamp: string | null;
  resource: string | null;
  extra: Record<string, unknown>;
  body: string;
  links: string[];
  externalLinks: string[];
  brokenLinks: string[];
  citedBy: string[];
  degree: number;
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

export interface ProfileReport {
  schemaVersion: 1;
  profiles: ProfileResolution[];
  diagnostics: ProfileDiagnostic[];
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
};

/** A directed cross-link edge in the concept graph. */
export interface GraphEdge {
  source: string;
  target: string;
}
