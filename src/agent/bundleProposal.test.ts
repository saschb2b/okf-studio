import { describe, expect, it } from "vitest";
import { bundleProposalNarrative, parseBundleProposal } from "@/agent/bundleProposal.ts";

function fence(value: unknown): string {
  return `Here is the proposed structure.\n\n\`\`\`okf-proposal\n${JSON.stringify(value)}\n\`\`\``;
}

describe("bundle proposal preview", () => {
  it("parses concepts, types, links, and index membership", () => {
    const result = parseBundleProposal(fence({
      concepts: [
        { path: "product/overview.md", title: "Overview", type: "Product", links: ["architecture/system.md"] },
        { path: "architecture/system.md", title: "System", type: "Architecture", links: [] },
      ],
      indexes: [
        { path: "index.md", concepts: ["product/overview.md", "architecture/system.md"] },
        { path: "architecture/index.md", concepts: ["architecture/system.md"] },
      ],
    }));

    expect(result).toEqual({
      status: "ready",
      proposal: {
        concepts: [
          { path: "product/overview.md", title: "Overview", type: "Product", links: ["architecture/system.md"] },
          { path: "architecture/system.md", title: "System", type: "Architecture", links: [] },
        ],
        indexes: [
          { path: "index.md", concepts: ["product/overview.md", "architecture/system.md"] },
          { path: "architecture/index.md", concepts: ["architecture/system.md"] },
        ],
        linkCount: 1,
      },
    });
  });

  it("uses the newest proposal fence so an agent can revise its plan", () => {
    const first = fence({
      concepts: [{ path: "first.md", title: "First", type: "Note", links: [] }],
      indexes: [{ path: "index.md", concepts: ["first.md"] }],
    });
    const second = fence({
      concepts: [{ path: "second.md", title: "Second", type: "Note", links: [] }],
      indexes: [{ path: "index.md", concepts: ["second.md"] }],
    });

    const result = parseBundleProposal(`${first}\n\nRevision:\n\n${second}`);
    expect(result.status).toBe("ready");
    if (result.status === "ready") expect(result.proposal.concepts[0].path).toBe("second.md");
  });

  it("rejects traversal, duplicate paths, and index references outside the proposal", () => {
    const unsafe = parseBundleProposal(fence({
      concepts: [{ path: "../escape.md", title: "Escape", type: "Note", links: [] }],
      indexes: [{ path: "index.md", concepts: ["../escape.md"] }],
    }));
    expect(unsafe).toMatchObject({ status: "invalid" });

    const duplicate = parseBundleProposal(fence({
      concepts: [
        { path: "same.md", title: "One", type: "Note", links: [] },
        { path: "Same.md", title: "Two", type: "Note", links: [] },
      ],
      indexes: [{ path: "index.md", concepts: ["same.md"] }],
    }));
    expect(duplicate).toMatchObject({ status: "invalid" });

    const missing = parseBundleProposal(fence({
      concepts: [{ path: "known.md", title: "Known", type: "Note", links: [] }],
      indexes: [{ path: "index.md", concepts: ["missing.md"] }],
    }));
    expect(missing).toEqual({
      status: "invalid",
      message: "Index index.md references unproposed concept missing.md.",
    });
  });

  it("distinguishes absent and malformed proposal blocks", () => {
    expect(parseBundleProposal("Ordinary agent prose.")).toEqual({ status: "none" });
    expect(parseBundleProposal("```okf-proposal\n{not json}\n```")).toEqual({
      status: "invalid",
      message: "The proposal block is not valid JSON.",
    });
  });

  it("keeps the narrative readable without discarding the underlying contract", () => {
    const markdown = fence({
      concepts: [{ path: "note.md", title: "Note", type: "Note", links: [] }],
      indexes: [{ path: "index.md", concepts: ["note.md"] }],
    });
    expect(bundleProposalNarrative(markdown)).toBe("Here is the proposed structure.");
    expect(parseBundleProposal(markdown).status).toBe("ready");
  });
});
