import { describe, expect, it } from "vitest";
import type { ProfileReport } from "@/shared/types.ts";
import { profileTaskContext } from "@/features/agent/profileContext.ts";

function report(): ProfileReport {
  return {
    schemaVersion: 1,
    profiles: [{
      namespace: "com.example.knowledge",
      version: "1.2.0",
      descriptorPath: "profiles/knowledge.json",
      status: "active",
      message: "Resolved locally.",
      extra: {},
      descriptor: {
        schemaVersion: 1,
        namespace: "com.example.knowledge",
        version: "1.2.0",
        title: "Team knowledge",
        description: "Team conventions.",
        fields: [
          {
            id: "type",
            scope: "concept",
            key: "type",
            label: "Type",
            description: "OKF concept type.",
            valueType: "string",
            expectation: "required",
            conceptTypes: [],
            examples: ["Guide"],
          },
          {
            id: "owner",
            scope: "concept",
            key: "owner",
            label: "Owner",
            description: "Responsible team.",
            valueType: "string",
            expectation: "required",
            conceptTypes: ["Guide"],
            examples: ["Docs"],
          },
          {
            id: "summary",
            scope: "concept",
            key: "summary",
            label: "Summary",
            description: "Short orientation.",
            valueType: "string",
            expectation: "recommended",
            conceptTypes: [],
            examples: ["x".repeat(300)],
          },
        ],
        relationships: [{
          id: "supports",
          label: "Supports",
          inverse: "supported-by",
          description: "Provides support.",
        }],
        checks: [],
      },
    }],
    diagnostics: [{
      namespace: "com.example.knowledge",
      ruleId: "owner-present",
      level: "recommendation",
      scope: "concept",
      file: "guide.md",
      conceptId: "guide",
      field: "owner",
      message: "Name the responsible team.",
    }],
    edges: [],
    truncated: false,
  };
}

describe("profile task context", () => {
  it("labels core, profile-required, and recommended fields distinctly", () => {
    const context = profileTaskContext("okf-revise", report());

    expect(context?.conformanceBoundary).toBe(
      "Profile advice does not change OKF validation.",
    );
    expect(context?.profiles[0].fields.map(({ key, requirement }) => ({
      key,
      requirement,
    }))).toEqual([
      { key: "type", requirement: "OKF-required" },
      { key: "owner", requirement: "Profile-required" },
      { key: "summary", requirement: "Recommended" },
    ]);
    expect(context?.profiles[0].fields[2].examples[0]).toHaveLength(257);
    expect(context?.diagnostics[0]).toMatchObject({ basis: "profile-advice" });
  });

  it("feeds only profile-aware tasks", () => {
    expect(profileTaskContext("okf-create", report())).not.toBeNull();
    expect(profileTaskContext("okf-audit", report())).not.toBeNull();
    expect(profileTaskContext("okf-migrate", report())).not.toBeNull();
    expect(profileTaskContext("okf-revise", report())).not.toBeNull();
    expect(profileTaskContext("okf-research", report())).toBeNull();
    expect(profileTaskContext("okf-repair", report())).toBeNull();
  });

  it("retains unavailable declarations without inventing guidance", () => {
    const unavailable = report();
    unavailable.profiles[0] = {
      ...unavailable.profiles[0],
      status: "unavailable",
      message: "The descriptor is missing.",
      descriptor: null,
    };
    unavailable.diagnostics = [];

    expect(profileTaskContext("okf-audit", unavailable)?.profiles[0]).toMatchObject({
      status: "unavailable",
      fields: [],
      relationships: [],
      message: "The descriptor is missing.",
    });
  });
});
