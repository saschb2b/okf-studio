#!/usr/bin/env node
// Version-agreement gate, and the one writer for a version bump.
//
// The release version lives in more than one file because the toolchains do not
// share a manifest: Cargo needs it in Cargo.toml, npm in package.json, the
// marketing site renders it, and the design system's hero example shows it.
// Three releases in a row shipped with those edited by hand and nothing checking
// they agreed. Disagreement is not loud: the installer, the updater manifest,
// and the download page can each claim a different number, and the first
// symptom is a user told an update exists that the updater then refuses.
//
//   node scripts/check-version.mjs            # verify every place agrees
//   node scripts/check-version.mjs --write    # rewrite them from package.json
//   node scripts/check-version.mjs --set 1.2.3
//
// package.json is the source of truth. TARGETS below is the whole map, and it is
// shared by the check and the writer, so a place can never be verified but not
// written (or the reverse). A target whose pattern stops matching is an error,
// not a silent pass.
//
// A new place that carries the version is caught by the undeclared-occurrence
// scan at the bottom, which reads tracked non-prose files. Markdown is exempt:
// prose cites past versions and should. That means a *functional* version in a
// Markdown file has to be declared in TARGETS by hand, which is what the two
// design-system entries are.

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

/**
 * Every place that carries the version.
 *
 * `pattern` captures it in exactly three parts: what comes before, the version
 * itself, and what comes after. The check reads group 2; the writer replaces it.
 * One definition, so the two cannot drift apart.
 *
 * Three groups is enforced below, not a convention. A two-group pattern silently
 * writes the match offset into the file, because that is the argument
 * String.replace passes where the third group would be: an early version of this
 * script turned 0.9.1 into 0.9.1877. Where there is nothing after the version,
 * end the pattern with an empty `()`.
 */
const TARGETS = [
  {
    file: "Cargo.toml",
    what: "workspace package version",
    // Scoped to [workspace.package] so dependency versions cannot match.
    pattern: /(\[workspace\.package\][^[]*?\nversion = ")([^"]+)(")/,
  },
  {
    file: "Cargo.lock",
    what: "okf-core entry",
    pattern: /(\[\[package\]\]\nname = "okf-core"\nversion = ")([^"]+)(")/,
  },
  {
    file: "Cargo.lock",
    what: "okf-viewer entry",
    pattern: /(\[\[package\]\]\nname = "okf-viewer"\nversion = ")([^"]+)(")/,
  },
  {
    file: "package.json",
    what: "package version (the source of truth)",
    pattern: /("version": ")([^"]+)(")/,
  },
  {
    file: "site/src/data/site.ts",
    what: "displayed version",
    pattern: /(export const version = "v)([^"]+)(";)/,
  },
  {
    file: "site/src/data/site.ts",
    what: "schema.org softwareVersion",
    pattern: /(export const softwareVersion = ")([^"]+)(";)/,
  },
  {
    file: "benchmarks/okf-agent/provider-matrix.json",
    what: "the app version this capability matrix describes",
    pattern: /("appVersion": ")([^"]+)(")/,
  },
  {
    file: "design-system/patterns/hero.md",
    what: "eyebrow example in the composition table",
    pattern: /(OKF Studio · v)(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)()/,
  },
  {
    file: "design-system/patterns/hero.example.html",
    what: "eyebrow in the rendered example",
    pattern: /(OKF Studio · v)(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)()/,
  },
];

/**
 * src-tauri/tauri.conf.json used to carry a tenth copy. Tauri reads the version
 * from a package.json when the field is a path to one, so the file now points at
 * the source of truth instead of repeating it. This keeps a literal from coming
 * back: a plain number there would build installers that disagree with the
 * updater manifest, and nothing else would notice.
 */
const TAURI_CONFIG = "src-tauri/tauri.conf.json";
const TAURI_VERSION_POINTER = "../package.json";

/**
 * Where the undeclared-occurrence scan looks: the manifests, the published
 * surfaces, and the workflows. A tenth copy of the release version realistically
 * appears in one of these, and each is small enough that a match is worth
 * reading.
 *
 * Deliberately not scanned, because a version literal there is almost never this
 * one and the noise would train everyone to ignore the gate: `src/` and
 * `crates/` (the app reads its version from the build, and both carry
 * third-party version strings in fixtures and comments), `docs/` and other
 * Markdown (prose cites past releases and should), and lock files (unrelated
 * dependencies sit at every version number; the two entries that matter are
 * declared targets above).
 */
const SCAN_ROOTS = [
  ".github/",
  "benchmarks/",
  "design-system/",
  "site/",
  "src-tauri/capabilities/",
];
const SCAN_ROOT_FILES = ["Cargo.toml", "package.json", "src-tauri/tauri.conf.json"];

const SCAN_EXTENSIONS = new Set([
  ".astro",
  ".css",
  ".html",
  ".js",
  ".json",
  ".mjs",
  ".toml",
  ".ts",
  ".yaml",
  ".yml",
]);

const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");
const write = (file, text) => fs.writeFileSync(path.join(ROOT, file), text);

/** The source of truth. */
function sourceVersion() {
  return JSON.parse(read("package.json")).version;
}

/** Locate a target's version, or explain why the file no longer matches. */
function readTarget(target) {
  const match = read(target.file).match(target.pattern);
  if (!match) {
    return {
      ...target,
      error:
        "the pattern no longer matches. The file was reformatted or the field " +
        "renamed; update TARGETS in scripts/check-version.mjs.",
    };
  }
  return { ...target, found: match[2] };
}

/** How many groups a pattern captures. */
function groupCount(pattern) {
  return new RegExp(`${pattern.source}|`).exec("").length - 1;
}

/** Refuse a target whose pattern would corrupt the file it writes. */
function assertWellFormedTargets() {
  const bad = TARGETS.filter((t) => groupCount(t.pattern) !== 3);
  if (bad.length === 0) return;
  console.error("\nMalformed TARGETS in scripts/check-version.mjs:\n");
  for (const t of bad) {
    console.error(
      `  ${t.file} (${t.what}) captures ${groupCount(t.pattern)} groups, needs exactly 3.` +
        "\n      Before, the version, and after. End with an empty () when nothing follows.",
    );
  }
  console.error("");
  process.exit(2);
}

/** Rewrite one target to `version`. */
function writeTarget(target, version) {
  const before = read(target.file);
  const after = before.replace(
    target.pattern,
    (_m, prefix, _old, suffix) => `${prefix}${version}${suffix}`,
  );
  if (after !== before) write(target.file, after);
  return after !== before;
}

/** Tracked files that could carry a version literal without saying so. */
function scanFiles() {
  const tracked = execFileSync("git", ["ls-files", "-z"], { cwd: ROOT, encoding: "utf8" })
    .split("\0")
    .filter(Boolean);
  const declared = new Set([...TARGETS.map((t) => t.file), TAURI_CONFIG]);
  const inScope = (file) =>
    SCAN_ROOT_FILES.includes(file) || SCAN_ROOTS.some((root) => file.startsWith(root));
  return tracked.filter(
    (file) => inScope(file) && SCAN_EXTENSIONS.has(path.extname(file)) && !declared.has(file),
  );
}

/** Occurrences of `version` in files that never declared they carry it. */
function undeclaredOccurrences(version) {
  const needle = new RegExp(`(?<![\\d.])${version.replace(/\./g, "\\.")}(?![\\d.])`);
  const hits = [];
  for (const file of scanFiles()) {
    const lines = read(file).split("\n");
    lines.forEach((line, i) => {
      if (needle.test(line)) hits.push({ file, line: i + 1, text: line.trim().slice(0, 100) });
    });
  }
  return hits;
}

function checkTauriConfig() {
  const config = JSON.parse(read(TAURI_CONFIG));
  if (config.version === TAURI_VERSION_POINTER) return null;
  return config.version === undefined
    ? `${TAURI_CONFIG} has no "version". Point it at "${TAURI_VERSION_POINTER}" so the ` +
        "bundle version follows the source of truth."
    : `${TAURI_CONFIG} carries the literal "${config.version}". Replace it with ` +
        `"${TAURI_VERSION_POINTER}": Tauri reads the version from a package.json when the ` +
        "field is a path to one, and a literal here builds installers that can disagree " +
        "with the updater manifest.";
}

/** docs/log.md must carry a Release entry for the version being shipped. */
function checkReleaseNote(version) {
  const log = read("docs/log.md");
  const escaped = version.replace(/\./g, "\\.");
  if (new RegExp(`\\*\\*Release\\*\\*: ${escaped}[.,\\s]`).test(log)) return null;
  return (
    `docs/log.md has no "**Release**: ${version}" entry. The version was bumped ` +
    "without recording what the release contains."
  );
}

// ---------------------------------------------------------------------------

assertWellFormedTargets();

const args = process.argv.slice(2);
const setIndex = args.indexOf("--set");
const requested = setIndex >= 0 ? args[setIndex + 1] : null;
const writing = args.includes("--write") || setIndex >= 0;

if (setIndex >= 0 && !requested) {
  console.error("--set needs a version, e.g. --set 1.2.3");
  process.exit(2);
}
if (requested && !SEMVER.test(requested)) {
  console.error(`"${requested}" is not a semver version (MAJOR.MINOR.PATCH).`);
  process.exit(2);
}

if (requested) {
  const pkg = read("package.json");
  write("package.json", pkg.replace(/("version": ")([^"]+)(")/, `$1${requested}$3`));
}

const version = sourceVersion();
if (!SEMVER.test(version)) {
  console.error(`package.json version "${version}" is not semver (MAJOR.MINOR.PATCH).`);
  process.exit(1);
}

if (writing) {
  const changed = [];
  for (const target of TARGETS) {
    const state = readTarget(target);
    if (state.error) {
      console.error(`\n${target.file} (${target.what}): ${state.error}\n`);
      process.exit(1);
    }
    if (writeTarget(target, version)) changed.push(`${target.file} (${target.what})`);
  }
  console.log(`Version ${version} written to ${changed.length} place${changed.length === 1 ? "" : "s"}:`);
  for (const place of changed) console.log(`  ${place}`);
  if (changed.length === 0) console.log("  (everything already agreed)");
  const note = checkReleaseNote(version);
  if (note) console.log(`\nNext: ${note}`);
  process.exit(0);
}

const problems = [];

for (const target of TARGETS) {
  const state = readTarget(target);
  if (state.error) {
    problems.push(`${target.file} (${target.what})\n      ${state.error}`);
  } else if (state.found !== version) {
    problems.push(
      `${target.file} (${target.what})\n      says ${state.found}, expected ${version}`,
    );
  }
}

const tauri = checkTauriConfig();
if (tauri) problems.push(tauri);

const note = checkReleaseNote(version);
if (note) problems.push(note);

const stray = undeclaredOccurrences(version);
for (const hit of stray) {
  problems.push(
    `${hit.file}:${hit.line} carries ${version} but is not in TARGETS\n      ${hit.text}`,
  );
}

if (problems.length === 0) {
  console.log(`Version ${version} agrees across ${TARGETS.length} places.`);
  process.exit(0);
}

console.error(`\n${problems.length} version problem${problems.length > 1 ? "s" : ""}:\n`);
for (const problem of problems) console.error(`  ${problem}`);
console.error(
  "\nRun `pnpm version:set <version>` to bump every place at once, or" +
    "\n`node scripts/check-version.mjs --write` to resync them from package.json." +
    "\nA new place that should carry the version belongs in TARGETS in this file.\n",
);
process.exit(1);
