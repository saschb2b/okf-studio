import { describe, expect, it, vi } from "vitest";
import {
  durableProvenanceFromSource,
  inspectConceptEvidence,
  materializeEvidenceFootnotes,
  provenanceFrontmatter,
} from "@/shared/evidence.ts";

const receipt = {
  schemaVersion: 1 as const,
  adapterId: "openapi",
  adapterVersion: 2,
  discovery: "url" as const,
  origin: "https://example.com/openapi.json#section",
  mediaType: "application/json",
  sourceFingerprint: `sha256-${"a".repeat(64)}`,
  evidenceFingerprint: `sha256-${"b".repeat(64)}`,
  refreshFingerprint: `source-refresh-v1-${"c".repeat(64)}`,
  trust: "untrusted" as const,
  diagnostics: [],
};

describe("durable evidence", () => {
  it("maps an adapter receipt to stable profile frontmatter", () => {
    const provenance = durableProvenanceFromSource("spec", {
      title: "API spec",
      content: "{}",
      sourceDigest: "a".repeat(64),
      adapterReceipt: receipt,
    }, "2026-07-23T18:00:00Z");

    expect(provenance).toMatchObject({
      id: "spec",
      uri: "https://example.com/openapi.json",
      observedAt: "2026-07-23T18:00:00Z",
      sourceDigest: `sha256-${"a".repeat(64)}`,
      evidenceDigest: `sha256-${"b".repeat(64)}`,
      adapterId: "openapi",
      adapterVersion: 2,
    });
    expect(provenanceFrontmatter(provenance!)).toMatchObject({
      observed_at: "2026-07-23T18:00:00Z",
      adapter: { id: "openapi", version: 2 },
    });
  });

  it("redacts absolute local paths while retaining a useful filename", () => {
    const local = durableProvenanceFromSource("brief", {
      title: "private.md",
      content: "Evidence",
      adapterReceipt: {
        ...receipt,
        discovery: "file",
        origin: "/home/person/secret/private.md",
      },
    }, "2026-07-23T18:00:00Z");

    expect(local).toMatchObject({
      origin: "private.md",
      locator: "private.md",
      uri: null,
      localPathRedacted: true,
    });
    expect(JSON.stringify(local)).not.toContain("/home/person");
  });

  it("joins claim markers to structured sources and reports exact dangling lines", () => {
    const evidence = inspectConceptEvidence({
      provenance: {
        spec: {
          title: "API spec",
          uri: "https://example.com/spec",
          observed_at: "2026-07-23T18:00:00Z",
          source_digest: `sha256-${"a".repeat(64)}`,
          evidence_digest: `sha256-${"b".repeat(64)}`,
          adapter: { id: "html", version: 1 },
          discovery: "url",
          media_type: "text/html",
        },
      },
      evidence: {
        spec: {
          provenance_id: "spec",
          locator: "Operation GET /items",
          last_checked_at: "2026-07-23T18:30:00Z",
          last_status: "available",
          last_fingerprint: `sha256-${"a".repeat(64)}`,
        },
        unused: { title: "Unused source" },
      },
    }, "Supported claim.[^spec]\n\nUnsupported.[^missing]");

    expect(evidence.sources[0]).toMatchObject({
      id: "spec",
      title: "API spec",
      uri: "https://example.com/spec",
      locator: "Operation GET /items",
      lastStatus: "available",
    });
    expect(evidence.citations).toEqual([
      { sourceId: "spec", line: 1, resolved: true },
      { sourceId: "missing", line: 3, resolved: false },
    ]);
    expect(evidence.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: "dangling-citation",
        sourceId: "missing",
        line: 3,
      }),
      expect.objectContaining({ kind: "unused-source", sourceId: "unused" }),
    ]));
  });

  it("does not reinterpret ordinary authored footnote definitions as evidence markers", () => {
    const evidence = inspectConceptEvidence(
      { evidence: { spec: { title: "Spec" } } },
      "Claim.[^spec]\n\n[^spec]: Ordinary Markdown definition.",
    );
    expect(evidence.citations).toEqual([]);
    expect(evidence.diagnostics).toContainEqual(expect.objectContaining({
      kind: "unused-source",
      sourceId: "spec",
    }));
  });

  it("materializes sanitized Markdown footnotes for structured claim markers", () => {
    const body = "Claim.[^spec]";
    const evidence = inspectConceptEvidence({
      evidence: {
        spec: {
          title: "Spec [primary]",
          uri: "https://example.com/spec",
          locator: "Section *4*",
        },
      },
    }, body);
    expect(materializeEvidenceFootnotes(body, evidence)).toBe(
      "Claim.[^spec]\n\n" +
      "[^spec]: [Spec \\[primary\\]](https://example.com/spec), Section \\*4\\*\n",
    );
  });

  it("bounds hostile evidence maps without invoking object values", () => {
    const getter = vi.fn(() => "secret");
    const evidence = Object.fromEntries(
      Array.from({ length: 140 }, (_, index) => [
        `source-${index}`,
        { title: `Source ${index}` },
      ]),
    );
    Object.defineProperty(evidence, "hostile", { enumerable: false, get: getter });

    const result = inspectConceptEvidence({ evidence }, "");
    expect(result.sources).toHaveLength(128);
    expect(result.truncated).toBe(true);
    expect(getter).not.toHaveBeenCalled();
  });

  it("bounds structured claim inspection", () => {
    const body = Array.from(
      { length: 1_025 },
      (_, index) => `Claim ${index}.[^source-${index}]`,
    ).join("\n");
    const result = inspectConceptEvidence({}, body);
    expect(result.citations).toHaveLength(1_024);
    expect(result.truncated).toBe(true);
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      kind: "inspection-limit",
    }));
  });

  it("does not expose credential-bearing source URIs as reader actions", () => {
    const result = inspectConceptEvidence({
      evidence: {
        secret: {
          title: "Credentialed source",
          uri: "https://person:token@example.com/report",
        },
      },
    }, "Claim.[^secret]");
    expect(result.sources[0].uri).toBeNull();
  });
});
