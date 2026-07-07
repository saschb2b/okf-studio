import { describe, it, expect } from "vitest";
import { plainExcerpt, renderMarkdown, resolveAssetHref } from "./markdown.ts";

describe("plainExcerpt", () => {
  it("strips markdown syntax down to readable prose", () => {
    const md =
      "## What it does\n\n" +
      "Renders an **interactive** [graph](graph-view.md) of `concepts`.\n\n" +
      "> [!NOTE]\n> Everything is *offline*.\n\n" +
      "- one\n- two\n";
    expect(plainExcerpt(md)).toBe(
      "What it does Renders an interactive graph of concepts. Everything is offline. one two",
    );
  });

  it("drops code fences, tables, and rules; keeps image alt text", () => {
    const md =
      "```ts\nconst x = 1;\n```\n\n" +
      "| a | b |\n| --- | --- |\n| 1 | 2 |\n\n" +
      "---\n\n" +
      "![alt text](pic.png) end.";
    expect(plainExcerpt(md)).toBe("alt text end.");
  });

  it("clamps long text at a word boundary with an ellipsis", () => {
    const md = "word ".repeat(100);
    const out = plainExcerpt(md, 60);
    expect(out.length).toBeLessThanOrEqual(61);
    expect(out.endsWith("…")).toBe(true);
    expect(out).not.toContain("wor…"); // cut between words, not inside one
  });

  it("returns short text unchanged", () => {
    expect(plainExcerpt("Just a line.")).toBe("Just a line.");
    expect(plainExcerpt("")).toBe("");
  });
});

describe("resolveAssetHref", () => {
  it("resolves a relative asset against the concept's directory", () => {
    expect(resolveAssetHref("button.example.html", "components/button")).toBe(
      "components/button.example.html",
    );
    expect(resolveAssetHref("../styles/tokens.css", "components/button.example.html")).toBe(
      "styles/tokens.css",
    );
  });

  it("resolves a bundle-absolute asset from the root", () => {
    expect(resolveAssetHref("/styles/tokens.css", "components/button")).toBe(
      "styles/tokens.css",
    );
  });

  it("keeps the extension (unlike concept-id resolution)", () => {
    expect(resolveAssetHref("x.css", "a/b")).toBe("a/x.css");
  });

  it("strips a trailing anchor or query", () => {
    expect(resolveAssetHref("button.example.html#anchor", "components/button")).toBe(
      "components/button.example.html",
    );
  });

  it("rejects external, data, and root-escaping hrefs", () => {
    expect(resolveAssetHref("https://example.com/x.css", "a/b")).toBeNull();
    expect(resolveAssetHref("data:text/css,body{}", "a/b")).toBeNull();
    expect(resolveAssetHref("../../etc/passwd", "a/b")).toBeNull();
    expect(resolveAssetHref("", "a/b")).toBeNull();
  });
});

describe("renderMarkdown headings", () => {
  it("demotes a body h1 to h2 (the concept title owns the page's h1) with a slug id", () => {
    const html = renderMarkdown("# What it does\n\nBody.");
    expect(html).not.toContain("<h1");
    expect(html).toContain('<h2 id="what-it-does"');
  });

  it("bakes a hover permalink into each heading", () => {
    const html = renderMarkdown("## Composition\n\nBody.");
    expect(html).toContain('id="composition"');
    expect(html).toContain('class="heading-anchor"');
    expect(html).toContain('href="#composition"');
    expect(html).toContain("Link to section: Composition");
  });

  it("dedupes ids across demoted and authored headings", () => {
    const html = renderMarkdown("# Notes\n\n## Notes\n\nBody.");
    expect(html).toContain('id="notes"');
    expect(html).toContain('id="notes-2"');
  });
});

describe("renderMarkdown color decoration", () => {
  it("prefixes a color-valued inline code with a swatch chip", () => {
    const html = renderMarkdown("The accent is `#0969da` today.");
    expect(html).toContain('class="color-chip"');
    expect(html).toContain("background:#0969da");
  });

  it("decorates rgb()/hsl() colors", () => {
    expect(renderMarkdown("`rgb(9, 105, 218)`")).toContain("class=\"color-chip\"");
    expect(renderMarkdown("`hsl(212, 92%, 45%)`")).toContain("class=\"color-chip\"");
  });

  it("leaves non-color code untouched", () => {
    const html = renderMarkdown("Reference `fgColor-default`, not a hex.");
    expect(html).not.toContain("color-chip");
  });

  it("decorates a hex color that appears in plain prose", () => {
    // The value is in parentheses, not in backticks (the Primer Border case).
    const html = renderMarkdown("`borderColor-default` (#d1d9e0) hairlines.");
    expect(html).toContain("background:#d1d9e0");
    expect(html).toContain("color-token");
    // The literal text is preserved beside the chip.
    expect(html).toContain("#d1d9e0");
  });

  it("decorates 8-digit (alpha) hex in prose and leaves a 5-digit run alone", () => {
    expect(renderMarkdown("translucent #818b981f fill")).toContain("background:#818b981f");
    expect(renderMarkdown("not a color #abcde here")).not.toContain("color-chip");
  });

  it("does not decorate hex inside code or links twice", () => {
    // Inside a link, the hex is left as text (links are skipped).
    const html = renderMarkdown("[see #ffffff](https://x.com)");
    expect(html).not.toContain("color-token");
  });

  it("does not inline an unsafe value as a style", () => {
    // A code span that is not a clean color gets no chip and no style attribute;
    // the raw text survives only as escaped code content, never as CSS.
    const html = renderMarkdown("`#fff;background:url(evil)`");
    expect(html).not.toContain("color-chip");
    expect(html).not.toContain('style="background');
  });
});

describe("renderMarkdown token-reference resolution", () => {
  const index = { "colors.primary": "#1f883d", "spacing.md": "16px" };

  it("resolves a color {ref} with a chip and a resolves-to title", () => {
    const html = renderMarkdown("Use `{colors.primary}` here.", index);
    expect(html).toContain("color-chip");
    expect(html).toContain("background:#1f883d");
    expect(html).toContain('title="resolves to #1f883d"');
  });

  it("annotates a non-color {ref} with its value, no chip", () => {
    const html = renderMarkdown("Pad by `{spacing.md}`.", index);
    expect(html).toContain('title="resolves to 16px"');
    expect(html).not.toContain("color-chip");
  });

  it("leaves an unknown {ref} untouched", () => {
    const html = renderMarkdown("`{nope.missing}`", index);
    expect(html).not.toContain("resolves to");
    expect(html).not.toContain("color-chip");
  });

  it("leaves {refs} untouched when no index is given", () => {
    expect(renderMarkdown("`{colors.primary}`")).not.toContain("resolves to");
  });
});

describe("renderMarkdown math placeholders", () => {
  it("wraps inline $…$ in a math placeholder, TeX shielded from markdown", () => {
    const html = renderMarkdown("Euler: $e^{i\\pi} + 1 = 0$ done.");
    expect(html).toContain('class="math math-inline"');
    expect(html).toContain("e^{i\\pi} + 1 = 0");
  });

  it("keeps TeX subscripts literal (underscores never become <em>)", () => {
    const html = renderMarkdown("$a_i + b_j$ and $x_1 x_2$");
    expect(html).not.toContain("<em>");
  });

  it("renders a $$ block as display math", () => {
    const html = renderMarkdown("Before.\n\n$$\n\\frac{a}{b} = c\n$$\n\nAfter.");
    expect(html).toContain('class="math math-block"');
    expect(html).toContain("\\frac{a}{b} = c");
  });

  it("treats mid-paragraph $$…$$ as display math too", () => {
    const html = renderMarkdown("The identity $$e^{i\\pi} = -1$$ holds.");
    expect(html).toContain('class="math math-block"');
  });

  it("leaves currency amounts and spaced dollars alone", () => {
    expect(renderMarkdown("It costs $5 and $10 today.")).not.toContain("math");
    expect(renderMarkdown("pay $ 20 $ now")).not.toContain("math");
  });

  it("leaves $ inside code spans and fences alone", () => {
    expect(renderMarkdown("`$x$`")).not.toContain("math-inline");
    expect(renderMarkdown("```\n$x$\n```")).not.toContain("math-inline");
  });

  it("escapes HTML metacharacters inside TeX", () => {
    const html = renderMarkdown("$a<b$");
    expect(html).toContain("a&lt;b");
    expect(html).not.toContain("<b$");
  });

  it("does not decorate a hex color inside TeX with a swatch", () => {
    const html = renderMarkdown("$\\color{#ff0000}{x}$");
    expect(html).not.toContain("color-chip");
  });

  it("renders an escaped \\$ as a literal dollar, not math", () => {
    expect(renderMarkdown("a \\$5 bill and \\$10 more")).not.toContain("math");
  });
});

describe("plainExcerpt math", () => {
  it("drops display math and unwraps inline math delimiters", () => {
    const md = "Energy: $E = mc^2$.\n\n$$\n\\int_0^1 x\\,dx\n$$\n\nDone.";
    expect(plainExcerpt(md)).toBe("Energy: E = mc^2. Done.");
  });

  it("leaves currency untouched", () => {
    expect(plainExcerpt("It costs $5 and $10 today.")).toBe("It costs $5 and $10 today.");
  });
});

describe("renderMarkdown image neutralization", () => {
  it("moves a non-data src to data-mdsrc so nothing auto-loads", () => {
    const html = renderMarkdown("![Diagram](diagram.svg)");
    expect(html).toContain('data-mdsrc="diagram.svg"');
    // The original src is removed (no auto-fetch of a local/remote image).
    expect(html).not.toMatch(/<img[^>]*\ssrc=/);
  });

  it("leaves an inline data: image's src intact", () => {
    const html = renderMarkdown("![x](data:image/png;base64,iVBORw0KGgo=)");
    expect(html).toContain('src="data:image/png;base64,iVBORw0KGgo="');
    expect(html).not.toContain("data-mdsrc");
  });
});
