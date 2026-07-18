import { describe, expect, it } from "vitest";
import { collectFederatedTaskEvidence } from "@/features/agent/federatedTaskEvidence.ts";

const selections = [
  {
    bundleId: "00000000-0000-4000-8000-000000000001",
    revisionFingerprint: "okf-health-revision-0000000000000001",
  },
  {
    bundleId: "00000000-0000-4000-8000-000000000002",
    revisionFingerprint: "okf-health-revision-0000000000000002",
  },
];

describe("federated task evidence", () => {
  it("keeps bundle identities and revisions attached to every concept result", async () => {
    const evidence = await collectFederatedTaskEvidence("okf-audit", "Overview", selections);
    const content = evidence.sources.map((source) => source.content).join("\n");

    expect(evidence.statuses).toHaveLength(2);
    expect(content).toContain(selections[0].bundleId);
    expect(content).toContain(selections[1].bundleId);
    expect(content).toContain(selections[0].revisionFingerprint);
    expect(evidence.sources.every((source) => source.warning?.includes("never write destinations")))
      .toBe(true);
  });

  it("does not query a single active bundle or unsupported task", async () => {
    await expect(collectFederatedTaskEvidence("okf-research", "Overview", selections.slice(0, 1)))
      .resolves.toEqual({ sources: [], statuses: [] });
    await expect(collectFederatedTaskEvidence("okf-repair", "Overview", selections))
      .resolves.toEqual({ sources: [], statuses: [] });
  });
});
