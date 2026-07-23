import { describe, expect, it } from "vitest";
import {
  changeLogBody,
  changeLogKind,
  newestLogEntries,
} from "./changeLog.ts";

describe("change log presentation", () => {
  it("orders dated groups newest first without changing the input", () => {
    const log = [
      { date: "2026-07-01", entries: ["older"] },
      { date: "2026-07-03", entries: ["newer"] },
    ];

    expect(newestLogEntries(log).map((entry) => entry.date)).toEqual([
      "2026-07-03",
      "2026-07-01",
    ]);
    expect(log[0].date).toBe("2026-07-01");
  });

  it("separates the conventional kind from its readable body", () => {
    const entry = "**Fix + Update**: Keep the bundle readable.";
    expect(changeLogKind(entry)).toBe("fix");
    expect(changeLogBody(entry)).toBe("Keep the bundle readable.");
  });
});
