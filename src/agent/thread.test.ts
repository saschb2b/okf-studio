import { describe, expect, it } from "vitest";
import {
  datasetChangeRequirements,
  deriveThreadTitle,
  researchExportRequirements,
  transcriptFilename,
  transcriptMarkdown,
} from "./thread.ts";

const STARTERS = [{
  title: "Deep research",
  prompt: "Research this question: ",
}] as const;

describe("agent thread metadata", () => {
  it("derives a bounded plain-text title and retains a guided starter name", () => {
    expect(deriveThreadTitle("Summarize the **bundle**", STARTERS)).toBe(
      "Summarize the bundle",
    );
    expect(deriveThreadTitle("Research this question: Which decisions lack evidence?", STARTERS))
      .toBe("Deep research: Which decisions lack evidence?");
    expect(deriveThreadTitle("x".repeat(100), STARTERS)).toHaveLength(64);
  });

  it("uses the title in a safe filename and transcript heading", () => {
    expect(transcriptFilename("Bundle research / Q3")).toBe("bundle-research-q3-thread.md");
    expect(transcriptMarkdown("Bundle research", "Catalog", "Local agent", [
      { role: "user", text: "Summarize **literally**" },
      {
        role: "plan",
        entries: [
          { content: "Inspect the bundle", status: "completed" },
          { content: "Draft the answer", status: "in-progress" },
        ],
      },
      { role: "tool", title: "Search the bundle", status: "completed" },
      { role: "agent", text: "**Finding:** documented." },
      { role: "status", text: "Turn cancelled." },
    ])).toBe(
      "# Bundle research\n\nAgent: Local agent\n\nBundle: Catalog\n\n" +
      "## You\n\n> Summarize **literally**\n\n" +
      "## Plan\n\n- [x] Inspect the bundle\n- [ ] Draft the answer (in progress)\n\n" +
      "> **Tool (Completed):** Search the bundle\n\n" +
      "## Agent\n\n**Finding:** documented.\n\n> **Turn:** Turn cancelled.\n",
    );
  });

  it("requires explicit source and inference sections for research exports", () => {
    expect(researchExportRequirements([
      { role: "agent", text: "## Finding\n\nDocumented." },
    ])).toEqual(["sources", "inferences"]);
    expect(researchExportRequirements([
      { role: "agent", text: "## Sources\n\n- A vague reference\n\n## Inferences\n\nNone." },
    ])).toEqual(["sources"]);
    expect(researchExportRequirements([
      {
        role: "agent",
        text: "## Sources\n\n- [Overview](product/overview.md)\n\n## Inferences\n\nNone.",
      },
    ])).toEqual([]);
    expect(researchExportRequirements([
      { role: "user", text: "## Sources\n\n- Invented by the user" },
      { role: "agent", text: "## Inferences\n\n- This is inferred." },
    ])).toEqual(["sources"]);
  });

  it("requires a plan and bundle-relative concept set for dataset changes", () => {
    expect(datasetChangeRequirements([
      { role: "agent", text: "The request affects the product model." },
    ])).toEqual(["change-plan", "affected-concepts"]);
    expect(datasetChangeRequirements([
      {
        role: "agent",
        text: "## Change Plan\n\n1. Update the definition.\n\n" +
          "## Affected Concepts\n\n- Product overview",
      },
    ])).toEqual(["affected-concepts"]);
    expect(datasetChangeRequirements([
      {
        role: "agent",
        text: "## Change Plan\n\n1. Update the definition.\n\n" +
          "## Affected Concepts\n\n- `../outside.md`",
      },
    ])).toEqual(["affected-concepts"]);
    expect(datasetChangeRequirements([
      {
        role: "agent",
        text: "## Change Plan\n\n- [ ] Update the definition.\n\n" +
          "## Affected Concepts\n\n- `product/overview.md` - revise scope",
      },
    ])).toEqual([]);
    expect(datasetChangeRequirements([
      { role: "user", text: "## Affected Concepts\n\n- product/overview.md" },
      { role: "agent", text: "## Change Plan\n\n1. Update the definition." },
    ])).toEqual(["affected-concepts"]);
  });
});
