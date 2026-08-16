import { createHash } from "node:crypto";
import { linkSync, lstatSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { extname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = fileURLToPath(new URL(".", import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "..");
export const benchmarkRoot = resolve(scriptDirectory, "../benchmarks/okf-agent");
export const defaultManifestPath = resolve(benchmarkRoot, "manifest.json");
export const defaultProviderMatrixPath = resolve(benchmarkRoot, "provider-matrix.json");
export const defaultJourneyPath = resolve(benchmarkRoot, "journeys.json");
export const defaultArtifactScoringPath = resolve(benchmarkRoot, "artifact-scoring.json");
export const defaultWritingCorpusPath = resolve(benchmarkRoot, "writing-corpus.json");
// Studio owns the manifest; the vendored skill owns the instruction files it
// points at. The two were one directory until the skills tooling started
// rewriting that directory and deleting Studio's files with it.
export const capabilityRoot = resolve(scriptDirectory, "../.agents/skills/okf");
export const capabilityPackRoot = resolve(scriptDirectory, "../src-tauri/capability-pack/okf");
export const defaultCapabilityManifestPath = resolve(capabilityPackRoot, "capabilities.json");

const TEXT_FIXTURE_EXTENSIONS = new Set([
  ".csv",
  ".json",
  ".md",
  ".mdx",
  ".toml",
  ".txt",
  ".yaml",
  ".yml",
]);

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
    const contents = readFileSync(path);
    const fingerprintContents = TEXT_FIXTURE_EXTENSIONS.has(extname(path).toLowerCase())
      ? Buffer.from(contents.toString("utf8").replaceAll("\r\n", "\n"), "utf8")
      : contents;
    hash.update(portablePath, "utf8");
    hash.update("\0");
    hash.update(fingerprintContents);
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

function loadJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

const REQUIRED_PROVIDER_IDS = ["studio-agent", "codex-acp", "claude-acp", "local-model"];
const REQUIRED_JOURNEY_IDS = [
  "first-use",
  "object-action",
  "federated-search",
  "artifact-review",
  "memory",
  "routine",
  "os-entry",
];
const REQUIRED_TASK_CAPABILITY_IDS = [
  "okf-inspect",
  "okf-retrieve",
  "okf-create",
  "okf-enrich",
  "okf-audit",
  "okf-repair",
  "okf-research",
  "okf-change-impact",
  "okf-migrate",
  "okf-author",
  "okf-revise",
];
const ARTIFACT_KINDS = new Set([
  "source-inventory",
  "bundle-plan",
  "health-report",
  "research-brief",
  "change-impact-map",
  "migration-plan",
  "writing-revision",
  "staged-revision",
]);

const WRITING_STYLE_PATTERNS = [
  ["generic-opener", /\bin today's\b|\bwhen it comes to\b/i],
  ["transition-filler", /\bmoreover\b|\bfurthermore\b|\bit is important to note\b/i],
  ["inflated-language", /\brobust\b|\bseamless\b|\bleverage(?:s|d|ing)?\b|\bpowerful\b|\bindustry-leading\b/i],
  ["em-dash", /—/],
];

export function scoreWritingSample(sampleInput, contractInput) {
  const sample = requireString(sampleInput, "writing sample");
  const contract = requireObject(contractInput, "writing contract");
  const normalized = sample.toLocaleLowerCase("en");
  const failures = [];
  for (const fragment of requireStringArray(contract.requiredFragments, "writing contract.requiredFragments")) {
    if (!normalized.includes(fragment.toLocaleLowerCase("en"))) failures.push(`missing-fragment:${fragment}`);
  }
  for (const alternatives of contract.requiredAlternatives ?? []) {
    const accepted = requireStringArray(alternatives, "writing contract.requiredAlternatives entry");
    if (!accepted.some((fragment) => normalized.includes(fragment.toLocaleLowerCase("en")))) {
      failures.push(`missing-alternative:${accepted.join("|")}`);
    }
  }
  for (const citation of contract.requiredCitations ?? []) {
    if (!sample.includes(requireString(citation, "writing contract citation"))) failures.push(`missing-citation:${citation}`);
  }
  for (const link of contract.requiredLinks ?? []) {
    if (!sample.includes(requireString(link, "writing contract link"))) failures.push(`missing-link:${link}`);
  }
  for (const fragment of contract.unsupportedFragments ?? []) {
    const unsupported = requireString(fragment, "writing contract unsupported fragment");
    if (normalized.includes(unsupported.toLocaleLowerCase("en"))) failures.push(`unsupported:${unsupported}`);
  }
  for (const [id, pattern] of WRITING_STYLE_PATTERNS) {
    if (pattern.test(sample)) failures.push(id);
  }
  return failures.sort();
}

export function validateWritingCorpus(input) {
  const document = requireObject(input, "writing corpus");
  if (document.schemaVersion !== 1) throw new Error("writing corpus.schemaVersion must be 1.");
  const review = requireObject(document.review, "writing corpus.review");
  if (review.method !== "blind-pairwise") throw new Error("writing review must be blind-pairwise.");
  if (typeof review.minimumPreferenceRate !== "number"
    || review.minimumPreferenceRate <= 0.5
    || review.minimumPreferenceRate > 1) {
    throw new Error("writing review minimumPreferenceRate must be above 0.5 and at most 1.");
  }
  requireStringArray(review.dimensions, "writing review.dimensions");
  requireStringArray(review.hardGates, "writing review.hardGates");
  if (!Array.isArray(document.cases) || document.cases.length === 0) {
    throw new Error("writing corpus.cases must be a non-empty array.");
  }
  requireUniqueIds(document.cases, "writing corpus.cases");
  for (const value of document.cases) {
    const writingCase = requireObject(value, "writing case");
    const id = requireString(writingCase.id, "writing case.id");
    requireString(writingCase.kind, `writing case ${id}.kind`);
    requireString(writingCase.readerJob, `writing case ${id}.readerJob`);
    requireStringArray(writingCase.requiredFragments, `writing case ${id}.requiredFragments`);
    if (!Array.isArray(writingCase.requiredCitations)
      || !Array.isArray(writingCase.requiredLinks)
      || !Array.isArray(writingCase.unsupportedFragments)) {
      throw new Error(`Writing case ${id} reference contracts must be arrays.`);
    }
    if (writingCase.requiredAlternatives !== undefined) {
      if (!Array.isArray(writingCase.requiredAlternatives)) {
        throw new Error(`Writing case ${id} requiredAlternatives must be an array.`);
      }
      for (const alternatives of writingCase.requiredAlternatives) {
        requireStringArray(alternatives, `writing case ${id}.requiredAlternatives entry`);
      }
    }
    const baselineFailures = scoreWritingSample(writingCase.baseline, writingCase);
    const expectedBaseline = requireStringArray(
      writingCase.expectedBaselineFailures,
      `writing case ${id}.expectedBaselineFailures`,
    ).slice().sort();
    if (JSON.stringify(baselineFailures) !== JSON.stringify(expectedBaseline)) {
      throw new Error(`Writing case ${id} baseline score changed: ${baselineFailures.join(", ")}.`);
    }
    const referenceFailures = scoreWritingSample(writingCase.reference, writingCase);
    const expectedReference = Array.isArray(writingCase.expectedReferenceFailures)
      ? writingCase.expectedReferenceFailures.slice().sort()
      : null;
    if (!expectedReference || JSON.stringify(referenceFailures) !== JSON.stringify(expectedReference)) {
      throw new Error(`Writing case ${id} reference score changed: ${referenceFailures.join(", ")}.`);
    }
  }
  return {
    writingCaseCount: document.cases.length,
    writingPreferenceThreshold: review.minimumPreferenceRate,
  };
}

export function validateProviderMatrix(input) {
  const matrix = requireObject(input, "provider matrix");
  if (matrix.schemaVersion !== 1) throw new Error("provider matrix.schemaVersion must be 1.");
  requireString(matrix.appVersion, "provider matrix.appVersion");
  if (!Array.isArray(matrix.providers)) throw new Error("provider matrix.providers must be an array.");
  requireUniqueIds(matrix.providers, "provider matrix.providers");
  const providers = new Map(matrix.providers.map((provider) => [provider.id, provider]));
  for (const id of REQUIRED_PROVIDER_IDS) {
    const provider = requireObject(providers.get(id), `provider ${id}`);
    requireString(provider.name, `provider ${id}.name`);
    requireString(provider.integration, `provider ${id}.integration`);
    requireString(provider.availability, `provider ${id}.availability`);
    const support = requireObject(provider.taskSupport, `provider ${id}.taskSupport`);
    const taskIds = Object.keys(support).sort();
    if (JSON.stringify(taskIds) !== JSON.stringify(REQUIRED_TASK_CAPABILITY_IDS.slice().sort())) {
      throw new Error(`Provider ${id} must classify every OKF task exactly once.`);
    }
    for (const [taskId, state] of Object.entries(support)) {
      if (!new Set(["supported", "degraded", "unavailable"]).has(state)) {
        throw new Error(`Provider ${id} uses invalid support state for ${taskId}.`);
      }
    }
    if (!Array.isArray(provider.limitations)) throw new Error(`Provider ${id}.limitations must be an array.`);
    provider.limitations.forEach((value, index) => requireString(value, `provider ${id}.limitations[${index}]`));
    const baseline = requireObject(provider.baseline, `provider ${id}.baseline`);
    if (!new Set(["completed", "unavailable"]).has(baseline.status)) {
      throw new Error(`Provider ${id} baseline status is invalid.`);
    }
    if (baseline.status === "unavailable") {
      requireString(baseline.reason, `provider ${id}.baseline.reason`);
      if (baseline.reportPath !== null) throw new Error(`Unavailable provider ${id} cannot claim a report.`);
    } else {
      requireString(baseline.reportPath, `provider ${id}.baseline.reportPath`);
    }
  }
  if (providers.size !== REQUIRED_PROVIDER_IDS.length) {
    throw new Error("Provider matrix contains an undeclared provider.");
  }
  return { providerCount: providers.size };
}

export function validateJourneys(input) {
  const document = requireObject(input, "journey manifest");
  if (document.schemaVersion !== 1) throw new Error("journey manifest.schemaVersion must be 1.");
  if (!Array.isArray(document.journeys)) throw new Error("journey manifest.journeys must be an array.");
  requireUniqueIds(document.journeys, "journey manifest.journeys");
  const journeys = new Map(document.journeys.map((journey) => [journey.id, journey]));
  for (const id of REQUIRED_JOURNEY_IDS) {
    const journey = requireObject(journeys.get(id), `journey ${id}`);
    const story = requireObject(journey.story, `journey ${id}.story`);
    const storyPath = resolveInside(repositoryRoot, requireString(story.path, `journey ${id}.story.path`), `journey ${id}.story.path`);
    const exportName = requireString(story.exportName, `journey ${id}.story.exportName`);
    if (!readFileSync(storyPath, "utf8").includes(`export const ${exportName}`)) {
      throw new Error(`Journey ${id} story export is missing.`);
    }
    const testEvidence = requireObject(journey.test, `journey ${id}.test`);
    const testPath = resolveInside(repositoryRoot, requireString(testEvidence.path, `journey ${id}.test.path`), `journey ${id}.test.path`);
    const pattern = requireString(testEvidence.contains, `journey ${id}.test.contains`);
    if (!readFileSync(testPath, "utf8").includes(pattern)) {
      throw new Error(`Journey ${id} test evidence is missing.`);
    }
  }
  if (journeys.size !== REQUIRED_JOURNEY_IDS.length) {
    throw new Error("Journey manifest contains an undeclared journey.");
  }
  return { journeyCount: journeys.size };
}

export function scoreArtifact(artifactInput) {
  const failures = [];
  const artifact = requireObject(artifactInput, "artifact scoring input");
  if (artifact.schemaVersion !== 1) failures.push("schema-version");
  if (!ARTIFACT_KINDS.has(artifact.artifactKind)) failures.push("artifact-kind");
  if (artifact.bundleFingerprint !== artifact.expectedBundleFingerprint) failures.push("bundle-fingerprint");

  const sources = Array.isArray(artifact.sources) ? artifact.sources : [];
  const sourceIds = new Set(sources.map((source) => source?.id).filter((id) => typeof id === "string"));
  const citations = Array.isArray(artifact.citations) ? artifact.citations : [];
  if (citations.some((citation) => !sourceIds.has(citation?.sourceId))) failures.push("citation-source");

  const conceptIds = Array.isArray(artifact.conceptIds) ? artifact.conceptIds : [];
  if (conceptIds.some((id) => !isPortableRelativeId(id))) failures.push("concept-identity");
  const proposedPaths = Array.isArray(artifact.proposedPaths) ? artifact.proposedPaths : [];
  if (proposedPaths.some((path) => !isPortableRelativeId(path) || !path.endsWith(".md"))) {
    failures.push("path-boundary");
  }
  if (Array.isArray(artifact.safetyViolations) && artifact.safetyViolations.length > 0) {
    failures.push("safety-violation");
  }
  return failures.sort();
}

function isPortableRelativeId(value) {
  return typeof value === "string"
    && value.length > 0
    && value.length <= 2048
    && !value.includes("\\")
    && !value.startsWith("/")
    && !value.split("/").some((segment) => segment === "" || segment === "." || segment === "..");
}

export function validateArtifactScoring(input) {
  const document = requireObject(input, "artifact scoring manifest");
  if (document.schemaVersion !== 1) throw new Error("artifact scoring schemaVersion must be 1.");
  if (!Array.isArray(document.cases) || document.cases.length === 0) {
    throw new Error("artifact scoring cases must be a non-empty array.");
  }
  requireUniqueIds(document.cases, "artifact scoring cases");
  for (const scoringCase of document.cases) {
    const expected = Array.isArray(scoringCase.expectedFailures)
      ? scoringCase.expectedFailures.slice().sort()
      : null;
    if (!expected) throw new Error(`Artifact case ${scoringCase.id} needs expected failures.`);
    const actual = scoreArtifact(scoringCase.artifact);
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(`Artifact case ${scoringCase.id} score changed: ${actual.join(", ")}.`);
    }
  }
  return { artifactScoringCaseCount: document.cases.length };
}

export function validateProviderReport(input) {
  const report = requireObject(input, "provider report");
  if (report.schemaVersion !== 1) throw new Error("provider report.schemaVersion must be 1.");
  const reportId = requireString(report.reportId, "provider report.reportId");
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(reportId)) throw new Error("provider report.reportId is invalid.");
  requireString(report.createdAt, "provider report.createdAt");
  if (Number.isNaN(Date.parse(report.createdAt))) throw new Error("provider report.createdAt is invalid.");
  requireString(report.appVersion, "provider report.appVersion");
  requireString(report.benchmarkVersion, "provider report.benchmarkVersion");
  const pack = requireObject(report.pack, "provider report.pack");
  requireString(pack.id, "provider report.pack.id");
  requireString(pack.version, "provider report.pack.version");
  if (!/^[a-f0-9]{64}$/.test(requireString(pack.sha256, "provider report.pack.sha256"))) {
    throw new Error("provider report.pack.sha256 is invalid.");
  }
  const provider = requireObject(report.provider, "provider report.provider");
  if (!REQUIRED_PROVIDER_IDS.includes(requireString(provider.id, "provider report.provider.id"))) {
    throw new Error("provider report.provider.id is unsupported.");
  }
  if (!new Set(["completed", "unavailable"]).has(provider.status)) {
    throw new Error("provider report.provider.status is invalid.");
  }
  if (provider.status === "completed") requireString(provider.model, "provider report.provider.model");
  if (provider.status === "unavailable") requireString(provider.reason, "provider report.provider.reason");
  const fixtureFingerprints = requireObject(report.fixtureFingerprints, "provider report.fixtureFingerprints");
  const expectedFixtures = Object.fromEntries(loadManifest().fixtures.map((fixture) => [fixture.id, fixture.sha256]));
  if (JSON.stringify(Object.entries(fixtureFingerprints).sort())
    !== JSON.stringify(Object.entries(expectedFixtures).sort())) {
    throw new Error("provider report fixture fingerprints do not match the frozen corpus.");
  }
  const capabilityVersions = requireObject(report.capabilityVersions, "provider report.capabilityVersions");
  const expectedCapabilities = Object.fromEntries(loadCapabilityManifest().capabilities.map(
    (capability) => [capability.id, capability.version],
  ));
  if (JSON.stringify(Object.entries(capabilityVersions).sort())
    !== JSON.stringify(Object.entries(expectedCapabilities).sort())) {
    throw new Error("provider report capability versions do not match the shipped catalog.");
  }
  if (!Array.isArray(report.deliveredResources)
    || report.deliveredResources.some((value) => typeof value !== "string")
    || new Set(report.deliveredResources).size !== report.deliveredResources.length) {
    throw new Error("provider report.deliveredResources must be a unique string array.");
  }
  if (!Array.isArray(report.tasks) || report.tasks.length !== REQUIRED_TASK_CAPABILITY_IDS.length) {
    throw new Error("provider report must retain every benchmark task.");
  }
  requireUniqueIds(report.tasks, "provider report.tasks");
  const taskIds = report.tasks.map((task) => task.id).sort();
  if (JSON.stringify(taskIds) !== JSON.stringify(REQUIRED_TASK_CAPABILITY_IDS.slice().sort())) {
    throw new Error("provider report task IDs do not match the benchmark matrix.");
  }
  for (const task of report.tasks) {
    if (!new Set(["completed", "failed", "unavailable"]).has(task.status)) {
      throw new Error(`Provider report task ${task.id} status is invalid.`);
    }
    for (const field of ["contextBytes", "toolCallCount", "invalidClaimCount", "timingMs"]) {
      if (!Number.isInteger(task[field]) || task[field] < 0) {
        throw new Error(`Provider report task ${task.id}.${field} is invalid.`);
      }
    }
    if (task.deterministicScore !== null
      && (!Number.isInteger(task.deterministicScore)
        || task.deterministicScore < 0
        || task.deterministicScore > 100)) {
      throw new Error(`Provider report task ${task.id}.deterministicScore is invalid.`);
    }
    if (typeof task.artifactValid !== "boolean") {
      throw new Error(`Provider report task ${task.id}.artifactValid is invalid.`);
    }
    if (!Array.isArray(task.hardFailures) || !Array.isArray(task.observedTools)) {
      throw new Error(`Provider report task ${task.id} evidence is invalid.`);
    }
    if (task.cost !== null) {
      const cost = requireObject(task.cost, `provider report task ${task.id}.cost`);
      if (typeof cost.value !== "number" || cost.value < 0) {
        throw new Error(`Provider report task ${task.id}.cost is invalid.`);
      }
      requireString(cost.currency, `provider report task ${task.id}.cost.currency`);
    }
  }
  const writingEvaluation = requireObject(report.writingEvaluation, "provider report.writingEvaluation");
  if (!new Set(["completed", "unavailable"]).has(writingEvaluation.status)) {
    throw new Error("provider report.writingEvaluation.status is invalid.");
  }
  if (writingEvaluation.status === "unavailable") {
    requireString(writingEvaluation.reason, "provider report.writingEvaluation.reason");
    if (writingEvaluation.cases !== null || writingEvaluation.blindReview !== null) {
      throw new Error("Unavailable writing evaluation cannot claim case or review results.");
    }
  } else {
    const corpus = loadJson(defaultWritingCorpusPath);
    const expectedIds = corpus.cases.map((writingCase) => writingCase.id).sort();
    if (!Array.isArray(writingEvaluation.cases)) {
      throw new Error("Completed writing evaluation requires case results.");
    }
    requireUniqueIds(writingEvaluation.cases, "provider report writing cases");
    if (JSON.stringify(writingEvaluation.cases.map((writingCase) => writingCase.id).sort())
      !== JSON.stringify(expectedIds)) {
      throw new Error("Provider writing cases do not match the frozen corpus.");
    }
    for (const writingCase of writingEvaluation.cases) {
      for (const field of ["unsupportedClaimCount", "writingFindingCount"]) {
        if (!Number.isInteger(writingCase[field]) || writingCase[field] < 0) {
          throw new Error(`Provider writing case ${writingCase.id}.${field} is invalid.`);
        }
      }
      for (const field of [
        "requiredKnowledgeRetained",
        "qualificationsRetained",
        "citationsRetained",
        "linksRetained",
      ]) {
        if (typeof writingCase[field] !== "boolean") {
          throw new Error(`Provider writing case ${writingCase.id}.${field} is invalid.`);
        }
      }
      requireString(writingCase.outputSha256, `provider writing case ${writingCase.id}.outputSha256`);
      if (!/^[a-f0-9]{64}$/.test(writingCase.outputSha256)) {
        throw new Error(`Provider writing case ${writingCase.id}.outputSha256 is invalid.`);
      }
    }
    const blindReview = requireObject(writingEvaluation.blindReview, "provider writing blind review");
    if (blindReview.blinded !== true
      || !Number.isInteger(blindReview.comparisonCount)
      || blindReview.comparisonCount <= 0
      || typeof blindReview.preferenceRate !== "number"
      || blindReview.preferenceRate < corpus.review.minimumPreferenceRate
      || blindReview.preferenceRate > 1) {
      throw new Error("Provider writing blind review does not meet the frozen threshold.");
    }
    if (writingEvaluation.cases.some((writingCase) =>
      !writingCase.requiredKnowledgeRetained
      || !writingCase.qualificationsRetained
      || !writingCase.citationsRetained
      || !writingCase.linksRetained
      || writingCase.unsupportedClaimCount !== 0
    )) {
      throw new Error("Provider writing evaluation has a hard fact-preservation failure.");
    }
  }
  return report;
}

export function writeProviderReport(input, appDataRoot) {
  const report = validateProviderReport(input);
  const directory = resolve(appDataRoot, "agent-benchmarks");
  mkdirSync(directory, { recursive: true });
  const destination = resolveInside(directory, `${report.reportId}.json`, "provider report destination");
  const temporary = resolveInside(directory, `.${report.reportId}.tmp`, "provider report temporary path");
  writeFileSync(temporary, `${JSON.stringify(report, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  try {
    linkSync(temporary, destination);
  } finally {
    unlinkSync(temporary);
  }
  return destination;
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
  const providerSummary = validateProviderMatrix(loadJson(defaultProviderMatrixPath));
  const journeySummary = validateJourneys(loadJson(defaultJourneyPath));
  const scoringSummary = validateArtifactScoring(loadJson(defaultArtifactScoringPath));
  const writingSummary = validateWritingCorpus(loadJson(defaultWritingCorpusPath));
  return { ...summary, ...capabilitySummary, ...providerSummary, ...journeySummary, ...scoringSummary, ...writingSummary };
}

function runCli() {
  const command = process.argv[2] ?? "check";
  if (command === "check") {
    const summary = checkCorpus(process.argv[3] ? resolve(process.argv[3]) : defaultManifestPath);
    process.stdout.write(`OKF agent benchmark: ${summary.fixtureCount} frozen fixtures, ${summary.taskCount} task contracts, ${summary.criticCaseCount} critic contracts, ${summary.curatedCapabilityCount} curated capabilities, ${summary.providerCount} provider rows, ${summary.journeyCount} journeys, ${summary.artifactScoringCaseCount} artifact scoring cases, ${summary.writingCaseCount} writing cases.\n`);
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
  if (command === "record") {
    const inputPath = process.argv[3];
    const appDataRoot = process.argv[4];
    if (!inputPath || !appDataRoot) {
      throw new Error("record requires a provider-report JSON file and an explicit app-data root.");
    }
    const destination = writeProviderReport(loadJson(resolve(inputPath)), resolve(appDataRoot));
    process.stdout.write(`Stored OKF provider report at ${destination}.\n`);
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
