// Rendering the computation of an OKF v0.2 Attested Computation concept.
//
// The spec allows two forms: inline under a `# Computation` heading in the
// body, or stored in a file that `computation:` names. A reader should not be
// able to tell which one a producer chose — the question they came with is
// "what actually runs?", and answering it differently depending on where the
// author put the text would be an artifact of our implementation, not a
// distinction that means anything.
//
// So a file-based computation is appended to the markdown *source* before the
// body is rendered, exactly as `materializeEvidenceFootnotes` does for
// footnotes. Going through the markdown pipeline rather than rendering a
// bespoke component means it picks up syntax highlighting, the heading
// permalink and the copy button for free, and lands in the reading column
// where the inline form already appears.

import type { Concept } from "@/shared/types.ts";

/** Extension → the fence language, restricted to the reader's curated grammars
 *  (see shared/render/highlight.ts). An unknown extension yields no language,
 *  which renders as a plain themed block rather than mislabelled syntax. */
const FENCE_LANGUAGE: Record<string, string> = {
  sql: "sql",
  py: "python",
  python: "python",
  js: "javascript",
  mjs: "javascript",
  ts: "typescript",
  sh: "bash",
  bash: "bash",
  json: "json",
  yaml: "yaml",
  yml: "yaml",
  r: "r",
};

/** The path a concept stores its computation in, or null when it is inline or
 *  the concept carries no contract at all. */
export function declaredComputationPath(concept: Concept): string | null {
  return concept.computation?.computation ?? null;
}

function fenceLanguage(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return FENCE_LANGUAGE[ext] ?? "";
}

/**
 * Append a file-stored computation to `body` as a fenced block under a
 * `# Computation` heading — the same heading the inline form uses.
 *
 * Returns `body` unchanged when the concept stores no computation in a file, or
 * when its source has not loaded yet, so the body never flickers a half-built
 * section.
 */
export function materializeFileComputation(
  body: string,
  concept: Concept,
  source: string | null,
): string {
  const path = declaredComputationPath(concept);
  if (!path || source === null) return body;

  // A computation is arbitrary text and may itself contain a fence. Markdown
  // closes a fence on the first line of >= as many backticks, so a three-tick
  // fence around a file containing ``` would end early and spill the rest of
  // the query into the page as prose. Counting the longest run present and
  // going one longer is the standard escape, and it is what keeps a hostile or
  // merely awkward file from breaking the document.
  const longestRun = Math.max(
    0,
    ...[...source.matchAll(/`+/g)].map((match) => match[0].length),
  );
  const fence = "`".repeat(Math.max(3, longestRun + 1));
  const language = fenceLanguage(path);

  return [
    body.trimEnd(),
    "",
    "# Computation",
    "",
    `${fence}${language}`,
    source.replace(/\s+$/, ""),
    fence,
    "",
  ].join("\n");
}
