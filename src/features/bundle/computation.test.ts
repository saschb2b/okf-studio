import { describe, expect, it } from "vitest";
import { mockConcept } from "@/mock/conceptFixtures.ts";
import {
  declaredComputationPath,
  materializeFileComputation,
} from "./computation.ts";

function stored(path: string | null) {
  return mockConcept({
    type: "Attested Computation",
    body: "# Revenue\n\nThe sanctioned definition.",
    computation: {
      runtime: "bigquery",
      parameters: [],
      computation: path,
      executor: { resource: null, receipt: ["job_id"] },
      attester: { resource: "references/attesters/revenue.py" },
    },
  });
}

describe("declaredComputationPath", () => {
  it("is null for an inline computation and for an ordinary concept", () => {
    expect(declaredComputationPath(stored(null))).toBeNull();
    expect(declaredComputationPath(mockConcept())).toBeNull();
  });

  it("is the path when one is stored", () => {
    expect(declaredComputationPath(stored("lib/revenue.sql"))).toBe("lib/revenue.sql");
  });
});

describe("materializeFileComputation", () => {
  const concept = stored("lib/revenue.sql");

  it("appends the source under the heading the inline form uses", () => {
    const out = materializeFileComputation(concept.body, concept, "SELECT 1");
    // The same heading, so the two storage forms are indistinguishable to a
    // reader — which is the whole point of routing this through markdown.
    expect(out).toContain("# Computation");
    expect(out).toContain("```sql\nSELECT 1\n```");
  });

  it("picks the fence language from the extension", () => {
    const python = stored("lib/revenue.py");
    expect(materializeFileComputation(python.body, python, "x = 1")).toContain("```python");
    // An unknown extension gets a bare fence rather than a wrong language.
    const odd = stored("lib/revenue.hql");
    expect(materializeFileComputation(odd.body, odd, "SELECT 1")).toContain("```\nSELECT 1");
  });

  it("leaves the body alone when nothing is stored or nothing has loaded", () => {
    const inline = stored(null);
    expect(materializeFileComputation(inline.body, inline, "SELECT 1")).toBe(inline.body);
    // Not yet loaded: no half-built section, no empty fence.
    expect(materializeFileComputation(concept.body, concept, null)).toBe(concept.body);
  });

  it("escapes a computation that contains its own fence", () => {
    // The failure this prevents: markdown closes a fence on the first line with
    // at least as many backticks, so a three-tick wrapper around this file would
    // end at the inner fence and spill the rest of the query into the page as
    // prose — with the trailing text rendered as if it were the author's.
    const source = "SELECT 1;\n```\nDROP TABLE users;";
    const out = materializeFileComputation(concept.body, concept, source);

    expect(out).toContain("````sql");
    expect(out.trimEnd().endsWith("````")).toBe(true);
    // Everything in the file stays inside the block.
    const body = out.slice(out.indexOf("````sql"));
    expect(body).toContain("DROP TABLE users;");
    expect(body.split("````").length - 1).toBe(2);
  });

  it("grows the fence past the longest run, not just past three", () => {
    const source = "a\n`````\nb";
    const out = materializeFileComputation(concept.body, concept, source);
    expect(out).toContain("``````sql");
  });
});
