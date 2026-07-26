import { describe, it, expect, vi, beforeAll } from "vitest";
import { renderMermaidBlocks } from "@/shared/render/mermaid.ts";

// Real Mermaid cannot lay out text in jsdom (no getBBox), so the library is
// mocked to exercise the pass's contract: what gets replaced, what survives a
// failure, and that both theme renders land carrying the palette they were
// given. Actual SVG output is covered by the in-browser visual check.
vi.mock("mermaid", () => {
  let vars: Record<string, unknown> = {};
  return {
    default: {
      initialize: vi.fn((cfg: { themeVariables?: Record<string, unknown> }) => {
        if (cfg.themeVariables) vars = cfg.themeVariables;
      }),
      render: vi.fn((id: string, code: string) => {
        if (code.includes("syntax error")) return Promise.reject(new Error("parse error"));
        return Promise.resolve({
          svg:
            `<svg data-id="${id}" data-dark="${String(vars.darkMode)}"` +
            ` data-bg="${String(vars.background)}"></svg>`,
        });
      }),
    },
  };
});

// The token layer is a stylesheet the jsdom lane does not load, so stand in for
// it on the root. readTokenPairs reads whatever is there, which is enough to
// prove the palette reaches Mermaid rather than being invented in mermaid.ts.
// Set before the first render: the resolved pairs are cached for the session.
const BG_ELEV = "#123456";
beforeAll(() => {
  document.documentElement.style.setProperty("--bg-elev", BG_ELEV);
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
    expect(figure?.querySelector('.mermaid-light svg[data-dark="false"]')).not.toBeNull();
    expect(figure?.querySelector('.mermaid-dark svg[data-dark="true"]')).not.toBeNull();
  });

  it("builds both palettes from the theme tokens", async () => {
    const content = frag(FENCE);
    await renderMermaidBlocks(content);
    for (const svg of Array.from(content.querySelectorAll("svg"))) {
      expect(svg.getAttribute("data-bg")).toBe(BG_ELEV);
    }
  });

  it("leaves the root's theme attribute as it found it", async () => {
    // Resolving both palettes flips data-theme on the root and must put it back;
    // a leak here would strand the whole window in the wrong theme.
    document.documentElement.dataset.theme = "dark";
    await renderMermaidBlocks(frag(FENCE));
    expect(document.documentElement.dataset.theme).toBe("dark");
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
