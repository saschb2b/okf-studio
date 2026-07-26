import { describe, expect, it } from "vitest";
import {
  AGENT_THREAD_METADATA_CAP,
  AGENT_THREAD_PROMPT_CAP,
  createAgentThreadMetadata,
  parseAgentThreadMetadata,
  removeAgentThreadMetadata,
  restoreThreadPrompts,
  upsertAgentThreadMetadata,
  withThreadPrompt,
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
      prompts: [],
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
      { ...BASE, archived: false, taskId: null, contextManifest: null, prompts: [], updatedAt: 2 },
      {
        ...BASE,
        sessionId: "another-session",
        archived: false,
        taskId: null,
        contextManifest: null,
        prompts: [],
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
          prompts: [],
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

  it("persists only closed profile context on profile-aware tasks", () => {
    const contextManifest = acceptOkfContextPlan(createOkfContextPlan({
      taskId: "okf-audit",
      bundleRoot: BASE.bundleRoot,
      concepts: [],
      activeConcept: null,
      attachedConcepts: [],
      sources: [],
      issues: [],
      profileReport: {
        schemaVersion: 1,
        profiles: [{
          namespace: "com.example.knowledge",
          version: "1.2.0",
          descriptorPath: "profiles/team.json",
          status: "active",
          message: "Resolved locally.",
          descriptor: {
            schemaVersion: 1,
            namespace: "com.example.knowledge",
            version: "1.2.0",
            title: "Team knowledge",
            description: "",
            fields: [],
            relationships: [],
            checks: [],
          },
          extra: {},
        }],
        diagnostics: [],
        edges: [],
        truncated: false,
      },
    }));
    const metadata = createAgentThreadMetadata({
      ...BASE,
      taskId: "okf-audit",
      contextManifest,
    }, 42);

    expect(parseAgentThreadMetadata([metadata])).toEqual([metadata]);
    expect(parseAgentThreadMetadata([{
      ...metadata,
      contextManifest: {
        ...contextManifest,
        profileContext: {
          ...contextManifest.profileContext,
          basis: "okf-validation",
        },
      },
    }])).toEqual([]);
  });
});

describe("recorded thread prompts", () => {
  // Verbatim from a restored thread on claude-agent-acp 0.59.0. The adapter
  // pushes every Resource URI into the message as a link and flattens the
  // resource bodies into <context> envelopes, so the "user message" the replay
  // hands back is Studio's scaffolding run together with the question — with no
  // separator to split on, which is why guessing was abandoned.
  const REPLAYED_USER_MESSAGE =
    "okf-studio://capability/okf-core/v0.5.1/instructions" +
    "okf-studio://capability/okf-core/v0.5.1/specification" +
    "okf-studio://capability/okf-core/v0.5.1/commands" +
    "okf-studio://capability/okf-core/v0.5.1/templates" +
    "okf-studio://capability/okf-core/v0.5.1/changelog" +
    "okf-studio://capability/okf-core/v0.5.1/writing" +
    "[@index.md](file:///C:/Users/sasch/Documents/GitHub/okf-viewer/docs/index.md)" +
    "what is this boundle about";

  it("shows what the user typed instead of the adapter's flattened turn", () => {
    const replayed = [
      { role: "user", text: REPLAYED_USER_MESSAGE },
      { role: "agent", text: "This bundle is the documentation for OKF Studio." },
    ];
    const restored = restoreThreadPrompts(replayed, [
      { index: 0, text: "what is this boundle about" },
    ]);

    expect(restored[0].text).toBe("what is this boundle about");
    // The agent's side is the one thing only the replay knows, so it is untouched.
    expect(restored[1]).toBe(replayed[1]);
  });

  it("keeps prompts aligned by ordinal across several turns", () => {
    const replayed = [
      { role: "user", text: "scaffolding + first" },
      { role: "agent", text: "first answer" },
      { role: "user", text: "scaffolding + second" },
      { role: "tool", text: "read docs/index.md" },
      { role: "agent", text: "second answer" },
      { role: "user", text: "scaffolding + third" },
    ];
    const restored = restoreThreadPrompts(replayed, [
      { index: 2, text: "third" },
      { index: 0, text: "first" },
      { index: 1, text: "second" },
    ]);

    expect(restored.map((message) => message.text)).toEqual([
      "first",
      "first answer",
      "second",
      "read docs/index.md",
      "second answer",
      "third",
    ]);
  });

  it("leaves a user message with no recorded prompt exactly as replayed", () => {
    // A thread from before prompts were recorded, or one started outside Studio.
    const replayed = [
      { role: "user", text: "recorded" },
      { role: "user", text: REPLAYED_USER_MESSAGE },
    ];
    const restored = restoreThreadPrompts(replayed, [{ index: 0, text: "asked" }]);

    expect(restored[0].text).toBe("asked");
    expect(restored[1].text).toBe(REPLAYED_USER_MESSAGE);
    expect(restoreThreadPrompts(replayed, [])).toEqual(replayed);
  });

  it("persists multi-line prompts, which the other fields would reject", () => {
    // isBoundedText rejects every control character, so reusing it here would
    // have dropped exactly the prompts most worth keeping.
    const multiline = "Compare these:\n\n- orders\n- carts\n\nWhich is authoritative?";
    const metadata = createAgentThreadMetadata({
      ...BASE,
      prompts: [{ index: 0, text: multiline }],
    }, 42);

    expect(metadata.prompts).toEqual([{ index: 0, text: multiline }]);
    expect(parseAgentThreadMetadata([metadata])).toEqual([metadata]);
  });

  it("replaces a prompt at the same ordinal and keeps the newest when capped", () => {
    expect(withThreadPrompt([{ index: 0, text: "first" }], 0, "edited"))
      .toEqual([{ index: 0, text: "edited" }]);

    let prompts = [] as ReturnType<typeof withThreadPrompt>;
    for (let index = 0; index < AGENT_THREAD_PROMPT_CAP + 5; index += 1) {
      prompts = withThreadPrompt(prompts, index, `prompt ${index}`);
    }
    expect(prompts).toHaveLength(AGENT_THREAD_PROMPT_CAP);
    // Trimmed from the front, and the ordinals prove alignment survived it.
    expect(prompts[0].index).toBe(5);
    expect(prompts.at(-1)).toEqual({
      index: AGENT_THREAD_PROMPT_CAP + 4,
      text: `prompt ${AGENT_THREAD_PROMPT_CAP + 4}`,
    });
  });

  it("drops malformed prompt entries rather than failing the whole thread", () => {
    const parsed = parseAgentThreadMetadata([{
      ...createAgentThreadMetadata(BASE, 42),
      prompts: [
        { index: 0, text: "kept" },
        { index: -1, text: "negative ordinal" },
        { index: 1.5, text: "fractional ordinal" },
        { index: 2, text: "" },
        { index: 3, text: "x".repeat(4_097) },
        { index: 4, text: "null byte \u0000" },
        { index: 0, text: "duplicate ordinal" },
      ],
    }]);

    expect(parsed[0].prompts).toEqual([{ index: 0, text: "kept" }]);
  });
});
