import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  defaultWritingCorpusPath,
  loadManifest,
  validateManifest,
  validateWritingCorpus,
} from "./okf-agent-benchmark.mjs";

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function boundedLabel(value, name) {
  if (!value || value.length > 128 || !/^[A-Za-z0-9._:/ -]+$/u.test(value)) {
    throw new Error(`${name} must be a bounded display label.`);
  }
  return value;
}

const provider = boundedLabel(argument("--provider"), "provider");
const model = boundedLabel(argument("--model"), "model");
const output = argument("--output");
if (!output) throw new Error("--output is required.");

const manifest = loadManifest();
const summary = validateManifest(manifest);
const writingCorpus = JSON.parse(readFileSync(defaultWritingCorpusPath, "utf8"));
const writingSummary = validateWritingCorpus(writingCorpus);
const writingCaseIds = writingCorpus.cases.map((writingCase) => writingCase.id);
const plan = {
  schemaVersion: 1,
  benchmarkSchemaVersion: manifest.schemaVersion,
  createdAt: new Date().toISOString(),
  provider,
  model,
  status: "not-run",
  limitations: [
    "This workflow records an explicit provider evaluation plan; it does not treat missing credentials, provider access, or model output as a pass.",
    "Blind preference remains a human decision. Model critique may be retained only as a labelled secondary signal.",
  ],
  corpus: {
    fixtureCount: summary.fixtureCount,
    taskCount: summary.taskCount,
    criticCaseCount: summary.criticCaseCount,
    writingCaseCount: writingSummary.writingCaseCount,
    writingPreferenceThreshold: writingSummary.writingPreferenceThreshold,
  },
  tasks: manifest.tasks.map((task) => ({
    taskId: task.id,
    fixtureId: task.fixtureId,
    capabilityId: task.capabilityId,
    expectedArtifact: task.expectedArtifact,
    status: "not-run",
  })),
  writingEvaluation: {
    status: "not-run",
    hardRequirements: [
      "required knowledge retained",
      "qualifications retained",
      "citations retained",
      "links retained",
      "zero unsupported claims",
    ],
    runs: [
      { run: 1, order: writingCaseIds },
      { run: 2, order: [...writingCaseIds].reverse() },
    ],
    blindReview: {
      dimensions: writingCorpus.review.dimensions,
      threshold: writingSummary.writingPreferenceThreshold,
      status: "not-run",
    },
  },
};

const target = resolve(output);
mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
process.stdout.write(`Provider evaluation plan written for ${provider} / ${model}; no live result was claimed.\n`);
