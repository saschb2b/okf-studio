#!/usr/bin/env node
// Re-pin Studio's capability manifest against the vendored okf skill.
//
// The skill directory is an upstream dependency that the skills tooling
// rewrites. Studio compiles its markdown into the binary and pins a digest per
// resource, so every skill update used to break the Rust build with a bare
// panic from build.rs. The manifest and the artifact schemas are Studio's, so
// they live under src-tauri/capability-pack. This script recomputes the pins
// and drops a resource whose file the skill no longer ships.
//
//   node scripts/pin-capabilities.mjs           report what drifted
//   node scripts/pin-capabilities.mjs --write    apply the new pins
//
// Exits non-zero when a pin is stale, so it gates in CI as well as reports.
// It never writes to the skill directory.

import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const PACK_ROOT = "src-tauri/capability-pack/okf";
const SKILL_ROOT = ".agents/skills/okf";
const write = process.argv.includes("--write");

/** Studio owns the pack; the skill is read-only. Pack wins on a name clash. */
function resolve(path) {
  const owned = join(PACK_ROOT, path);
  return existsSync(owned) ? owned : join(SKILL_ROOT, path);
}

/** Matches sha256_resource in src-tauri/capability_digest.rs. */
function digest(bytes, mediaType) {
  const hashed =
    mediaType === "text/markdown" ||
    mediaType === "application/json" ||
    mediaType === "application/schema+json"
      ? Buffer.from(bytes.toString("utf8").replaceAll("\r\n", "\n"), "utf8")
      : bytes;
  return createHash("sha256").update(hashed).digest("hex");
}

const drift = [];
const dropped = [];

async function pin(resource) {
  const path = resolve(resource.path);
  if (!existsSync(path)) return false;
  const current = digest(await readFile(path), resource.mediaType);
  if (current !== resource.sha256) {
    drift.push(resource.path);
    resource.sha256 = current;
  }
  return true;
}

const manifestPath = join(PACK_ROOT, "capabilities.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));

for (const capability of manifest.capabilities) {
  const kept = [];
  for (const resource of capability.resources) {
    if (await pin(resource)) kept.push(resource);
    else dropped.push(`${capability.id}: ${resource.path}`);
  }
  if (kept.length === 0) {
    console.error(`error: ${capability.id} has no resources left in the skill.`);
    process.exit(1);
  }
  capability.resources = kept;
}

// The pack points at the manifest, so its digest is taken after the rewrite.
const packPath = join(PACK_ROOT, "pack.json");
const pack = JSON.parse(await readFile(packPath, "utf8"));
for (const resource of [...pack.templates, ...pack.artifactSchemas]) {
  if (!(await pin(resource))) {
    console.error(`error: the pack requires ${resource.path}, which is missing.`);
    process.exit(1);
  }
}

const manifestJson = `${JSON.stringify(manifest, null, 2)}\n`;
const manifestDigest = digest(Buffer.from(manifestJson, "utf8"), "application/json");
if (pack.capabilityManifest.sha256 !== manifestDigest) {
  drift.push("capabilities.json");
  pack.capabilityManifest.sha256 = manifestDigest;
}

for (const path of dropped) console.log(`dropped ${path}, the skill no longer ships it`);
for (const path of drift) console.log(`re-pinned ${path}`);

if (drift.length === 0 && dropped.length === 0) {
  console.log("Capability pins match the vendored skill.");
  process.exit(0);
}

if (!write) {
  console.error(`\n${drift.length + dropped.length} pin(s) stale. Run with --write to apply.`);
  process.exit(1);
}

await writeFile(manifestPath, manifestJson);
await writeFile(packPath, `${JSON.stringify(pack, null, 2)}\n`);
console.log(`\nWrote ${manifestPath} and ${packPath}.`);
