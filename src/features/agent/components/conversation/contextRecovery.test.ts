import { describe, expect, it } from "vitest";
import {
  contextPressureState,
  findContextRecoveryCommand,
  freshThreadContextDraft,
  markContextSummary,
} from "./contextRecovery.ts";

describe("context recovery", () => {
  it.each([
    [74_000, "normal"],
    [75_000, "approaching"],
    [89_000, "approaching"],
    [90_000, "critical"],
  ] as const)("maps %s of 100000 tokens to %s", (usedTokens, level) => {
    expect(contextPressureState({
      kind: "usage",
      usedTokens,
      contextWindowTokens: 100_000,
      cost: null,
    }).level).toBe(level);
  });

  it("uses only an exact advertised recovery command", () => {
    expect(findContextRecoveryCommand([
      { name: "review", description: "Review changes" },
      { name: "compact", description: "Reduce context" },
    ])?.name).toBe("compact");
    expect(findContextRecoveryCommand([
      { name: "context", description: "Show context usage" },
    ])).toBeNull();
  });

  it("builds a bounded, explicitly unsent carry draft", () => {
    const draft = freshThreadContextDraft("Research sources", "OKF Studio", [
      { id: "user", role: "user", text: "Trace the source claims." },
      { id: "agent", role: "agent", text: "A".repeat(20_000) },
    ]);
    expect(draft.length).toBeLessThanOrEqual(16 * 1024);
    expect(draft).toContain("Review the carried conversation text below before sending");
    expect(draft).toContain("carries no files, sources, permissions, write grants, staged changes");
  });

  it("marks only the reporting agent response as a context summary", () => {
    const marked = markContextSummary([
      { id: "user", role: "user", turnId: "turn-1", text: "/compact" },
      { id: "agent", role: "agent", turnId: "turn-1", text: "Summary" },
    ], "turn-1", "compact");
    expect(marked[0]).not.toHaveProperty("contextSummary");
    expect(marked[1]).toMatchObject({ contextSummary: { commandName: "compact" } });
  });
});
