import { describe, expect, it } from "vitest";
import {
  AGENT_THREAD_METADATA_CAP,
  createAgentThreadMetadata,
  parseAgentThreadMetadata,
  removeAgentThreadMetadata,
  upsertAgentThreadMetadata,
} from "./threadMetadata.ts";

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
      workflow: null,
      updatedAt: 42,
    });
    expect(() => createAgentThreadMetadata({ ...BASE, sessionId: "bad\nsession" }))
      .toThrow("invalid or exceeds");
    expect(parseAgentThreadMetadata([
      { ...BASE, updatedAt: 2 },
      { ...BASE, sessionId: "older-duplicate", updatedAt: 1 },
      { ...BASE, sessionId: "", updatedAt: 3 },
      { ...BASE, title: "tampered", updatedAt: Number.POSITIVE_INFINITY },
      { ...BASE, bundleRoot: "C:\\knowledge\\research", workflow: "unknown", updatedAt: 4 },
    ])).toEqual([{ ...BASE, archived: false, workflow: null, updatedAt: 2 }]);
  });

  it("keeps one current and one archived pointer per bundle and profile within the cap", () => {
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
});
