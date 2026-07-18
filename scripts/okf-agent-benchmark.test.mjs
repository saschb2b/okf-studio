import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  checkCorpus,
  defaultArtifactScoringPath,
  defaultJourneyPath,
  defaultProviderMatrixPath,
  loadCapabilityManifest,
  loadManifest,
  scoreArtifact,
  validateArtifactScoring,
  validateCapabilityCoverage,
  validateJourneys,
  validateManifest,
  validateProviderMatrix,
  validateProviderReport,
  writeProviderReport,
} from "./okf-agent-benchmark.mjs";

test("accepts the frozen OKF task and fixture contract", () => {
  const summary = checkCorpus();

  assert.equal(summary.fixtureCount, 6);
  assert.equal(summary.taskCount, 8);
  assert.equal(summary.curatedCapabilityCount, 8);
  assert.equal(summary.criticCaseCount, 2);
  assert.equal(summary.providerCount, 4);
  assert.equal(summary.journeyCount, 7);
  assert.equal(summary.artifactScoringCaseCount, 3);
  assert.deepEqual(summary.capabilityIds, [
    "okf-audit",
    "okf-create",
    "okf-enrich",
    "okf-inspect",
    "okf-migrate",
    "okf-repair",
    "okf-research",
    "okf-change-impact",
  ].sort());
  assert.deepEqual(summary.artifactKinds, [
    "bundle-plan",
    "change-impact-map",
    "health-report",
    "migration-plan",
    "research-brief",
    "staged-revision",
  ].sort());
});

test("requires an explicit support classification and honest baseline for every provider", () => {
  const matrix = JSON.parse(readFileSync(defaultProviderMatrixPath, "utf8"));
  delete matrix.providers[0].taskSupport["okf-audit"];
  assert.throws(
    () => validateProviderMatrix(matrix),
    /must classify every OKF task exactly once/,
  );

  const falseReport = JSON.parse(readFileSync(defaultProviderMatrixPath, "utf8"));
  falseReport.providers[1].baseline.reportPath = "reports/codex.json";
  assert.throws(
    () => validateProviderMatrix(falseReport),
    /cannot claim a report/,
  );
});

test("binds every completion journey to a real story and automated test", () => {
  const journeys = JSON.parse(readFileSync(defaultJourneyPath, "utf8"));
  journeys.journeys[0].story.exportName = "MissingFirstUse";
  assert.throws(
    () => validateJourneys(journeys),
    /story export is missing/,
  );
});

test("artifact scoring is stable across shuffled case order", () => {
  const scoring = JSON.parse(readFileSync(defaultArtifactScoringPath, "utf8"));
  assert.equal(validateArtifactScoring(scoring).artifactScoringCaseCount, 3);
  const score = (cases) => Object.fromEntries(cases.map((entry) => [
    entry.id,
    scoreArtifact(entry.artifact),
  ]).sort(([left], [right]) => left.localeCompare(right, "en")));
  const forward = score(scoring.cases);
  const shuffled = score([scoring.cases[2], scoring.cases[0], scoring.cases[1]]);
  assert.deepEqual(shuffled, forward);
  assert.deepEqual(forward["fluent-but-unsafe"], [
    "bundle-fingerprint",
    "citation-source",
    "path-boundary",
    "safety-violation",
  ]);
});

test("retains an unavailable provider report locally without inventing measurements", () => {
  const manifest = loadManifest();
  const capabilities = loadCapabilityManifest();
  const report = {
    schemaVersion: 1,
    reportId: "clean-machine-studio-agent",
    createdAt: "2026-07-18T15:00:00Z",
    appVersion: "0.3.0",
    benchmarkVersion: String(manifest.schemaVersion),
    pack: {
      id: "okf-foundation",
      version: "1.0.0",
      sha256: "8f42bf715678a0219ccb7213a96e81aa6c6911a0a5b95f6eddfe19a5e9c5637d",
    },
    provider: {
      id: "studio-agent",
      status: "unavailable",
      model: null,
      reason: "No native model endpoint is configured.",
    },
    fixtureFingerprints: Object.fromEntries(manifest.fixtures.map((fixture) => [fixture.id, fixture.sha256])),
    capabilityVersions: Object.fromEntries(capabilities.capabilities.map((capability) => [capability.id, capability.version])),
    deliveredResources: [],
    tasks: manifest.tasks.map((task) => ({
      id: task.capabilityId,
      status: "unavailable",
      contextBytes: 0,
      toolCallCount: 0,
      invalidClaimCount: 0,
      timingMs: 0,
      deterministicScore: null,
      artifactValid: false,
      hardFailures: [],
      observedTools: [],
      cost: null,
    })),
  };
  assert.equal(validateProviderReport(report).provider.status, "unavailable");
  const root = mkdtempSync(join(tmpdir(), "okf-agent-report-"));
  const destination = writeProviderReport(report, root);
  assert.deepEqual(JSON.parse(readFileSync(destination, "utf8")), report);
  assert.throws(() => writeProviderReport(report, root));
  rmSync(root, { recursive: true, force: true });
});

test("rejects a benchmark task whose capability is disabled or absent", () => {
  const benchmark = structuredClone(loadManifest());
  const capabilities = structuredClone(loadCapabilityManifest());
  capabilities.capabilities = capabilities.capabilities.filter(
    (capability) => capability.id !== benchmark.tasks[0].capabilityId,
  );

  assert.throws(
    () => validateCapabilityCoverage(benchmark, capabilities),
    /references unshipped capability/,
  );
});

test("rejects tool drift between a task and its capability", () => {
  const benchmark = structuredClone(loadManifest());
  benchmark.tasks[0].allowedTools.push("okf_validate");

  assert.throws(
    () => validateCapabilityCoverage(benchmark, loadCapabilityManifest()),
    /tools do not match/,
  );
});

test("rejects a changed fixture fingerprint", () => {
  const manifest = structuredClone(loadManifest());
  manifest.fixtures[0].sha256 = "0".repeat(64);

  assert.throws(
    () => validateManifest(manifest),
    /Fixture conformant-linked fingerprint changed/,
  );
});

test("rejects a task that references an unknown fixture", () => {
  const manifest = structuredClone(loadManifest());
  manifest.tasks[0].fixtureId = "missing-fixture";

  assert.throws(
    () => validateManifest(manifest),
    /Task inspect-linked references unknown fixture missing-fixture/,
  );
});

test("rejects fixture paths outside the benchmark directory", () => {
  const manifest = structuredClone(loadManifest());
  manifest.fixtures[0].path = "../../docs";

  assert.throws(
    () => validateManifest(manifest),
    /fixture conformant-linked\.path must stay inside the benchmark directory/,
  );
});

test("rejects score weights that do not total 100", () => {
  const manifest = structuredClone(loadManifest());
  manifest.tasks[0].scores[0].points = 39;

  assert.throws(
    () => validateManifest(manifest),
    /Task inspect-linked score weights must total 100, received 99/,
  );
});

test("rejects a critic contract without resolvable claim reference kinds", () => {
  const manifest = structuredClone(loadManifest());
  manifest.criticCases[0].requiredReferenceKinds = ["paragraph"];

  assert.throws(
    () => validateManifest(manifest),
    /uses an unsupported reference kind/,
  );
});

test("rejects critic authority over deterministic completion", () => {
  const manifest = structuredClone(loadManifest());
  manifest.criticCases[0].criticMayOverrideDeterministic = true;

  assert.throws(
    () => validateManifest(manifest),
    /must not let a critic override deterministic checks/,
  );
});
