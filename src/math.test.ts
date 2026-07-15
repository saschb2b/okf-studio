import { describe, it, expect } from "vitest";
import { renderMathBlocks } from "@/math.ts";

function frag(html: string): DocumentFragment {
  const tpl = document.createElement("template");
  tpl.innerHTML = html;
  return tpl.content;
}

describe("renderMathBlocks", () => {
  it("typesets an inline placeholder with KaTeX markup", async () => {
    const content = frag('<p><span class="math math-inline">e^{i\\pi} + 1 = 0</span></p>');
    await renderMathBlocks(content);
    expect(content.querySelector(".katex")).not.toBeNull();
    // output:"html" — no MathML branch in the markup.
    expect(content.querySelector("math")).toBeNull();
  });

  it("typesets a block placeholder in display mode", async () => {
    const content = frag('<span class="math math-block">\\frac{a}{b}</span>');
    await renderMathBlocks(content);
    expect(content.querySelector(".katex-display")).not.toBeNull();
  });

  it("keeps invalid TeX visible instead of dropping it", async () => {
    const content = frag('<span class="math math-inline">\\frac{a}{</span>');
    await renderMathBlocks(content);
    // throwOnError:false renders a best-effort error span; the source survives.
    expect(content.textContent).toContain("\\frac{a}{");
  });

  it("is idempotent across repeated passes", async () => {
    const content = frag('<span class="math math-inline">x^2</span>');
    await renderMathBlocks(content);
    const once = content.querySelectorAll(".katex").length;
    await renderMathBlocks(content);
    expect(content.querySelectorAll(".katex").length).toBe(once);
  });

  it("no-ops when there is no math", async () => {
    const content = frag("<p>hello</p>");
    await renderMathBlocks(content);
    expect(content.querySelector(".katex")).toBeNull();
  });
});
