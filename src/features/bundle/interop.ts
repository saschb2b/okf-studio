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

const LANGUAGE_SUFFIX = /\.[a-z]{2,3}(?:-[a-z0-9]+)*$/i;

function stripLanguageSuffix(conceptId: string): string {
  return conceptId.replace(LANGUAGE_SUFFIX, "");
}

/**
 * The full report rereads the bundle and verifies declared files. Request it
 * for the reader only when the active concept can gain contextual controls.
 */
export function conceptNeedsInteropReport(
  concept: Concept | null,
  bundle: Bundle | null,
): boolean {
  if (!concept || !bundle) return false;
  if (
    Object.hasOwn(concept.extra, "language") ||
    Object.hasOwn(concept.extra, "translation_of") ||
    Object.hasOwn(concept.extra, "sidecars") ||
    LANGUAGE_SUFFIX.test(concept.id)
  ) {
    return true;
  }
  return bundle.concepts.some((candidate) => {
    const translationOf = candidate.extra.translation_of;
    return translationOf === concept.id ||
      (LANGUAGE_SUFFIX.test(candidate.id) &&
        stripLanguageSuffix(candidate.id) === concept.id);
  });
}

export function formatInteropBytes(value: number | null): string {
  if (value === null) return "Size unavailable";
  if (value < 1_024) return `${value} B`;
  return `${(value / 1_024).toFixed(1)} KiB`;
}

export function externalReferenceNeedsAttention(
  reference: ExternalBundleReference,
): boolean {
  return reference.status !== "cached";
}

export function sidecarNeedsAttention(sidecar: SidecarResource): boolean {
  return sidecar.status !== "ready";
}
import type { Bundle, Concept } from "@/shared/types.ts";
