import type { Concept } from "@/shared/types.ts";

export const ACCESS_PROFILE_NAMESPACE = "io.okf.access";
export const KNOWN_SENSITIVITIES = [
  "public",
  "internal",
  "confidential",
  "restricted",
] as const;

export type KnownSensitivity = (typeof KNOWN_SENSITIVITIES)[number];

export interface AccessHints {
  hasMetadata: boolean;
  audiences: string[];
  sensitivity: string | null;
  knownSensitivity: KnownSensitivity | null;
  handlingNotes: string | null;
  diagnostics: string[];
}

const MAX_AUDIENCES = 16;
const MAX_AUDIENCE_CHARS = 128;
const MAX_SENSITIVITY_CHARS = 128;
const MAX_HANDLING_NOTE_CHARS = 512;
const MAX_DIAGNOSTICS = 8;

export function assessAccessHints(
  concept: Pick<Concept, "extra"> | { extra?: Record<string, unknown> },
): AccessHints {
  const extra = concept.extra ?? {};
  const hasMetadata = ["audience", "sensitivity", "handling_notes"]
    .some((key) => Object.hasOwn(extra, key));
  if (!hasMetadata) {
    return {
      hasMetadata: false,
      audiences: [],
      sensitivity: null,
      knownSensitivity: null,
      handlingNotes: null,
      diagnostics: [],
    };
  }

  const diagnostics: string[] = [];
  const audiences = audienceValues(extra.audience, diagnostics);
  const sensitivity = stringValue(
    extra.sensitivity,
    "Sensitivity",
    MAX_SENSITIVITY_CHARS,
    diagnostics,
  );
  const normalized = sensitivity?.toLocaleLowerCase("en-US") ?? null;
  const knownSensitivity = normalized !== null &&
    (KNOWN_SENSITIVITIES as readonly string[]).includes(normalized)
    ? normalized as KnownSensitivity
    : null;
  if (sensitivity && knownSensitivity === null) {
    diagnostics.push(
      `Unknown sensitivity value "${sensitivity}" remains visible and receives no automatic rank.`,
    );
  }
  const handlingNotes = stringValue(
    extra.handling_notes,
    "Handling notes",
    MAX_HANDLING_NOTE_CHARS,
    diagnostics,
  );

  return {
    hasMetadata,
    audiences,
    sensitivity,
    knownSensitivity,
    handlingNotes,
    diagnostics: diagnostics.slice(0, MAX_DIAGNOSTICS),
  };
}

export function sensitivityRank(value: string): number | null {
  const index = (KNOWN_SENSITIVITIES as readonly string[])
    .indexOf(value.trim().toLocaleLowerCase("en-US"));
  return index < 0 ? null : index;
}

function audienceValues(value: unknown, diagnostics: string[]): string[] {
  if (value === undefined) return [];
  const values = Array.isArray(value) ? value : [value];
  if (!Array.isArray(value) && typeof value !== "string") {
    diagnostics.push("Audience must be a string or a list of strings.");
    return [];
  }
  const audiences: string[] = [];
  const seen = new Set<string>();
  for (const item of values) {
    if (typeof item !== "string") {
      diagnostics.push("Audience entries must be strings.");
      continue;
    }
    const bounded = boundedText(item, MAX_AUDIENCE_CHARS);
    if (bounded === null) {
      diagnostics.push(
        "An audience entry was empty, contained controls, or exceeded 128 characters.",
      );
      continue;
    }
    if (!seen.has(bounded)) {
      seen.add(bounded);
      audiences.push(bounded);
    }
    if (audiences.length === MAX_AUDIENCES) {
      if (values.length > MAX_AUDIENCES) {
        diagnostics.push(
          `Only the first ${MAX_AUDIENCES} valid audience entries were interpreted.`,
        );
      }
      break;
    }
  }
  return audiences;
}

function stringValue(
  value: unknown,
  label: string,
  maxChars: number,
  diagnostics: string[],
): string | null {
  if (value === undefined) return null;
  if (typeof value !== "string") {
    diagnostics.push(`${label} must be a string.`);
    return null;
  }
  const bounded = boundedText(value, maxChars);
  if (bounded === null) {
    diagnostics.push(
      `${label} was empty, contained controls, or exceeded ${maxChars} characters.`,
    );
  }
  return bounded;
}

function boundedText(value: string, maxChars: number): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 &&
    Array.from(trimmed).length <= maxChars &&
    !Array.from(trimmed).some((character) => {
      const code = character.charCodeAt(0);
      return code <= 31 || code === 127;
    })
    ? trimmed
    : null;
}
