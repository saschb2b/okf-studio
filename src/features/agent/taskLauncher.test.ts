import { describe, expect, it } from "vitest";
import {
  kickoffForOkfOrigin,
  tasksForOkfOrigin,
} from "@/features/agent/taskLauncher.ts";

describe("OKF task launcher", () => {
  it("offers repair only for a validation finding", () => {
    const conceptTasks = tasksForOkfOrigin({
      kind: "concept",
      id: "concept:features/agent-panel",
      title: "Agent Panel",
      conceptId: "features/agent-panel",
    });
    const findingTasks = tasksForOkfOrigin({
      kind: "validation-finding",
      id: "finding:1",
      title: "Agent Panel",
      issue: { level: "error", conceptId: "features/agent-panel", message: "Missing type" },
    });

    expect(conceptTasks).not.toContain("okf-repair");
    expect(findingTasks[0]).toBe("okf-repair");
  });

  it("carries a selected finding into the shared task kickoff", () => {
    const kickoff = kickoffForOkfOrigin("okf-repair", {
      kind: "validation-finding",
      id: "finding:1",
      title: "Agent Panel",
      issue: { level: "error", conceptId: "features/agent-panel", message: "Missing type" },
    });

    expect(kickoff.taskId).toBe("okf-repair");
    expect(kickoff.prompt).toContain("Missing type");
    expect(kickoff.sources).toEqual([
      expect.objectContaining({ content: "Missing type", origin: "features/agent-panel.md" }),
    ]);
  });

  it("turns advisory profile findings into reviewed migration work", () => {
    const origin = {
      kind: "profile-finding" as const,
      id: "profile:owner",
      title: "Name the responsible team.",
      conceptId: "features/agent-panel",
      diagnostic: {
        namespace: "com.example.knowledge",
        ruleId: "owner-present",
        level: "recommendation" as const,
        scope: "concept" as const,
        file: "features/agent-panel.md",
        conceptId: "features/agent-panel",
        field: "owner",
        message: "Name the responsible team.",
      },
    };

    expect(tasksForOkfOrigin(origin)).toEqual(["okf-migrate", "okf-revise", "okf-audit"]);
    const kickoff = kickoffForOkfOrigin("okf-migrate", origin);
    expect(kickoff.contextConceptIds).toEqual(["features/agent-panel"]);
    expect(kickoff.prompt).toContain("advisory profile finding");
    expect(kickoff.sources?.[0]?.content).toContain(
      "Basis: advisory profile, not OKF validation",
    );
  });

  it("does not attach a concept when profile advice targets the bundle", () => {
    const kickoff = kickoffForOkfOrigin("okf-migrate", {
      kind: "profile-finding",
      id: "profile:bundle",
      title: "Name the bundle owner.",
      conceptId: null,
      diagnostic: {
        namespace: "com.example.knowledge",
        ruleId: "bundle-owner",
        level: "recommendation",
        scope: "bundle",
        file: "index.md",
        conceptId: null,
        field: "owner",
        message: "Name the bundle owner.",
      },
    });

    expect(kickoff.contextConceptIds).toEqual([]);
  });

  it("removes task entry points whose capability pack is inactive", () => {
    const origin = {
      kind: "concept" as const,
      id: "concept:overview",
      title: "Overview",
      conceptId: "overview",
    };

    expect(tasksForOkfOrigin(origin, new Set(["okf-audit", "okf-research"]))).toEqual([
      "okf-audit",
      "okf-research",
    ]);
    expect(tasksForOkfOrigin(origin, new Set(["okf-core"]))).toEqual([]);
  });
});
