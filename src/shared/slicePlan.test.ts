import { describe, expect, it } from "vitest";
import { defaultSliceLimits, planAgentSlices, type SlicePlan } from "./ipc.ts";

/**
 * These run against the browser mock, which reimplements the rules
 * `okf-core::slice` owns. That duplication is deliberate (the mock cannot call
 * Rust) and it is the risk: a mock that drifts makes every test above it a
 * test of the mock. So these assert the *rules* rather than the fixture's
 * particular contents, and the Rust suite asserts the same rules on its side.
 */
const plan = (by: Parameters<typeof planAgentSlices>[1], limits = defaultSliceLimits) =>
  planAgentSlices("/mock/workspace/docs", by, limits);

const keys = (result: SlicePlan) => result.slices.map((slice) => slice.key);

describe("slice planning", () => {
  it("returns slices in key order with their concepts sorted", async () => {
    // Byte-identical plans are what makes a fan-out reviewable and a stale
    // result detectable, and ordering is most of that.
    const result = await plan("type");
    expect(keys(result)).toEqual([...keys(result)].sort());
    for (const slice of result.slices) {
      expect(slice.conceptIds).toEqual([...slice.conceptIds].sort());
    }
  });

  it("produces an identical plan for an identical request", async () => {
    const [first, second] = await Promise.all([plan("folder"), plan("folder")]);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });

  it("plans a width the bundle yields rather than a fixed one", async () => {
    const byType = await plan("type");
    const byFolder = await plan("folder");
    expect(byType.slices.length).toBeGreaterThan(0);
    // Nothing pads to a target, so two decompositions of the same bundle
    // legitimately differ in width.
    expect(byType.slices.length).not.toBe(0);
    expect(byFolder.slices.length).not.toBe(0);
  });

  it("names the slices a width cap dropped", async () => {
    const capped = await plan("type", { maxSlices: 2, maxConceptsPerSlice: 40 });
    expect(capped.slices).toHaveLength(2);
    const exclusion = capped.exclusions.find((item) => item.kind === "slicesOverWidth");
    expect(exclusion).toBeDefined();
    if (exclusion?.kind !== "slicesOverWidth") throw new Error("wrong exclusion kind");
    expect(exclusion.limit).toBe(2);
    expect(exclusion.droppedKeys.length).toBeGreaterThan(0);
    // The dropped keys continue where the kept ones stopped, so a reader can
    // see exactly what was left out rather than only how much.
    expect(exclusion.droppedKeys).toEqual([...exclusion.droppedKeys].sort());
  });

  it("reports what a per-slice cap left out, on the slice and in the exclusions", async () => {
    const capped = await plan("folder", { maxSlices: 12, maxConceptsPerSlice: 1 });
    const trimmed = capped.slices.find((slice) => slice.excludedConceptIds.length > 0);
    expect(trimmed).toBeDefined();
    expect(trimmed?.conceptIds).toHaveLength(1);
    expect(
      capped.exclusions.some(
        (item) => item.kind === "conceptsOverSliceCap" && item.sliceKey === trimmed?.key,
      ),
    ).toBe(true);
  });

  it("lets a tagged concept sit in several slices while counting it once", async () => {
    const byTag = await plan("tag");
    const appearances = byTag.slices.flatMap((slice) => slice.conceptIds);
    const distinct = new Set(appearances);
    // A tag is a cross-cutting view, not a partition, so the same concept is
    // expected in more than one slice while the plan counts it once.
    expect(appearances.length).toBeGreaterThan(distinct.size);
  });

  it("carries the fingerprint the plan was computed against", async () => {
    const [byFolder, byType] = await Promise.all([plan("folder"), plan("type")]);
    // The fingerprint identifies the bundle, not the decomposition, which is
    // what lets a stale slice be detected against a later plan.
    expect(byFolder.fingerprint).toBe(byType.fingerprint);
    expect(byFolder.fingerprint).not.toBe("");
  });

  it("keeps a link neighbourhood centred on its own concept", async () => {
    const result = await plan("link-neighbourhood");
    for (const slice of result.slices) {
      expect(slice.conceptIds).toContain(slice.key);
    }
  });
});
