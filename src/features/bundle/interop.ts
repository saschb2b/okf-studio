export type LanguageConvention =
  | "frontmatter"
  | "filename-suffix"
  | "translation-reference";

export interface LanguageVariant {
  conceptId: string;
  title: string;
  language: string;
  convention: LanguageConvention;
  translationOf: string | null;
  targetExists: boolean;
}

export interface LanguageVariantGroup {
  identity: string;
  variants: LanguageVariant[];
}

export interface LanguageConventionFinding {
  convention: LanguageConvention;
  observed: number;
  strengths: string[];
  gaps: string[];
}

export interface MultilingualExperiment {
  groups: LanguageVariantGroup[];
  conventions: LanguageConventionFinding[];
  adoptionReady: boolean;
  message: string;
}

export interface ExternalBundleReference {
  alias: string;
  url: string;
  expectedDigest: string | null;
  cachePath: string | null;
  status: "not-resolved" | "cached" | "digest-mismatch" | "unavailable";
  cachedDigest: string | null;
  identityPrefix: string;
  message: string;
}

export interface SemanticWebSummary {
  exportableRelationships: number;
  unsupportedRelationships: number;
  message: string;
}

export interface SidecarResource {
  conceptId: string;
  path: string;
  mediaType: string;
  authoredDigest: string | null;
  actualDigest: string | null;
  size: number | null;
  status: "ready" | "missing" | "digest-mismatch" | "invalid-declaration" | "too-large";
  openPolicy: "safe-preview" | "download-only";
  message: string;
}

export interface InteropReport {
  schemaVersion: 1;
  multilingual: MultilingualExperiment;
  externalBundles: ExternalBundleReference[];
  semanticWeb: SemanticWebSummary;
  sidecars: SidecarResource[];
  diagnostics: string[];
  truncated: boolean;
}

export interface SemanticRelationship {
  sourceId: string;
  targetId: string;
  namespace: string;
  type: string;
}

export interface SemanticLoss {
  path: string;
  message: string;
}

export interface SemanticImportPreview {
  schemaVersion: 1;
  relationships: SemanticRelationship[];
  losses: SemanticLoss[];
  truncated: boolean;
}

