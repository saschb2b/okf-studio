import { describe, expect, it } from "vitest";
import { dropIndexFor } from "./TabStrip.tsx";

// Pure geometry: the tab strip's drag handler asks where a dragged tab lands
// given its neighbours' midpoints.
describe("dropIndexFor", () => {
  const mids = [50, 150, 250];

  it("takes a slot only once its midpoint is crossed, dragging right", () => {
    expect(dropIndexFor(mids, 0, 60)).toBe(0);
    expect(dropIndexFor(mids, 0, 160)).toBe(1);
    expect(dropIndexFor(mids, 0, 260)).toBe(2);
  });

  it("mirrors that dragging left", () => {
    expect(dropIndexFor(mids, 2, 140)).toBe(1);
    expect(dropIndexFor(mids, 2, 40)).toBe(0);
  });

  it("keeps the tab where it is when no midpoint is crossed", () => {
    expect(dropIndexFor(mids, 1, 150)).toBe(1);
  });
});
