import { describe, expect, it } from "vitest";
import {
  AGENT_THREAD_METADATA_CAP,
  createAgentThreadMetadata,
  parseAgentThreadMetadata,
  removeAgentThreadMetadata,
  upsertAgentThreadMetadata,
} from "@/features/agent/threadMetadata.ts";
import { acceptOkfContextPlan, createOkfContextPlan } from "@/features/agent/taskContext.ts";

const BASE = {
  bundleRoot: "C:\\knowledge\\docs",
  profileId: "codex",
  sessionId: "session-1",
  title: "Bundle research",
};

describe("agent thread metadata", () => {
  it("normalizes titles and rejects invalid persisted fields", () => {
    expect(createAgentThreadMetadata({ ...BASE, title: "  Bundle   research  " }, 42)).toEqual({
      ...BASE,
      title: "Bundle research",
      archived: false,
      taskId: null,
      contextManifest: null,
      updatedAt: 42,
    });
    expect(() => createAgentThreadMetadata({ ...BASE, sessionId: "bad\nsession" }))
      .toThrow("invalid or exceeds");
    expect(parseAgentThreadMetadata([
      { ...BASE, updatedAt: 2 },
      { ...BASE, sessionId: "another-session", updatedAt: 1 },
      { ...BASE, title: "older duplicate", updatedAt: 0 },
      { ...BASE, sessionId: "", updatedAt: 3 },
      { ...BASE, title: "tampered", updatedAt: Number.POSITIVE_INFINITY },
      { ...BASE, bundleRoot: "C:\\knowledge\\research", workflow: "unknown", updatedAt: 4 },
    ])).toEqual([
      { ...BASE, archived: false, taskId: null, contextManifest: null, updatedAt: 2 },
      {
        ...BASE,
        sessionId: "another-session",
        archived: false,
        taskId: null,
        contextManifest: null,
        updatedAt: 1,
      },
    ]);
  });

  it("keeps a bounded recent list and replaces only the matching session", () => {
    let metadata = Array.from({ length: AGENT_THREAD_METADATA_CAP }, (_, index) =>
      createAgentThreadMetadata({
        ...BASE,
        bundleRoot: `C:\\knowledge\\bundle-${index}`,
        sessionId: `session-${index}`,
      }, index)
    );
    metadata = upsertAgentThreadMetadata(
      metadata,
      createAgentThreadMetadata(BASE, 99),
    );
    const replacement = createAgentThreadMetadata({
      ...BASE,
      sessionId: "session-latest",
      archived: true,
    }, 100);
    metadata = upsertAgentThreadMetadata(metadata, replacement);

    expect(metadata).toHaveLength(AGENT_THREAD_METADATA_CAP);
    expect(metadata[0]).toEqual(replacement);
    expect(metadata.filter((item) =>
      item.bundleRoot === BASE.bundleRoot && item.profileId === BASE.profileId
    )).toHaveLength(2);
    expect(removeAgentThreadMetadata(
      metadata,
      BASE.bundleRoot,
      BASE.profileId,
      replacement.sessionId,
    ))
      .not.toContainEqual(replacement);
  });

  it("migrates legacy workflows to stable task IDs", () => {
    for (const [workflow, taskId] of [
      ["create-bundle", "okf-create"],
      ["enhance-bundle", "okf-enrich"],
    ] as const) {
      expect(parseAgentThreadMetadata([{ ...BASE, workflow, updatedAt: 42 }]))
        .toEqual([{
          ...BASE,
          archived: false,
          taskId,
          contextManifest: null,
          updatedAt: 42,
        }]);
    }
  });

  it("persists the accepted context manifest with its task", () => {
    const contextManifest = acceptOkfContextPlan(createOkfContextPlan({
      taskId: "okf-research",
      bundleRoot: BASE.bundleRoot,
      concepts: [],
      activeConcept: null,
      attachedConcepts: [],
      sources: [],
      issues: [],
    }));
    const metadata = createAgentThreadMetadata({
      ...BASE,
      taskId: "okf-research",
      contextManifest,
    }, 42);

    expect(parseAgentThreadMetadata([metadata])).toEqual([metadata]);
    expect(parseAgentThreadMetadata([{
      ...metadata,
      taskId: "okf-audit",
    }])).toEqual([]);
    expect(parseAgentThreadMetadata([{
      ...metadata,
      contextManifest: {
        ...contextManifest,
        objects: [{ id: "broken" }],
      },
    }])).toEqual([]);
    expect(parseAgentThreadMetadata([{
      ...metadata,
      contextManifest: {
        ...contextManifest,
        capabilityIds: ["okf-repair"],
      },
    }])).toEqual([]);
  });
});
