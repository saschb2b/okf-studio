import { describe, it, expect, vi } from "vitest";
import { renderMermaidBlocks } from "./mermaid.ts";

// Real Mermaid cannot lay out text in jsdom (no getBBox), so the library is
// mocked to exercise the pass's contract: what gets replaced, what survives a
// failure, and that both theme renders land. Actual SVG output is covered by
// the in-browser visual check.
vi.mock("mermaid", () => {
  let theme = "default";
  return {
    default: {
      initialize: vi.fn((cfg: { theme?: string }) => {
        if (cfg.theme) theme = cfg.theme;
      }),
      render: vi.fn((id: string, code: string) => {
        if (code.includes("syntax error")) return Promise.reject(new Error("parse error"));
        return Promise.resolve({ svg: `<svg data-id="${id}" data-theme="${theme}"></svg>` });
      }),
    },
  };
});

function frag(html: string): DocumentFragment {
  const tpl = document.createElement("template");
  tpl.innerHTML = html;
  return tpl.content;
}

const FENCE = '<pre><code class="language-mermaid">graph TD; A--&gt;B;</code></pre>';

describe("renderMermaidBlocks", () => {
  it("replaces a mermaid block with a figure holding light and dark renders", async () => {
    const content = frag(FENCE);
    await renderMermaidBlocks(content);
    expect(content.querySelector("pre")).toBeNull();
    const figure = content.querySelector("figure.mermaid-diagram");
    expect(figure).not.toBeNull();
    expect(figure?.querySelector('.mermaid-light svg[data-theme="default"]')).not.toBeNull();
    expect(figure?.querySelector('.mermaid-dark svg[data-theme="dark"]')).not.toBeNull();
  });

  it("gives the two theme renders distinct id namespaces", async () => {
    const content = frag(FENCE);
    await renderMermaidBlocks(content);
    const ids = Array.from(content.querySelectorAll("svg")).map((s) =>
      s.getAttribute("data-id"),
    );
    expect(new Set(ids).size).toBe(2);
  });

  it("keeps the source code block when rendering fails", async () => {
    const content = frag(
      '<pre><code class="language-mermaid">this is a syntax error</code></pre>',
    );
    await renderMermaidBlocks(content);
    expect(content.querySelector("figure")).toBeNull();
    expect(content.querySelector("pre > code")?.textContent).toContain("syntax error");
  });

  it("leaves non-mermaid code blocks untouched", async () => {
    const content = frag('<pre><code class="language-css">.a { color: red; }</code></pre>');
    await renderMermaidBlocks(content);
    expect(content.querySelector("pre > code.language-css")).not.toBeNull();
  });

  it("no-ops on a body without diagrams", async () => {
    const content = frag("<p>hello</p>");
    await renderMermaidBlocks(content);
    expect(content.querySelector("figure")).toBeNull();
  });
});
