import { describe, it, expect } from "vitest";
import linkCorpusJson from "@/test/fixtures/markdown-link-corpus.json?raw";
import { plainExcerpt, renderMarkdown, resolveAssetHref, resolveHref } from "@/shared/render/markdown.ts";

interface LinkCorpusCase {
  name: string;
  markdown: string;
  sourceId: string;
  conceptIds: string[];
  expectedConcepts: string[];
  expectedExternal: string[];
}

const linkCorpus = JSON.parse(linkCorpusJson) as { cases: LinkCorpusCase[] };

describe("Markdown link compatibility corpus", () => {
  it.each(linkCorpus.cases)("matches Rust targets for $name", (testCase) => {
    const template = document.createElement("template");
    template.innerHTML = renderMarkdown(testCase.markdown);
    const concepts = new Set<string>();
    const external = new Set<string>();

    for (const anchor of template.content.querySelectorAll("a")) {
      const href = anchor.getAttribute("href");
      if (!href) continue;
      const resolved = resolveHref(href, testCase.sourceId);
      if (resolved.kind === "concept" && testCase.conceptIds.includes(resolved.id)) {
        concepts.add(resolved.id);
      } else if (resolved.kind === "external") {
        external.add(resolved.url);
      }
    }

    expect([...concepts]).toEqual(testCase.expectedConcepts);
    expect([...external]).toEqual(testCase.expectedExternal);
  });
});

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

describe("renderMarkdown long responses", () => {
  it("keeps the beginning and end of a long structured agent response", () => {
    const rows = Array.from(
      { length: 2_000 },
      (_, index) => `${index + 1}. **Finding ${index + 1}:** \`concepts/item-${index + 1}.md\``,
    );
    const html = renderMarkdown(`# Research result\n\n${rows.join("\n")}`);

    expect(html).toContain("Research result");
    expect(html).toContain("Finding 1:");
    expect(html).toContain("Finding 2000:");
    expect(html).not.toContain("<script");
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

describe("renderMarkdown task lists", () => {
  it("renders GFM checkboxes, disabled, with checked state preserved", () => {
    const html = renderMarkdown("- [x] done\n- [ ] open\n");
    expect(html.match(/type="checkbox"/g)).toHaveLength(2);
    expect(html.match(/disabled/g)).toHaveLength(2);
    expect(html.match(/checked/g)).toHaveLength(1);
  });
});

describe("renderMarkdown footnotes", () => {
  const MD = "A claim.[^1]\n\nPlain text.\n\n[^1]: The **evidence**.";

  it("links a [^ref] to a footnotes section and back", () => {
    const html = renderMarkdown(MD);
    expect(html).toContain('href="#footnote-1"');
    expect(html).toContain('id="footnote-1"');
    expect(html).toContain("data-footnote-backref");
    expect(html).toContain("<strong>evidence</strong>");
  });

  it("keeps the section heading's aria contract out of the outline pass", () => {
    const html = renderMarkdown(MD);
    // The id every ref's aria-describedby points at survives un-slugged…
    expect(html).toContain('id="footnote-label"');
    // …visible (no sr-only), and without a baked permalink.
    expect(html).not.toContain("sr-only");
    expect(html).not.toContain('href="#footnotes"');
  });

  it("leaves plain [bracketed] text alone", () => {
    expect(renderMarkdown("see [ref] and [^]")).not.toContain("footnote");
  });
});

describe("renderMarkdown definition lists", () => {
  it("renders term/definition groups as dl/dt/dd with inline markdown", () => {
    const html = renderMarkdown("Bundle\n: A **directory** of concepts.\n: Portable too.\nConcept\n: One `.md` file.\n");
    expect(html).toContain("<dl>");
    expect(html).toContain("<dt>Bundle</dt>");
    expect(html.match(/<dd>/g)).toHaveLength(3);
    expect(html).toContain("<strong>directory</strong>");
    expect(html).toContain("<dt>Concept</dt>");
  });

  it("folds a lazily-continued (indented) line into its definition", () => {
    const html = renderMarkdown(
      "Lifetime value\n: A customer's summed totals\n  over [orders](orders.md).\nOrder\n: A completed checkout.\n",
    );
    expect(html.match(/<dl>/g)).toHaveLength(1); // one list, not split by the wrap
    expect(html).toContain("summed totals over");
    expect(html).toContain("<dt>Order</dt>");
  });

  it("does not fire on plain paragraphs or mid-line colons", () => {
    expect(renderMarkdown("Ratio is 3:1 today.\n\nNext line.")).not.toContain("<dl>");
    expect(renderMarkdown("No definitions here.")).not.toContain("<dl>");
  });
});

describe("renderMarkdown emoji shortcodes", () => {
  it("replaces known shortcodes with unicode", () => {
    const html = renderMarkdown("Ship it :rocket: with :+1:");
    expect(html).toContain("🚀");
    expect(html).toContain("👍");
  });

  it("leaves unknown names, code spans, and bare colons literal", () => {
    expect(renderMarkdown("a :not_an_emoji_xyz: b")).toContain(":not_an_emoji_xyz:");
    expect(renderMarkdown("`:rocket:`")).not.toContain("🚀");
    expect(renderMarkdown("at 10:30 sharp")).toContain("10:30");
  });
});

describe("plainExcerpt advanced syntax", () => {
  it("strips footnote refs and definition markers, keeps prose", () => {
    expect(plainExcerpt("A claim.[^1]\n\n[^1]: Fine print.")).toBe("A claim. Fine print.");
  });

  it("drops task-list checkboxes with their markers", () => {
    expect(plainExcerpt("- [x] shipped\n- [ ] pending")).toBe("shipped pending");
  });

  it("unwraps definition lists and converts emoji", () => {
    expect(plainExcerpt("Bundle\n: A folder :rocket:")).toBe("Bundle A folder 🚀");
  });
});

describe("renderMarkdown embedded HTML", () => {
  it("keeps semantic inline elements", () => {
    const html = renderMarkdown(
      'Press <kbd>Ctrl</kbd>+<kbd>K</kbd>, <mark>marked</mark>, <abbr title="HyperText">HTML</abbr>, x<sup>2</sup>, H<sub>2</sub>O.',
    );
    for (const tag of ["<kbd>", "<mark>", "<abbr", "<sup>", "<sub>"]) {
      expect(html).toContain(tag);
    }
  });

  it("keeps details/summary and processes the markdown inside", () => {
    const html = renderMarkdown("<details>\n<summary>More</summary>\n\nSome **bold**.\n\n</details>");
    expect(html).toContain("<details>");
    expect(html).toContain("<summary>More</summary>");
    expect(html).toContain("<strong>bold</strong>");
  });

  it("keeps styled spans/divs but drops out-of-flow positioning", () => {
    const styled = renderMarkdown('<span style="color: #1f883d">green</span>');
    expect(styled).toContain("color:");
    const escape = renderMarkdown(
      '<div style="position: fixed; top: 0; color: red">overlay</div>',
    );
    expect(escape).not.toContain("position");
    expect(escape).toContain("color:"); // the rest of the style survives
  });

  it("routes a raw-HTML heading through the outline pass", () => {
    const html = renderMarkdown("<h2>Raw Section</h2>");
    expect(html).toContain('id="raw-section"');
    expect(html).toContain("heading-anchor");
  });

  it("strips script, event handlers, iframes, and comments", () => {
    expect(renderMarkdown("<script>alert(1)</script>safe")).not.toContain("script");
    expect(renderMarkdown('<a href="x.md" onclick="alert(1)">x</a>')).not.toContain("onclick");
    expect(renderMarkdown('<iframe src="https://e.com"></iframe>ok')).not.toContain("iframe");
    expect(renderMarkdown("a <!-- secret --> b")).not.toContain("secret");
  });

  it("neutralizes every fetching attribute on embedded media", () => {
    const img = renderMarkdown('<img src="a.png" srcset="a-2x.png 2x" alt="x">');
    expect(img).toContain('data-mdsrc="a.png"');
    expect(img).not.toContain("srcset");
    const video = renderMarkdown('<video src="v.mp4" poster="p.png" controls></video>');
    expect(video).not.toContain("v.mp4");
    expect(video).not.toContain("p.png");
    const source = renderMarkdown("<audio><source src='https://e.com/a.mp3'></audio>");
    expect(source).not.toContain("e.com");
  });
});

describe("plainExcerpt embedded HTML", () => {
  it("drops tags but keeps their text; comments vanish; prose < survives", () => {
    expect(plainExcerpt("Press <kbd>Ctrl</kbd>+<kbd>K</kbd> <!-- note --> to search.")).toBe(
      "Press Ctrl+K to search.",
    );
    expect(plainExcerpt("proves a < b holds")).toBe("proves a < b holds");
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
