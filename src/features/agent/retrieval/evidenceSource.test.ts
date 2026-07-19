import { describe, expect, it } from "vitest";
import { MOCK_BUNDLE } from "@/mock/fixture.ts";
import { mockRetrieval } from "./mockRetrieval.ts";
import { buildRetrievalEvidenceSource, sha256Text } from "./evidenceSource.ts";

describe("retrieval evidence source", () => {
  it("uses the lowercase SHA-256 digest of the exact attached Markdown", async () => {
    const result = mockRetrieval(MOCK_BUNDLE, {
      query: "concept reader",
      route: "exact-lexical",
    });

    const source = await buildRetrievalEvidenceSource(result);

    expect(source.sourceDigest).toMatch(/^[0-9a-f]{64}$/);
    expect(source.sourceDigest).toBe(await sha256Text(source.content));
    expect(source.sourceDigest).not.toBe(result.receipt.receiptId);
    expect(source.warning).not.toMatch(/cite|receipt footer|concept ID/i);
  });

  it("matches the standard SHA-256 test vector", async () => {
    await expect(sha256Text("abc")).resolves.toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});
