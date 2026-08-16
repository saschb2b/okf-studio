import { describe, expect, it } from "vitest";
import {
  auditVisualConsistency,
  formatFindings,
  isEnforced,
  type Finding,
} from "./visualConsistency.ts";

// This module asserts after every story, so a silent failure here disables a
// gate across the whole component library while the run still reports green.
// jsdom performs no layout, so the geometry checks (uneven siblings, hit
// targets, horizontal overflow) measure zero here and are exercised by the
// stories themselves in Chromium. What is covered below is everything that
// reads computed style or is pure.

function mount(html: string): Element {
  const root = document.createElement("div");
  root.innerHTML = html;
  document.body.append(root);
  return root;
}

describe("off-scale spacing", () => {
  it("names the element and the value it found", () => {
    const findings = auditVisualConsistency(
      mount(`<div style="display: grid; row-gap: 7px"><span>a</span></div>`),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0].check).toBe("off-scale spacing");
    expect(findings[0].detail).toContain("7px");
  });

  it("accepts a value on the scale", () => {
    expect(
      auditVisualConsistency(mount(`<div style="display: grid; row-gap: 8px"></div>`)),
    ).toEqual([]);
  });

  it("leaves units it cannot judge alone", () => {
    expect(
      auditVisualConsistency(mount(`<div style="display: grid; row-gap: 5%"></div>`)),
    ).toEqual([]);
  });

  it("ignores what only a screen reader reaches", () => {
    expect(
      auditVisualConsistency(
        mount(`<div class="sr-only"><div style="display: grid; row-gap: 7px"></div></div>`),
      ),
    ).toEqual([]);
  });
});

describe("prose with no measure", () => {
  const long = "word ".repeat(40);

  it("passes over prose short enough not to need one", () => {
    expect(auditVisualConsistency(mount(`<p>${"word ".repeat(5)}</p>`))).toEqual([]);
  });

  it("reports nothing without layout, which is why stories run in a browser", () => {
    // jsdom returns a zero-width rect, so the ch calculation cannot exceed the
    // threshold. Pinning this keeps the jsdom result from being read as a pass.
    expect(auditVisualConsistency(mount(`<p>${long}</p>`))).toEqual([]);
  });
});

describe("the enforcement list", () => {
  it("covers every story title", () => {
    expect(isEnforced("Agent/Conversation/AgentComposer")).toBe(true);
    expect(isEnforced("Shell/EmptyState")).toBe(true);
  });
});

describe("formatFindings", () => {
  it("groups details under the check that produced them", () => {
    const findings: Finding[] = [
      { check: "off-scale spacing", detail: "div row-gap: 7px" },
      { check: "off-scale spacing", detail: "span row-gap: 9px" },
      { check: "prose with no measure", detail: "p is 120ch wide" },
    ];
    const message = formatFindings(findings);
    expect(message).toContain("off-scale spacing");
    expect(message).toContain("prose with no measure");
    expect(message).toContain("7px");
    expect(message).toContain("9px");
  });

  it("survives an empty list", () => {
    expect(() => formatFindings([])).not.toThrow();
  });
});
