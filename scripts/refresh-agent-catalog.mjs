#!/usr/bin/env node
// Refresh the agent catalog's pinned distributions against their registries.
//
// The catalog pins every installable agent to an exact version, tarball,
// integrity hash and size, which is what lets Studio verify what it downloads.
// Those pins were maintained by hand, so they drifted together: at the time this
// was written all eight npm agents were behind, several by many releases, and
// nothing reported it. Hand-maintained pins do not stay current; a script does.
//
//   node scripts/refresh-agent-catalog.mjs            report what is behind
//   node scripts/refresh-agent-catalog.mjs --write    apply the npm updates
//   node scripts/refresh-agent-catalog.mjs --node v24.18.0   also move Node
//
// Exits non-zero when something is behind, so it can gate as well as report.
//
// The file is edited surgically rather than reserialized. Some of its arrays are
// formatted inline by hand, so JSON.stringify would reformat lines that did not
// change and bury the pins in noise.

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

const CATALOG = new URL("../src/features/agent/catalog.json", import.meta.url);
const NODE_TEST_PIN = "src/features/agent/catalog.test.ts";

const args = process.argv.slice(2);
const write = args.includes("--write");
const nodeVersionArg = args[args.indexOf("--node") + 1];
const wantNode = args.includes("--node") ? nodeVersionArg : null;

if (args.includes("--node") && !/^v\d+\.\d+\.\d+$/.test(wantNode ?? "")) {
  console.error("--node needs a full version, for example --node v24.18.0");
  process.exit(2);
}

/** Fetch JSON, failing loudly: a silent fallback would pin a stale version. */
async function fetchJson(url) {
  const response = await fetch(url, {
    headers: { accept: "application/json", "user-agent": "okf-studio-catalog-refresh" },
  });
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response.json();
}

async function fetchText(url) {
  const response = await fetch(url, { headers: { "user-agent": "okf-studio-catalog-refresh" } });
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response.text();
}

/**
 * The archive's size on the wire, and proof the pin is honest.
 *
 * npm reports `unpackedSize` but not the tarball's own size, and does not answer
 * HEAD with a content-length, so this has to fetch the bytes. Since they are in
 * hand anyway, `integrity` is checked against them: writing a hash straight from
 * registry metadata into a file whose entire job is verifying downloads would be
 * taking the registry's word for the thing we are supposed to be proving.
 */
async function measureArchive(url, integrity = null) {
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (integrity) {
    const [algorithm, expected] = integrity.split("-");
    const actual = createHash(algorithm).update(bytes).digest("base64");
    if (actual !== expected) {
      throw new Error(`${url} does not match its ${algorithm} integrity`);
    }
  }
  return bytes.length;
}

/**
 * The file Studio runs. Taken from the package's own `bin`, because a package
 * may move its entrypoint between versions and a stale one fails at launch
 * rather than at install.
 */
function entrypointOf(manifest, packageName) {
  const bin = manifest.bin;
  if (typeof bin === "string") return bin.replace(/^\.\//, "");
  if (bin && typeof bin === "object") {
    const short = packageName.split("/").pop();
    const chosen = bin[short] ?? bin[packageName] ?? Object.values(bin)[0];
    if (typeof chosen === "string") return chosen.replace(/^\.\//, "");
  }
  return null;
}

/**
 * Replace one field inside a bounded slice of the file.
 *
 * Scoped to the slice on purpose: `"version"` appears in every entry and at the
 * document root, so an unscoped replace would rewrite the wrong pin.
 */
function replaceField(text, from, to, field, value) {
  const slice = text.slice(from, to);
  const quoted = typeof value === "string";
  const pattern = new RegExp(`("${field}":\\s*)(?:"[^"]*"|[0-9]+)`);
  if (!pattern.test(slice)) throw new Error(`could not find "${field}" to update`);
  const replaced = slice.replace(pattern, `$1${quoted ? JSON.stringify(value) : value}`);
  return text.slice(0, from) + replaced + text.slice(to);
}

/** The span of the JSON object containing `anchorText`. */
function objectSpanAround(text, anchorText) {
  const anchor = text.indexOf(anchorText);
  if (anchor < 0) throw new Error(`could not find ${anchorText}`);
  const open = text.lastIndexOf("{", anchor);
  let depth = 0;
  for (let index = open; index < text.length; index += 1) {
    if (text[index] === "{") depth += 1;
    else if (text[index] === "}") {
      depth -= 1;
      if (depth === 0) return [open, index + 1];
    }
  }
  throw new Error(`unterminated object around ${anchorText}`);
}

/** The span of one npm entry's distribution block, located by its package name. */
function distributionSpan(text, packageName) {
  return objectSpanAround(text, `"package": ${JSON.stringify(packageName)}`);
}

async function npmUpdates(catalog) {
  const updates = [];
  for (const entry of catalog.entries) {
    const dist = entry.distribution;
    if (dist?.kind !== "npm") continue;
    const registry = `https://registry.npmjs.org/${encodeURIComponent(dist.package).replace("%40", "@").replace("%2F", "/")}`;
    const manifest = await fetchJson(registry);
    const latest = manifest["dist-tags"]?.latest;
    if (!latest) throw new Error(`${dist.package} has no dist-tags.latest`);
    const version = manifest.versions[latest];
    const entrypoint = entrypointOf(version, dist.package) ?? dist.entrypoint;
    const fields = {
      version: latest,
      tarball: version.dist.tarball,
      integrity: version.dist.integrity,
      unpackedSize: version.dist.unpackedSize,
      downloadSize: await measureArchive(version.dist.tarball, version.dist.integrity),
      entrypoint,
    };
    const changed = Object.entries(fields).filter(([key, value]) => dist[key] !== value);
    updates.push({ id: entry.id, package: dist.package, from: dist.version, to: latest, changed });
  }
  return updates;
}

/**
 * Node's own release listing, with the published checksums rather than hashes we
 * compute ourselves: the point of the pin is to match what nodejs.org signed.
 */
async function nodeUpdate(catalog, version) {
  const shasums = await fetchText(`https://nodejs.org/dist/${version}/SHASUMS256.txt`);
  const bySum = new Map(
    shasums.trim().split("\n").map((line) => {
      const [sum, name] = line.trim().split(/\s+/);
      return [name, sum];
    }),
  );
  const distributions = [];
  for (const current of catalog.nodeRuntime.distributions) {
    // Derive the new filename from the old one by swapping the version, so the
    // target/arch naming stays exactly whatever nodejs.org uses.
    const oldName = current.url.split("/").pop();
    const name = oldName.replaceAll(catalog.nodeRuntime.version, version);
    const sha256 = bySum.get(name);
    if (!sha256) throw new Error(`${name} is not in SHASUMS256.txt for ${version}`);
    const url = `https://nodejs.org/dist/${version}/${name}`;
    distributions.push({
      target: current.target,
      url,
      sha256,
      downloadSize: await measureArchive(url, `sha256-${Buffer.from(sha256, "hex").toString("base64")}`),
      root: current.root.replaceAll(catalog.nodeRuntime.version, version),
    });
  }
  return { from: catalog.nodeRuntime.version, to: version, distributions };
}

function reportManual(catalog) {
  const binaries = catalog.entries.filter((entry) => entry.distribution?.kind === "binary");
  for (const entry of binaries) {
    // Not automated: these URLs embed a build hash that no version string
    // predicts, so there is nothing to derive. Saying so beats implying the
    // script covered it.
    console.log(
      `manual   ${entry.id.padEnd(20)} pinned ${entry.distribution.version} ` +
      `— binary targets carry a build hash, refresh by hand`,
    );
  }
}

const original = await readFile(CATALOG, "utf8");
const eol = original.includes("\r\n") ? "\r\n" : "\n";
const catalog = JSON.parse(original);

const updates = await npmUpdates(catalog);
const behind = updates.filter((update) => update.changed.length > 0);
const node = wantNode ? await nodeUpdate(catalog, wantNode) : null;

for (const update of updates) {
  const status = update.changed.length === 0 ? "current" : "behind ";
  const detail = update.changed.length === 0
    ? update.to
    : `${update.from} -> ${update.to} (${update.changed.map(([key]) => key).join(", ")})`;
  console.log(`${status}  ${update.id.padEnd(20)} ${detail}`);
}
reportManual(catalog);
if (!wantNode && catalog.nodeRuntime) {
  console.log(`node     runtime pinned ${catalog.nodeRuntime.version} — pass --node <version> to move it`);
}

if (!write) {
  console.log(
    behind.length === 0 && !node
      ? "\nEvery npm pin is current."
      : `\n${behind.length} npm pin(s) behind. Re-run with --write to apply.`,
  );
  process.exit(behind.length === 0 ? 0 : 1);
}

let text = original.replaceAll("\r\n", "\n");
for (const update of behind) {
  const [from, to] = distributionSpan(text, update.package);
  for (const [field, value] of update.changed) {
    text = replaceField(text, from, to, field, value);
  }
}
if (node) {
  // The runtime version first, then each platform archive by its target name.
  // Order matters: the version string is what the filenames were derived from,
  // so rewriting it before reading them would break the lookup.
  for (const distribution of node.distributions) {
    const [from, to] = objectSpanAround(text, `"target": ${JSON.stringify(distribution.target)}`);
    text = replaceField(text, from, to, "url", distribution.url);
    text = replaceField(text, from, to, "sha256", distribution.sha256);
    text = replaceField(text, from, to, "downloadSize", distribution.downloadSize);
    text = replaceField(text, from, to, "root", distribution.root);
  }
  const [runtimeFrom, runtimeTo] = objectSpanAround(text, `"version": ${JSON.stringify(node.from)}`);
  text = replaceField(text, runtimeFrom, runtimeTo, "version", node.to);
}
await writeFile(CATALOG, eol === "\r\n" ? text.replaceAll("\n", "\r\n") : text);

console.log(`\nUpdated ${behind.length} npm pin(s) in src/features/agent/catalog.json.`);
if (node) {
  console.log(`Moved the Node runtime ${node.from} -> ${node.to} across ${node.distributions.length} targets.`);
  // The test pins the exact version deliberately, so moving it stays a conscious
  // act rather than something a refresh slips through.
  console.log(`Update the pinned version in ${NODE_TEST_PIN} to match.`);
}
console.log("Then: pnpm lint && pnpm vitest run --project unit");
