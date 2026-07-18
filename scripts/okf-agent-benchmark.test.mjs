import assert from "node:assert/strict";
import { test } from "node:test";
import {
  checkCorpus,
  loadCapabilityManifest,
  loadManifest,
  validateCapabilityCoverage,
  validateManifest,
} from "./okf-agent-benchmark.mjs";

test("accepts the frozen OKF task and fixture contract", () => {
  const summary = checkCorpus();

  assert.equal(summary.fixtureCount, 6);
  assert.equal(summary.taskCount, 8);
  assert.equal(summary.curatedCapabilityCount, 8);
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
