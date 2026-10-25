import { describe, expect, it } from "vitest";
import { fitLabel } from "@/features/viz/labels.ts";

describe("fitLabel wrapping", () => {
  it("breaks slugs after dashes", () => {
    const fit = fitLabel("use-restaurant-platform-api Flag", 70, 40);
    expect(fit).not.toBeNull();
    expect(fit!.lines.join("")).toContain("use-");
    expect(fit!.lines.length).toBeGreaterThan(1);
  });
  it("hard-splits an oversized unbroken word", () => {
    const fit = fitLabel("supercalifragilisticexpialidocious", 50, 40);
    expect(fit).not.toBeNull();
    expect(fit!.lines.join("")).toBe("supercalifragilisticexpialidocious");
  });
  it("keeps plain words space-joined", () => {
    expect(fitLabel("hello world", 200, 40)!.lines).toEqual(["hello world"]);
  });
});

describe("fitLabel scale", () => {
  it("a smaller scale labels a shape a larger scale leaves blank", () => {
    const small = fitLabel("use-restaurant-platform-api", 40, 18, { scale: 0.8 });
    const large = fitLabel("use-restaurant-platform-api", 40, 18, { scale: 1.3 });
    expect(small).not.toBeNull();
    expect(large).toBeNull();
  });
  it("a larger scale raises the font ceiling", () => {
    const base = fitLabel("Hi", 400, 400)!;
    const large = fitLabel("Hi", 400, 400, { scale: 1.3 })!;
    expect(large.fontSize).toBeGreaterThan(base.fontSize);
  });
});
