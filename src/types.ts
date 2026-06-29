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

export interface Bundle {
  root: string;
  name: string;
  okfVersion: string | null;
  concepts: Concept[];
  indexes: IndexNode[];
  log: LogEntry[];
  issues: Issue[];
  confidence: Confidence;
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
}

export type ThemeMode = "system" | "light" | "dark";

export interface Settings {
  theme: ThemeMode;
  reduceMotion: boolean;
  scanMaxDepth: number;
  /**
   * Reader text-size multiplier (1 = default). Applied as a reader-scoped CSS
   * scale, this is the native, content-scoped replacement for browser page-zoom.
   */
  readerScale: number;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: "system",
  reduceMotion: false,
  scanMaxDepth: 8,
  readerScale: 1,
};

/** A directed cross-link edge in the concept graph. */
export interface GraphEdge {
  source: string;
  target: string;
}
