import { describe, it, expect } from "vitest";
import { highlightCodeBlocks } from "@/render/highlight.ts";

function frag(html: string): DocumentFragment {
  const tpl = document.createElement("template");
  tpl.innerHTML = html;
  return tpl.content;
}

describe("highlightCodeBlocks", () => {
  it("replaces a known-language code block with Shiki dual-theme markup", async () => {
    const content = frag('<pre><code class="language-css">.a { color: red; }</code></pre>');
    await highlightCodeBlocks(content);
    const pre = content.querySelector("pre");
    expect(pre?.classList.contains("shiki")).toBe(true);
    // defaultColor:false emits --shiki-light/--shiki-dark vars for theme switching.
    expect(pre?.getAttribute("style")).toMatch(/--shiki-dark/);
    expect(content.querySelector(".shiki span[style]")?.getAttribute("style")).toMatch(
      /--shiki-dark/,
    );
  });

  it("falls back to a plain themed block for an unknown language", async () => {
    const content = frag('<pre><code class="language-nope-lang">x = 1</code></pre>');
    await highlightCodeBlocks(content);
    expect(content.querySelector("pre")?.classList.contains("shiki")).toBe(true);
  });

  it("no-ops when there are no code blocks", async () => {
    const content = frag("<p>hello</p>");
    await highlightCodeBlocks(content);
    expect(content.querySelector("pre")).toBeNull();
  });
});
