import { describe, expect, it } from "vitest";
import { aggregateThreadStatus, threadAttentionTransition } from "./threadStatus.ts";

describe("agent thread status", () => {
  it("surfaces the most urgent live state", () => {
    expect(aggregateThreadStatus(["idle", "staged", "running"])).toBe("running");
    expect(aggregateThreadStatus(["failed", "waiting", "running"])).toBe("waiting");
  });

  it("deduplicates waiting and reports only terminal transitions", () => {
    expect(threadAttentionTransition("running", "waiting")).toBe("waiting");
    expect(threadAttentionTransition("waiting", "waiting")).toBeNull();
    expect(threadAttentionTransition("running", "failed")).toBe("failed");
    expect(threadAttentionTransition("running", "staged")).toBe("completed");
    expect(threadAttentionTransition("idle", "staged")).toBeNull();
  });
});
