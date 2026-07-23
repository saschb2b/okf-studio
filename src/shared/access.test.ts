import { describe, expect, it } from "vitest";
import { assessAccessHints, sensitivityRank } from "@/shared/access.ts";

describe("access hints", () => {
  it("preserves unknown values without assigning authority or rank", () => {
    const hints = assessAccessHints({
      extra: {
        audience: ["engineering", "partners", "engineering"],
        sensitivity: "embargoed",
        handling_notes: "Share after the named release.",
      },
    });

    expect(hints.audiences).toEqual(["engineering", "partners"]);
    expect(hints.sensitivity).toBe("embargoed");
    expect(hints.knownSensitivity).toBeNull();
    expect(hints.diagnostics[0]).toContain("Unknown sensitivity");
  });

  it("bounds invalid values and normalizes only the known rank", () => {
    const hints = assessAccessHints({
      extra: {
        audience: ["engineering", 3, "x".repeat(129)],
        sensitivity: "Internal",
        handling_notes: { unsafe: true },
      },
    });

    expect(hints.audiences).toEqual(["engineering"]);
    expect(hints.sensitivity).toBe("Internal");
    expect(hints.knownSensitivity).toBe("internal");
    expect(hints.diagnostics).toContain("Handling notes must be a string.");
    expect(sensitivityRank("CONFIDENTIAL")).toBe(2);
  });
});
