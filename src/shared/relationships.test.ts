import { describe, expect, it } from "vitest";
import type { ProfileReport } from "@/shared/types.ts";
import {
  relationshipGroups,
  relationshipsForConcept,
} from "@/shared/relationships.ts";

const report: ProfileReport = {
  schemaVersion: 1,
  profiles: [],
  diagnostics: [],
  edges: [
    {
      sourceId: "a",
      targetId: "b",
      namespace: "com.example.knowledge",
      type: "supports",
      label: "Supports",
      inverse: "supported-by",
      recognized: true,
      targetExists: true,
      portableLink: true,
    },
    {
      sourceId: "a",
      targetId: "missing",
      namespace: "com.example.knowledge",
      type: "supports",
      label: "Supports",
      inverse: "supported-by",
      recognized: true,
      targetExists: false,
      portableLink: false,
    },
    {
      sourceId: "c",
      targetId: "b",
      namespace: "org.producer.graph",
      type: "feeds",
      label: "feeds",
      inverse: null,
      recognized: false,
      targetExists: true,
      portableLink: true,
    },
  ],
  truncated: false,
};

describe("profile relationships", () => {
  it("groups recognized and unknown edge types for graph filtering", () => {
    const groups = relationshipGroups(report);

    expect(groups.map((group) => [group.label, group.recognized, group.count]))
      .toEqual([
        ["Supports", true, 2],
        ["feeds", false, 1],
      ]);
    expect(groups[0].conceptIds).toEqual(["a", "b"]);
    expect(groups[1].conceptIds).toEqual(["c", "b"]);
  });

  it("uses profile inverses for incoming inspection and keeps unknown labels", () => {
    expect(relationshipsForConcept(report, "b").map((relationship) => [
      relationship.label,
      relationship.direction,
      relationship.otherId,
      relationship.edge.recognized,
    ])).toEqual([
      ["feeds (incoming)", "incoming", "c", false],
      ["supported-by", "incoming", "a", true],
    ]);
    expect(relationshipsForConcept(report, "a")).toHaveLength(2);
  });
});
