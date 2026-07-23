import { describe, expect, it } from "vitest";
import { getBundleConformance } from "./bundleConformance.ts";

describe("getBundleConformance", () => {
  it.each([
    {
      issues: [],
      expected: { kind: "ok", label: "Conformant", detail: "No OKF issues" },
    },
    {
      issues: [{ conceptId: null, level: "warning" as const, message: "Broken link" }],
      expected: {
        kind: "warning",
        label: "Conformant with warnings",
        detail: "1 warning",
      },
    },
    {
      issues: [
        { conceptId: null, level: "error" as const, message: "Missing type" },
        { conceptId: null, level: "warning" as const, message: "Broken link" },
      ],
      expected: {
        kind: "error",
        label: "Not conformant",
        detail: "1 error · 1 warning",
      },
    },
  ])("summarizes $expected.kind bundles", ({ issues, expected }) => {
    expect(getBundleConformance(issues)).toMatchObject(expected);
  });
});
