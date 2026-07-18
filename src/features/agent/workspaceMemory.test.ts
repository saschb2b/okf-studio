import {
  activeMemoryOmissions,
  createOmissionPreference,
  createTaskRecord,
  memoryEnvelope,
  parseWorkspaceMemory,
  upsertWorkspaceMemory,
} from "@/features/agent/workspaceMemory.ts";

describe("workspace memory", () => {
  const NOW = 1_000_000;

  it("attaches only a current bundle-scoped preference", () => {
    const preference = createOmissionPreference({
      bundleRoot: "C:/bundles/docs",
      taskId: "okf-audit",
      conceptId: "features/agent-panel",
      conceptTitle: "Agent Panel",
      validationFingerprint: "revision-current",
      now: NOW,
    });
    expect(activeMemoryOmissions(
      [preference],
      "C:/bundles/docs",
      "okf-audit",
      "revision-current",
    )).toEqual(new Set(["bundle-object:features/agent-panel"]));
    expect(activeMemoryOmissions(
      [preference],
      "C:/bundles/docs",
      "okf-audit",
      "revision-changed",
    )).toEqual(new Set());
  });

  it("quarantines corrupt, expired, and over-limit records without rejecting valid memory", () => {
    const task = createTaskRecord({
      bundleRoot: "C:/bundles/docs",
      taskId: "okf-repair",
      validationFingerprint: "revision-current",
      now: NOW,
    });
    const parsed = parseWorkspaceMemory({
      schemaVersion: 1,
      items: [task, { ...task, id: "bad\nrecord" }, {
        ...task,
        id: "task:expired",
        createdAt: 1,
        lastValidatedAt: 1,
        retentionDays: 1,
      }],
    }, NOW + 2 * 86_400_000);
    expect(parsed.items).toEqual([task]);
    expect(parsed.rejectedCount).toBe(2);
  });

  it("replaces a preference deterministically and keeps the schema body-free", () => {
    const original = createOmissionPreference({
      bundleRoot: "C:/bundles/docs",
      taskId: "okf-research",
      conceptId: "product/overview",
      conceptTitle: "Overview",
      validationFingerprint: "revision-1",
      now: NOW,
    });
    const refreshed = createOmissionPreference({
      bundleRoot: "C:/bundles/docs",
      taskId: "okf-research",
      conceptId: "product/overview",
      conceptTitle: "Overview",
      validationFingerprint: "revision-2",
      now: NOW + 1,
    });
    const items = upsertWorkspaceMemory([original], refreshed, NOW + 1);
    expect(items).toEqual([refreshed]);
    expect(JSON.stringify(memoryEnvelope(items))).not.toMatch(/prompt|response|citation|staged/i);
  });

  it("stops changing future context plans as soon as the preference is deleted", () => {
    const preference = createOmissionPreference({
      bundleRoot: "C:/bundles/docs",
      taskId: "okf-audit",
      conceptId: "features/agent-panel",
      conceptTitle: "Agent Panel",
      validationFingerprint: "revision-current",
      now: NOW,
    });
    expect(activeMemoryOmissions(
      [preference],
      "C:/bundles/docs",
      "okf-audit",
      "revision-current",
    )).toEqual(new Set(["bundle-object:features/agent-panel"]));
    expect(activeMemoryOmissions(
      [],
      "C:/bundles/docs",
      "okf-audit",
      "revision-current",
    )).toEqual(new Set());
  });
});
