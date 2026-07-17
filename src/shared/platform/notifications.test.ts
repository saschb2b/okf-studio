import { describe, expect, it } from "vitest";
import { agentThreadNotificationCopy } from "./notifications.ts";

describe("agent thread notifications", () => {
  it("contains only bounded thread and agent labels", () => {
    const copy = agentThreadNotificationCopy({
      kind: "waiting",
      threadTitle: `Research\n${"x".repeat(100)}`,
      agentName: `Codex\u0000${"y".repeat(100)}`,
    });
    expect(copy.title).toBe("Agent thread needs permission");
    expect(copy.body).not.toContain("\n");
    expect(copy.body).not.toContain("\u0000");
    const [thread, agent] = copy.body.split(" · ");
    expect(thread.length).toBeLessThanOrEqual(80);
    expect(agent.length).toBeLessThanOrEqual(64);
  });

  it("does not accept transcript content fields", () => {
    expect(agentThreadNotificationCopy({
      kind: "completed",
      threadTitle: "Bundle research",
      agentName: "Local model",
    })).toEqual({
      title: "Agent thread finished",
      body: "Bundle research · Local model",
    });
  });
});
