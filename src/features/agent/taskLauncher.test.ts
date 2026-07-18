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
});
