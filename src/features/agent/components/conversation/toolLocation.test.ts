import { describe, expect, it } from "vitest";
import { conceptIdForToolLocation } from "./toolLocation.ts";

const concepts = ["product/overview", "metrics/weekly-active"];

describe("conceptIdForToolLocation", () => {
  it("resolves an exact bundle concept Markdown path", () => {
    expect(conceptIdForToolLocation(
      { path: "product/overview.md", line: 12 },
      concepts,
    )).toBe("product/overview");
  });

  it.each([
    "C:/workspace/product/overview.md",
    "/workspace/product/overview.md",
    "../product/overview.md",
    "product/../product/overview.md",
    "product\\overview.md",
    "product/overview.txt",
    "product/missing.md",
    "index.md",
  ])("keeps %s inert", (path) => {
    expect(conceptIdForToolLocation({ path, line: null }, concepts)).toBeNull();
  });
});
