// site.ts: the one owner of release metadata and external destinations.
// Pages import from here; no page repeats a URL or version literal.

export const version = "v0.9.1";
export const softwareVersion = "0.9.1";

export const repo = "https://github.com/saschb2b/okf-studio";
export const releasesLatest = `${repo}/releases/latest`;
export const releases = `${repo}/releases`;
export const issues = `${repo}/issues`;
export const license = `${repo}/blob/main/LICENSE`;
export const docsUrl = `${repo}/tree/main/docs`;
export const roadmapUrl = `${repo}/blob/main/docs/product/studio-roadmap.md`;
export const migrationNotes = `${repo}/blob/main/docs/product/migration-notes.md`;

/** Link a repository doc by path, e.g. doc("features/concept-reader.md"). */
export const doc = (path: string) => `${repo}/blob/main/docs/${path}`;

export const okfSpec =
  "https://github.com/GoogleCloudPlatform/knowledge-catalog/tree/main/okf";
export const odsfSpec = "https://saschb2b.github.io/Open-Design-System-Format/";

export interface DownloadTarget {
  glyph: string;
  os: string;
  meta: string;
  href: string;
}

export const downloads: DownloadTarget[] = [
  { glyph: "⊞", os: "Windows", meta: ".msi · .exe · x64", href: releasesLatest },
  { glyph: "◈", os: "Linux", meta: ".deb · AppImage", href: releasesLatest },
];
