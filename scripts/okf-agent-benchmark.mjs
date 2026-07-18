import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readdirSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = fileURLToPath(new URL(".", import.meta.url));
export const benchmarkRoot = resolve(scriptDirectory, "../benchmarks/okf-agent");
export const defaultManifestPath = resolve(benchmarkRoot, "manifest.json");
export const capabilityRoot = resolve(scriptDirectory, "../.agents/skills/okf");
export const defaultCapabilityManifestPath = resolve(capabilityRoot, "capabilities.json");

function requireObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value;
}

function requireString(value, label) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return value;
}

function requireStringArray(value, label) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${label} must be a non-empty array.`);
  }
  const strings = value.map((entry, index) => requireString(entry, `${label}[${index}]`));
  if (new Set(strings).size !== strings.length) {
    throw new Error(`${label} must not contain duplicates.`);
  }
  return strings;
}

function requireUniqueIds(values, label) {
  const ids = values.map((value, index) => requireString(requireObject(value, `${label}[${index}]`).id, `${label}[${index}].id`));
  if (new Set(ids).size !== ids.length) {
    throw new Error(`${label} must use unique IDs.`);
  }
}

function resolveInside(root, requested, label) {
  requireString(requested, label);
  if (isAbsolute(requested)) throw new Error(`${label} must be relative.`);
  const target = resolve(root, requested);
  const pathFromRoot = relative(root, target);
  if (pathFromRoot === "" || pathFromRoot === ".." || pathFromRoot.startsWith(`..${sep}`) || isAbsolute(pathFromRoot)) {
    throw new Error(`${label} must stay inside the benchmark directory.`);
  }
  return target;
}

function filesBelow(root, current = root) {
  const paths = [];
  for (const entry of readdirSync(current, { withFileTypes: true })) {
    const absolute = resolve(current, entry.name);
    const stat = lstatSync(absolute);
    if (stat.isSymbolicLink()) {
      throw new Error(`Benchmark fixtures cannot contain symbolic links: ${relative(root, absolute)}`);
    }
    if (entry.isDirectory()) paths.push(...filesBelow(root, absolute));
    else if (entry.isFile()) paths.push(absolute);
  }
  return paths;
}

export function fingerprintDirectory(directory) {
  const hash = createHash("sha256");
  const paths = filesBelow(directory).sort((left, right) => relative(directory, left).localeCompare(relative(directory, right), "en"));
  for (const path of paths) {
    const portablePath = relative(directory, path).split(sep).join("/");
    hash.update(portablePath, "utf8");
    hash.update("\0");
    hash.update(readFileSync(path));
    hash.update("\0");
  }
  return hash.digest("hex");
}

export function fingerprintValue(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function loadManifest(path = defaultManifestPath) {
  return JSON.parse(readFileSync(path, "utf8"));
}

export function loadCapabilityManifest(path = defaultCapabilityManifestPath) {
  return JSON.parse(readFileSync(path, "utf8"));
}

export function validateCapabilityCoverage(benchmarkInput, capabilityInput) {
  const benchmark = requireObject(benchmarkInput, "benchmark manifest");
  const capabilityManifest = requireObject(capabilityInput, "capability manifest");
  if (!Array.isArray(benchmark.tasks) || !Array.isArray(capabilityManifest.capabilities)) {
    throw new Error("Benchmark tasks and capabilities must be arrays.");
  }

  const capabilities = new Map(capabilityManifest.capabilities.map((value, index) => {
    const capability = requireObject(value, `capability manifest.capabilities[${index}]`);
    return [requireString(capability.id, `capability manifest.capabilities[${index}].id`), capability];
  }));
  const taskCounts = new Map();
  for (const value of benchmark.tasks) {
    const task = requireObject(value, "benchmark task");
    const taskId = requireString(task.id, "benchmark task.id");
    const capabilityId = requireString(task.capabilityId, `task ${taskId}.capabilityId`);
    const capability = capabilities.get(capabilityId);
    if (!capability) throw new Error(`Task ${taskId} references unshipped capability ${capabilityId}.`);
    taskCounts.set(capabilityId, (taskCounts.get(capabilityId) ?? 0) + 1);

    const allowedTools = requireStringArray(task.allowedTools, `task ${taskId}.allowedTools`).slice().sort();
    const requiredTools = requireStringArray(capability.requiredTools, `capability ${capabilityId}.requiredTools`).slice().sort();
    if (JSON.stringify(allowedTools) !== JSON.stringify(requiredTools)) {
      throw new Error(`Task ${taskId} tools do not match ${capabilityId}.`);
    }
    const artifactKinds = requireStringArray(capability.artifactKinds, `capability ${capabilityId}.artifactKinds`);
    if (!artifactKinds.includes(task.expectedArtifact)) {
      throw new Error(`Task ${taskId} expects an artifact not declared by ${capabilityId}.`);
    }

    const instructions = capability.resources.find((resource) => resource.id === "instructions");
    if (!instructions) throw new Error(`${capabilityId} has no instructions resource.`);
    const instructionPath = resolveInside(capabilityRoot, instructions.path, `${capabilityId} instructions path`);
    const contents = readFileSync(instructionPath, "utf8");
    for (const heading of [
      "## Trigger",
      "## Required inputs",
      "## Method",
      "## Artifact contract",
      "## Stop conditions",
      "## Completion checks",
      "## Worked example",
      "## Adversarial example",
    ]) {
      if (!contents.includes(heading)) throw new Error(`${capabilityId} instructions are missing ${heading}.`);
    }
  }

  const curatedIds = [...capabilities.keys()].filter((id) => id !== "okf-core");
  for (const capabilityId of curatedIds) {
    if (taskCounts.get(capabilityId) !== 1) {
      throw new Error(`${capabilityId} must own exactly one benchmark task.`);
    }
  }
  return { curatedCapabilityCount: curatedIds.length };
}

export function validateManifest(input, root = benchmarkRoot) {
  const manifest = requireObject(input, "manifest");
  if (manifest.schemaVersion !== 2) throw new Error("manifest.schemaVersion must be 2.");
  if (!Array.isArray(manifest.fixtures) || manifest.fixtures.length === 0) {
    throw new Error("manifest.fixtures must be a non-empty array.");
  }
  if (!Array.isArray(manifest.tasks) || manifest.tasks.length === 0) {
    throw new Error("manifest.tasks must be a non-empty array.");
  }
  requireUniqueIds(manifest.fixtures, "manifest.fixtures");
  requireUniqueIds(manifest.tasks, "manifest.tasks");

  const fixtureIds = new Set();
  const fingerprints = new Map();
  for (const [index, value] of manifest.fixtures.entries()) {
    const fixture = requireObject(value, `manifest.fixtures[${index}]`);
    const id = requireString(fixture.id, `manifest.fixtures[${index}].id`);
    fixtureIds.add(id);
    if (fixture.kind !== "bundle" && fixture.kind !== "generated") {
      throw new Error(`Fixture ${id} has an unsupported kind.`);
    }
    const expectedFingerprint = requireString(fixture.sha256, `fixture ${id}.sha256`);
    if (!/^[a-f0-9]{64}$/.test(expectedFingerprint)) {
      throw new Error(`Fixture ${id} must declare a lowercase SHA-256 fingerprint.`);
    }
    requireObject(fixture.expected, `fixture ${id}.expected`);
    const actualFingerprint = fixture.kind === "bundle"
      ? fingerprintDirectory(resolveInside(root, requireString(fixture.path, `fixture ${id}.path`), `fixture ${id}.path`))
      : fingerprintValue(requireObject(fixture.generator, `fixture ${id}.generator`));
    if (actualFingerprint !== expectedFingerprint) {
      throw new Error(`Fixture ${id} fingerprint changed: expected ${expectedFingerprint}, received ${actualFingerprint}.`);
    }
    fingerprints.set(id, actualFingerprint);
  }

  const capabilityIds = new Set();
  const artifactKinds = new Set();
  const taskIds = new Set();
  for (const [index, value] of manifest.tasks.entries()) {
    const task = requireObject(value, `manifest.tasks[${index}]`);
    const id = requireString(task.id, `manifest.tasks[${index}].id`);
    taskIds.add(id);
    const fixtureId = requireString(task.fixtureId, `task ${id}.fixtureId`);
    if (!fixtureIds.has(fixtureId)) throw new Error(`Task ${id} references unknown fixture ${fixtureId}.`);
    capabilityIds.add(requireString(task.capabilityId, `task ${id}.capabilityId`));
    artifactKinds.add(requireString(task.expectedArtifact, `task ${id}.expectedArtifact`));
    requireString(task.prompt, `task ${id}.prompt`);
    requireStringArray(task.allowedTools, `task ${id}.allowedTools`);
    requireStringArray(task.hardFailures, `task ${id}.hardFailures`);
    if (!Array.isArray(task.scores) || task.scores.length === 0) {
      throw new Error(`task ${id}.scores must be a non-empty array.`);
    }
    requireUniqueIds(task.scores, `task ${id}.scores`);
    const points = task.scores.reduce((sum, score, scoreIndex) => {
      const item = requireObject(score, `task ${id}.scores[${scoreIndex}]`);
      if (!Number.isInteger(item.points) || item.points <= 0) {
        throw new Error(`task ${id}.scores[${scoreIndex}].points must be a positive integer.`);
      }
      requireString(item.check, `task ${id}.scores[${scoreIndex}].check`);
      return sum + item.points;
    }, 0);
    if (points !== 100) throw new Error(`Task ${id} score weights must total 100, received ${points}.`);
  }

  if (!Array.isArray(manifest.criticCases) || manifest.criticCases.length === 0) {
    throw new Error("manifest.criticCases must be a non-empty array.");
  }
  requireUniqueIds(manifest.criticCases, "manifest.criticCases");
  const criticCategories = new Set([
    "coverage",
    "contradictions",
    "unsupported-claims",
    "missed-relationships",
  ]);
  for (const [index, value] of manifest.criticCases.entries()) {
    const criticCase = requireObject(value, `manifest.criticCases[${index}]`);
    const id = requireString(criticCase.id, `manifest.criticCases[${index}].id`);
    const taskId = requireString(criticCase.taskId, `critic case ${id}.taskId`);
    if (!taskIds.has(taskId)) throw new Error(`Critic case ${id} references unknown task ${taskId}.`);
    requireString(criticCase.seededDefect, `critic case ${id}.seededDefect`);
    const category = requireString(criticCase.expectedCategory, `critic case ${id}.expectedCategory`);
    if (!criticCategories.has(category)) {
      throw new Error(`Critic case ${id} uses an unsupported category.`);
    }
    const referenceKinds = requireStringArray(
      criticCase.requiredReferenceKinds,
      `critic case ${id}.requiredReferenceKinds`,
    );
    if (referenceKinds.some((kind) => !["field", "concept", "source"].includes(kind))) {
      throw new Error(`Critic case ${id} uses an unsupported reference kind.`);
    }
    if (!["concerns-found", "inconclusive"].includes(criticCase.expectedOutcome)) {
      throw new Error(`Critic case ${id} must expect a concern or an inconclusive result.`);
    }
    if (typeof criticCase.deterministicCompletionBlocked !== "boolean") {
      throw new Error(`Critic case ${id}.deterministicCompletionBlocked must be boolean.`);
    }
    if (criticCase.criticMayOverrideDeterministic !== false) {
      throw new Error(`Critic case ${id} must not let a critic override deterministic checks.`);
    }
    requireStringArray(criticCase.hardFailures, `critic case ${id}.hardFailures`);
  }

  return {
    fixtureCount: fixtureIds.size,
    taskCount: manifest.tasks.length,
    capabilityIds: [...capabilityIds].sort(),
    artifactKinds: [...artifactKinds].sort(),
    criticCaseCount: manifest.criticCases.length,
    fingerprints: Object.fromEntries([...fingerprints].sort()),
  };
}

export function checkCorpus(path = defaultManifestPath) {
  const manifest = loadManifest(path);
  const summary = validateManifest(manifest);
  const capabilitySummary = validateCapabilityCoverage(manifest, loadCapabilityManifest());
  return { ...summary, ...capabilitySummary };
}

function runCli() {
  const command = process.argv[2] ?? "check";
  if (command === "check") {
    const summary = checkCorpus(process.argv[3] ? resolve(process.argv[3]) : defaultManifestPath);
    process.stdout.write(`OKF agent benchmark: ${summary.fixtureCount} frozen fixtures, ${summary.taskCount} task contracts, ${summary.criticCaseCount} critic contracts, ${summary.curatedCapabilityCount} curated capabilities.\n`);
    return;
  }
  if (command === "fingerprints") {
    const manifest = loadManifest(process.argv[3] ? resolve(process.argv[3]) : defaultManifestPath);
    for (const fixture of manifest.fixtures) {
      const fingerprint = fixture.kind === "bundle"
        ? fingerprintDirectory(resolveInside(benchmarkRoot, fixture.path, `fixture ${fixture.id}.path`))
        : fingerprintValue(fixture.generator);
      process.stdout.write(`${fixture.id} ${fingerprint}\n`);
    }
    return;
  }
  throw new Error(`Unknown benchmark command: ${command}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    runCli();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
